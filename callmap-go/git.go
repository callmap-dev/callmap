package main

import (
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
)

func gitOutput(dir string, args ...string) (string, error) {
	git := exec.Command("git", args...)
	git.Dir = dir
	git.Stdin = nil
	out, err := git.Output()
	return string(out), err
}

func gitTrimmed(dir string, args ...string) (string, error) {
	out, err := gitOutput(dir, args...)
	return strings.TrimSpace(out), err
}

func gitOr(message string, dir string, args ...string) (string, error) {
	out, err := gitTrimmed(dir, args...)
	if err != nil {
		return "", errors.New(message)
	}
	return out, nil
}

func gitSucceeds(dir string, args ...string) bool {
	_, err := gitOutput(dir, args...)
	return err == nil
}

func repoRootOf(path string) (string, error) {
	return gitOr(fmt.Sprintf("%s is not inside a git repo", path), path, "rev-parse", "--show-toplevel")
}

func commonDirOf(root string) (string, error) {
	dir, err := gitTrimmed(root, "rev-parse", "--path-format=absolute", "--git-common-dir")
	if err != nil {
		return "", err
	}
	return filepath.EvalSymlinks(dir)
}

var remoteHead = regexp.MustCompile(`^refs/remotes/(.+)/HEAD$`)

func remoteHeadsOf(root string) ([]string, error) {
	refs, err := gitTrimmed(root, "for-each-ref", "--format=%(refname)", "refs/remotes/")
	if err != nil {
		return nil, err
	}
	origin := []string{}
	others := []string{}
	for _, ref := range strings.Split(refs, "\n") {
		found := remoteHead.FindStringSubmatch(ref)
		if found == nil {
			continue
		}
		if found[1] == "origin" {
			origin = append(origin, ref)
		} else {
			others = append(others, ref)
		}
	}
	heads := []string{}
	for _, head := range append(origin, others...) {
		if gitSucceeds(root, "symbolic-ref", "--quiet", head) {
			heads = append(heads, head)
		}
	}
	return heads, nil
}

func defaultBranchOf(root string) (string, error) {
	heads, err := remoteHeadsOf(root)
	if err != nil {
		return "", err
	}
	if len(heads) > 0 {
		return gitTrimmed(root, "symbolic-ref", "--quiet", "--short", heads[0])
	}
	for _, branch := range []string{"main", "master"} {
		if gitSucceeds(root, "rev-parse", "--verify", "--quiet", "refs/heads/"+branch) {
			return branch, nil
		}
	}
	return "", fmt.Errorf("%s has no remote head, no main and no master to find a base on. Name one with --base.", root)
}

func mergeBaseOf(root string, branch string) (string, error) {
	return gitOr(fmt.Sprintf("HEAD shares no commit with %s in %s", branch, root), root, "merge-base", "HEAD", branch)
}

func commitOf(root string, revision string) (string, error) {
	return gitOr(fmt.Sprintf("the base '%s' is not a commit in %s", revision, root), root, "rev-parse", "--verify", "--quiet", revision+"^{commit}")
}

func branchNameOf(root string) *string {
	if !gitSucceeds(root, "symbolic-ref", "--quiet", "HEAD") {
		return nil
	}
	name, err := gitTrimmed(root, "symbolic-ref", "--quiet", "--short", "HEAD")
	if err != nil {
		return nil
	}
	return &name
}

// git grows the length of --short with the object count, so 2 clones of the same commits can differ.
const shortCommitLength = 7

func shortCommitOf(root string, commit string) (string, error) {
	return gitTrimmed(root, "rev-parse", fmt.Sprintf("--short=%d", shortCommitLength), commit)
}

func pathsOf(listing string) []string {
	paths := []string{}
	for _, path := range strings.Split(listing, "\x00") {
		if path != "" {
			paths = append(paths, path)
		}
	}
	return paths
}

func gitPaths(root string, args ...string) ([]string, error) {
	out, err := gitOutput(root, args...)
	return pathsOf(out), err
}

func workingTreeFilesOf(root string) ([]string, error) {
	return gitPaths(root, "ls-files", "--cached", "--others", "--exclude-standard", "-z")
}

const statusCodeLength = len("XY ")

func uncommittedFilesOf(root string) ([]string, error) {
	entries, err := gitPaths(root, "--no-optional-locks", "status", "--porcelain=v1", "-z", "--no-renames", "--untracked-files=all")
	files := make([]string, 0, len(entries))
	for _, entry := range entries {
		files = append(files, entry[statusCodeLength:])
	}
	return files, err
}

func changedFilesOf(root string, commit string) ([]string, error) {
	return gitPaths(root, "diff", "--name-only", "--no-renames", "-z", commit)
}

func filesAtCommit(root string, commit string) ([]string, error) {
	return gitPaths(root, "ls-tree", "-r", "--name-only", "-z", commit)
}

func fileAt(root string, commit string, file string) (string, error) {
	return gitOutput(root, "show", commit+":"+file)
}

func untrackedEntriesOf(root string) ([]string, error) {
	listing, err := gitTrimmed(root, "ls-files", "--others", "--directory", "-z")
	entries := []string{}
	for _, entry := range strings.Split(listing, "\x00") {
		entries = append(entries, strings.TrimSuffix(entry, "/"))
	}
	return entries, err
}

var bazelOutput = regexp.MustCompile(`^bazel-[^/]+$`)

// A Bazel repo can track a link into bazel-bin for each generated file, so the base reads the
// generated files through the Bazel output links of the branch.
func isBazelOutputLink(root string, entry string) bool {
	if !bazelOutput.MatchString(entry) {
		return false
	}
	info, err := os.Lstat(filepath.Join(root, entry))
	return err == nil && info.Mode()&os.ModeSymlink != 0
}

type baseWorktree struct {
	checkout         string
	path             string
	untrackedEntries []string
}

func inWorktreeAt[T any](root string, commit string, read func(path string) (T, error)) (T, error) {
	var none T
	parent, err := os.MkdirTemp("", "callmap-go-base-")
	if err != nil {
		return none, err
	}
	defer os.RemoveAll(parent)
	path := filepath.Join(parent, "base")
	if _, err := gitOutput(root, "worktree", "add", "--detach", "--quiet", path, commit); err != nil {
		return none, err
	}
	links := []string{}
	defer func() {
		for _, linked := range links {
			os.Remove(linked)
		}
		gitOutput(root, "worktree", "remove", "--force", path)
	}()
	untracked, err := untrackedEntriesOf(root)
	if err != nil {
		return none, err
	}
	for _, entry := range untracked {
		if !isBazelOutputLink(root, entry) {
			continue
		}
		linked := filepath.Join(path, entry)
		if _, err := os.Lstat(linked); err == nil {
			continue
		}
		if os.Symlink(filepath.Join(root, entry), linked) == nil {
			links = append(links, linked)
		}
	}
	if err := copyGoWorkspaceFiles(baseWorktree{checkout: root, path: path, untrackedEntries: untracked}); err != nil {
		return none, err
	}
	return read(path)
}
