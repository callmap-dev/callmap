package extractor

import (
	"errors"
	"io/fs"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
)

// SkipsFolder names the folders that hold no source of the repo that the extractor reads. The pattern ./... of the go
// tool skips testdata and a directory whose name starts with _, vendor holds other people's
// modules, and a dot directory holds a tool's bookkeeping.
func SkipsFolder(name string) bool {
	return name == "vendor" || name == "testdata" || name == "node_modules" ||
		strings.HasPrefix(name, ".") || strings.HasPrefix(name, "_")
}

// tree is what one walk of the repo finds: every Go file, the directory of every go.mod, and the
// untracked paths that git ignores, all by repo-relative path. The root directory is the empty
// path.
type tree struct {
	files      []string
	moduleDirs []string
	ignored    map[string]bool
}

// ignores tells whether git ignores the path or one of its folders below the root.
func (found tree) ignores(path string) bool {
	for ; path != "." && path != "/"; path = filepath.ToSlash(filepath.Dir(path)) {
		if found.ignored[path] {
			return true
		}
	}
	return false
}

// ignoredPathsOf is the set of untracked paths that git ignores, by repo-relative path. A repo that
// is not a git repo ignores nothing. An ignored folder can hold the data of a container that
// another user owns, so the walk must not open it. The TypeScript and Ruby extractors have their
// own copies of this reader.
func ignoredPathsOf(repo string) map[string]bool {
	command := exec.Command("git", "ls-files", "--others", "--ignored", "--exclude-standard", "--directory", "-z")
	command.Dir = repo
	output, err := command.Output()
	ignored := map[string]bool{}
	if err != nil {
		return ignored
	}
	for _, path := range strings.Split(string(output), "\x00") {
		if path != "" {
			ignored[strings.TrimSuffix(path, "/")] = true
		}
	}
	return ignored
}

// walk reads the repo once. It does not enter a path that git ignores, or a folder below the root
// that it cannot read. A symbolic link is not followed, so a link out of the repo cannot pull a
// foreign file in and a link back into it cannot walk forever.
func walk(repo string) (tree, error) {
	found := tree{files: []string{}, moduleDirs: []string{}, ignored: ignoredPathsOf(repo)}
	err := filepath.WalkDir(repo, func(path string, entry fs.DirEntry, err error) error {
		if err != nil {
			if path != repo && entry != nil && entry.IsDir() && errors.Is(err, fs.ErrPermission) {
				return filepath.SkipDir
			}
			return err
		}
		relative, err := filepath.Rel(repo, path)
		if err != nil {
			return err
		}
		relative = filepath.ToSlash(relative)
		if relative != "." && found.ignored[relative] {
			if entry.IsDir() {
				return filepath.SkipDir
			}
			return nil
		}
		if entry.IsDir() {
			if relative != "." && SkipsFolder(entry.Name()) {
				return filepath.SkipDir
			}
			return nil
		}
		if !entry.Type().IsRegular() {
			return nil
		}
		if entry.Name() == "go.mod" {
			found.moduleDirs = append(found.moduleDirs, dirOf(relative))
		} else if strings.HasSuffix(entry.Name(), ".go") {
			found.files = append(found.files, relative)
		}
		return nil
	})
	sort.Strings(found.files)
	return found, err
}

// dirOf is the directory of a repo-relative path, with the root as the empty path.
func dirOf(path string) string {
	dir := filepath.ToSlash(filepath.Dir(path))
	if dir == "." {
		return ""
	}
	return dir
}
