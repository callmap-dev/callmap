package main

import (
	"os"
	"os/exec"
	"path/filepath"
	"slices"
	"testing"
)

func gitIn(t *testing.T, repo string, args ...string) {
	t.Helper()
	command := exec.Command("git", append([]string{"-c", "user.name=t", "-c", "user.email=t@t"}, args...)...)
	command.Dir = repo
	if output, err := command.CombinedOutput(); err != nil {
		t.Fatalf("git %v: %v\n%s", args, err, output)
	}
}

func ignoringRepoOf(t *testing.T, files map[string]string, patterns string) string {
	t.Helper()
	files[".gitignore"] = patterns
	repo := repoOf(t, files)
	gitIn(t, repo, "init", "-q")
	return repo
}

func walkedFiles(t *testing.T, repo string) []string {
	t.Helper()
	found, err := walk(repo)
	if err != nil {
		t.Fatal(err)
	}
	return found.files
}

func TestTheWalkTakesTheFilesOfEveryFolderWhenTheRepoIsNotAGitRepo(t *testing.T) {
	repo := repoOf(t, map[string]string{".gitignore": "var/\n", "src/a.go": "", "var/data/b.go": ""})
	if files := walkedFiles(t, repo); !slices.Equal(files, []string{"src/a.go", "var/data/b.go"}) {
		t.Fatalf("walked %v", files)
	}
}

func TestTheWalkDoesNotEnterAFolderThatGitIgnores(t *testing.T) {
	repo := ignoringRepoOf(t, map[string]string{"src/a.go": "", "var/data/b.go": "", "var/go.mod": ""}, "var/\n")
	found, err := walk(repo)
	if err != nil {
		t.Fatal(err)
	}
	if !slices.Equal(found.files, []string{"src/a.go"}) || len(found.moduleDirs) != 0 {
		t.Fatalf("walked %v and modules %v", found.files, found.moduleDirs)
	}
}

func TestTheWalkLeavesOutAFileThatGitIgnores(t *testing.T) {
	repo := ignoringRepoOf(t, map[string]string{"src/a.go": "", "src/a.gen.go": ""}, "*.gen.go\n")
	if files := walkedFiles(t, repo); !slices.Equal(files, []string{"src/a.go"}) {
		t.Fatalf("walked %v", files)
	}
}

func TestTheWalkTakesAFileThatGitTracksInsideAFolderThatGitIgnores(t *testing.T) {
	repo := ignoringRepoOf(t, map[string]string{"gen/kept.go": "", "gen/dropped.go": ""}, "gen/\n")
	gitIn(t, repo, "add", "-f", "gen/kept.go")
	gitIn(t, repo, "commit", "-q", "-m", "kept")
	if files := walkedFiles(t, repo); !slices.Equal(files, []string{"gen/kept.go"}) {
		t.Fatalf("walked %v", files)
	}
}

func TestTheWalkDoesNotEnterAFolderThatItCannotRead(t *testing.T) {
	repo := repoOf(t, map[string]string{"src/a.go": "", "var/data/b.go": ""})
	folder := filepath.Join(repo, "var")
	if err := os.Chmod(folder, 0o000); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.Chmod(folder, 0o755) })
	if files := walkedFiles(t, repo); !slices.Equal(files, []string{"src/a.go"}) {
		t.Fatalf("walked %v", files)
	}
}

func TestTheWalkTakesTheFilesOfARootThatAnOuterRepoIgnores(t *testing.T) {
	outer := ignoringRepoOf(t, map[string]string{"sub/src/a.go": ""}, "sub/\n")
	if files := walkedFiles(t, filepath.Join(outer, "sub")); !slices.Equal(files, []string{"src/a.go"}) {
		t.Fatalf("walked %v", files)
	}
}
