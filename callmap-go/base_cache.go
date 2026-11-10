package main

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	"os/exec"
	"path/filepath"
	"slices"
	"strings"
	"sync"
	"time"

	"github.com/callmap-dev/callmap/callmap-go/internal/extractor"
	"github.com/callmap-dev/callmap/callmap-go/internal/scope"
)

const entriesForEachRepo = 20

// The dependency files of Go, as the glossary lists them.
var goDependencyFiles = []string{"go.work", "**/go.sum", "**/go.work.sum"}

var goBuildSettings = []string{"CGO_ENABLED", "GOOS", "GOARCH", "GOEXPERIMENT", "GOFLAGS"}

type baseKey struct {
	repo     string
	checkout string
	commit   string
	scope    []string
}

func sha256Of(text []byte) string {
	sum := sha256.Sum256(text)
	return hex.EncodeToString(sum[:])
}

func cacheFolder() (string, error) {
	if home := os.Getenv("XDG_CACHE_HOME"); filepath.IsAbs(home) {
		return filepath.Join(home, command), nil
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(home, ".cache", command), nil
}

// The go env settings that choose the files of one build, as the load of the repo sees them.
func goBuildSettingsOf() []string {
	goEnv := exec.Command("go", append([]string{"env"}, goBuildSettings...)...)
	goEnv.Env = append(os.Environ(), "GOTOOLCHAIN=local")
	out, _ := goEnv.Output()
	values := strings.Split(string(out), "\n")
	settings := make([]string, 0, len(goBuildSettings))
	for index, setting := range goBuildSettings {
		value := ""
		if index < len(values) {
			value = values[index]
		}
		if setting == "GOFLAGS" {
			value = extractor.KeptGoFlags(value)
		}
		settings = append(settings, setting+"="+value)
	}
	return settings
}

// The version of callmap-go is the hash of its own executable, so each build of a checkout keys its
// own entries, and so does each go that builds it.
var distributionVersion = sync.OnceValues(func() (string, error) {
	executable, err := os.Executable()
	if err != nil {
		return "", err
	}
	file, err := os.Open(executable)
	if err != nil {
		return "", err
	}
	defer file.Close()
	hash := sha256.New()
	if _, err := io.Copy(hash, file); err != nil {
		return "", err
	}
	return hex.EncodeToString(hash.Sum(nil)), nil
})

func isUnreadable(err error) bool {
	return errors.Is(err, fs.ErrPermission)
}

func filesBelow(folder string, prefix string) ([]string, error) {
	entries, err := os.ReadDir(folder)
	if err != nil {
		if prefix != "" && isUnreadable(err) {
			return nil, nil
		}
		return nil, err
	}
	files := []string{}
	for _, entry := range entries {
		path := prefix + entry.Name()
		switch {
		case entry.IsDir():
			if isSkippedDirectory(entry.Name()) {
				continue
			}
			below, err := filesBelow(filepath.Join(folder, entry.Name()), path+"/")
			if err != nil {
				return nil, err
			}
			files = append(files, below...)
		case entry.Type().IsRegular():
			files = append(files, path)
		}
	}
	return files, nil
}

func isPattern(glob string) bool {
	return strings.ContainsAny(glob, "*?")
}

func dependencyHashOf(checkout string) (string, error) {
	walked, err := filesBelow(checkout, "")
	if err != nil {
		return "", err
	}
	slices.Sort(walked)
	hash := sha256.New()
	for _, glob := range goDependencyFiles {
		names := []string{glob}
		if isPattern(glob) {
			names = slices.DeleteFunc(slices.Clone(walked), func(path string) bool {
				return !scope.InScope(path, []string{glob})
			})
		}
		for _, name := range names {
			text, err := os.ReadFile(filepath.Join(checkout, filepath.FromSlash(name)))
			if errors.Is(err, fs.ErrNotExist) {
				continue
			}
			if err != nil {
				return "", err
			}
			hash.Write([]byte(name + "\x00"))
			hash.Write(text)
			hash.Write([]byte("\x00"))
		}
	}
	return hex.EncodeToString(hash.Sum(nil)), nil
}

func entryNameOf(key baseKey) (string, error) {
	dependencies, err := dependencyHashOf(key.checkout)
	if err != nil {
		return "", err
	}
	version, err := distributionVersion()
	if err != nil {
		return "", err
	}
	parts, err := json.Marshal([]any{"go", key.commit, key.scope, goBuildSettingsOf(), dependencies, version})
	if err != nil {
		return "", err
	}
	return sha256Of(parts), nil
}

func cachedAt(entry string) (extractor.Document, bool) {
	text, err := os.ReadFile(entry)
	if err != nil {
		return extractor.Document{}, false
	}
	decoder := json.NewDecoder(bytes.NewReader(text))
	decoder.DisallowUnknownFields()
	var cached extractor.Document
	if decoder.Decode(&cached) != nil || !cached.Complete() {
		return extractor.Document{}, false
	}
	now := time.Now()
	os.Chtimes(entry, now, now)
	return cached, true
}

func keepNewest(folder string) error {
	entries, err := os.ReadDir(folder)
	if err != nil {
		return err
	}
	type aged struct {
		path string
		time time.Time
	}
	stored := []aged{}
	for _, entry := range entries {
		if !strings.HasSuffix(entry.Name(), ".json") {
			continue
		}
		info, err := entry.Info()
		if err != nil {
			continue
		}
		stored = append(stored, aged{filepath.Join(folder, entry.Name()), info.ModTime()})
	}
	slices.SortFunc(stored, func(first aged, second aged) int {
		if order := second.time.Compare(first.time); order != 0 {
			return order
		}
		return strings.Compare(first.path, second.path)
	})
	for _, old := range stored[min(len(stored), entriesForEachRepo):] {
		os.Remove(old.path)
	}
	return nil
}

// A failed write is not an error, so the review goes on without the entry.
func store(folder string, entry string, document extractor.Document) {
	if os.MkdirAll(folder, 0o755) != nil {
		return
	}
	text, err := json.Marshal(document)
	if err != nil {
		return
	}
	partial := fmt.Sprintf("%s.%d.partial", entry, os.Getpid())
	if os.WriteFile(partial, text, 0o644) != nil {
		return
	}
	if os.Rename(partial, entry) != nil {
		os.Remove(partial)
		return
	}
	keepNewest(folder)
}

func throughBaseCache(key baseKey, read func() (extractor.Document, error)) (extractor.Document, error) {
	home, err := cacheFolder()
	if err != nil {
		return extractor.Document{}, err
	}
	folder := filepath.Join(home, sha256Of([]byte(key.repo)))
	name, err := entryNameOf(key)
	if err != nil {
		return extractor.Document{}, err
	}
	entry := filepath.Join(folder, name+".json")
	if cached, found := cachedAt(entry); found {
		return cached, nil
	}
	document, err := read()
	if err != nil {
		return extractor.Document{}, err
	}
	store(folder, entry, document)
	return document, nil
}
