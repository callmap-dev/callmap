package main

import (
	"os"
	"path/filepath"
	"regexp"
	"slices"
	"strings"
)

// A go.work that git does not track decides how the go tool loads the modules of the branch, so the
// base loads them the same way.
var goWorkspaceFiles = []string{"go.work", "go.work.sum"}

func pathInWorktree(path string, roots []string, worktree string) string {
	for _, root := range roots {
		if path == root || strings.HasPrefix(path, root+"/") {
			return worktree + path[len(root):]
		}
	}
	return path
}

var (
	goWorkDirective = regexp.MustCompile(`^(\s*(use|replace)\b)(.*)$`)
	goWorkPath      = regexp.MustCompile("\"([^\"]*)\"|`([^`]*)`|([^\\s\"`()]+)")
	goWorkBlockOpen = regexp.MustCompile(`^\s*\(\s*(//.*)?$`)
)

func rewriteFirstPath(text string, roots []string, worktree string) string {
	found := goWorkPath.FindStringSubmatchIndex(text)
	if found == nil {
		return text
	}
	for group := 1; group <= 3; group++ {
		start, end := found[2*group], found[2*group+1]
		if start >= 0 {
			return text[:start] + pathInWorktree(text[start:end], roots, worktree) + text[end:]
		}
	}
	return text
}

func rewriteGoWorkEntry(directive string, text string, roots []string, worktree string) string {
	if directive == "use" {
		return rewriteFirstPath(text, roots, worktree)
	}
	arrow := strings.Index(text, "=>")
	if arrow == -1 {
		return text
	}
	return text[:arrow+2] + rewriteFirstPath(text[arrow+2:], roots, worktree)
}

func goWorkOfWorktree(goWork string, root string, worktree string) string {
	roots := []string{root}
	if real, err := filepath.EvalSymlinks(root); err == nil {
		roots = append(roots, real)
	}
	block := ""
	lines := strings.Split(goWork, "\n")
	for index, line := range lines {
		if block != "" {
			if strings.HasPrefix(strings.TrimSpace(line), ")") {
				block = ""
			} else {
				lines[index] = rewriteGoWorkEntry(block, line, roots, worktree)
			}
			continue
		}
		found := goWorkDirective.FindStringSubmatch(line)
		if found == nil {
			continue
		}
		before, directive, rest := found[1], found[2], found[3]
		if goWorkBlockOpen.MatchString(rest) {
			block = directive
			continue
		}
		lines[index] = before + rewriteGoWorkEntry(directive, rest, roots, worktree)
	}
	return strings.Join(lines, "\n")
}

func copyGoWorkspaceFiles(worktree baseWorktree) error {
	for _, file := range goWorkspaceFiles {
		if !slices.Contains(worktree.untrackedEntries, file) {
			continue
		}
		copied := filepath.Join(worktree.path, file)
		if _, err := os.Stat(copied); err == nil {
			continue
		}
		text, err := os.ReadFile(filepath.Join(worktree.checkout, file))
		if err != nil {
			return err
		}
		if file == "go.work" {
			text = []byte(goWorkOfWorktree(string(text), worktree.checkout, worktree.path))
		}
		if err := os.WriteFile(copied, text, 0o644); err != nil {
			return err
		}
	}
	return nil
}
