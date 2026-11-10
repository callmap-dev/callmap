package main

import (
	"fmt"
	"regexp"
	"slices"
	"strings"

	"github.com/callmap-dev/callmap/callmap-go/internal/extractor"
	"github.com/callmap-dev/callmap/callmap-go/internal/scope"
)

// isSkippedDirectory is the list of packages/scope/src/skipped.ts: the folders that no walk of a
// review enters.
func isSkippedDirectory(name string) bool {
	return name == "node_modules" || name == "vendor" || strings.HasPrefix(name, ".")
}

func folderOf(path string) string {
	if slash := strings.LastIndex(path, "/"); slash >= 0 {
		return path[:slash]
	}
	return ""
}

func isInReviewScope(path string, effective []string) bool {
	folders := strings.Split(path, "/")
	return !slices.ContainsFunc(folders[:len(folders)-1], isSkippedDirectory) && scope.InScope(path, effective)
}

func isGoMod(path string) bool {
	return path == "go.mod" || strings.HasSuffix(path, "/go.mod")
}

func goWalkReads(path string, moduleFolders map[string]bool) bool {
	if !strings.HasSuffix(path, ".go") {
		return false
	}
	folders := strings.Split(path, "/")
	folders = folders[:len(folders)-1]
	if slices.ContainsFunc(folders, extractor.SkipsFolder) {
		return false
	}
	for index := range folders {
		if moduleFolders[strings.Join(folders[:index+1], "/")] {
			return true
		}
	}
	return moduleFolders[""]
}

func readsGoFiles(inScope []string, files []string) bool {
	moduleFolders := map[string]bool{}
	for _, path := range files {
		if isGoMod(path) {
			moduleFolders[folderOf(path)] = true
		}
	}
	return slices.ContainsFunc(inScope, func(path string) bool { return goWalkReads(path, moduleFolders) })
}

type otherLanguage struct {
	name         string
	distribution string
	file         *regexp.Regexp
}

// The files of the languages of the other distributions, as docs/command-contract.md gives them.
var otherLanguages = []otherLanguage{
	{name: "TypeScript", distribution: "callmap-ts", file: regexp.MustCompile(`\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$`)},
	{name: "Ruby", distribution: "callmap-rb", file: regexp.MustCompile(`\.rb$`)},
}

func otherLanguageLinesOf(inScope []string) []string {
	lines := []string{}
	for _, other := range otherLanguages {
		if slices.ContainsFunc(inScope, other.file.MatchString) {
			lines = append(lines, fmt.Sprintf("%s read only the Go files. Run %s review for the %s files.", command, other.distribution, other.name))
		}
	}
	return lines
}
