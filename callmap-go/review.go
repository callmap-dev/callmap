package main

import (
	"fmt"
	"os"
	"path/filepath"
	"slices"
	"strings"

	"github.com/callmap-dev/callmap/callmap-go/internal/extractor"
	"github.com/callmap-dev/callmap/callmap-go/internal/scope"
)

type base struct {
	name   string
	commit string
}

func baseOf(root string, typed string) (base, error) {
	if typed != "" {
		commit, err := commitOf(root, typed)
		return base{name: typed, commit: commit}, err
	}
	name, err := defaultBranchOf(root)
	if err != nil {
		return base{}, err
	}
	commit, err := mergeBaseOf(root, name)
	return base{name: name, commit: commit}, err
}

func defaultOutOf(root string) string {
	return filepath.Join(os.TempDir(), "callmap", "review-"+filepath.Base(root)+".html")
}

type documents struct {
	branch extractor.Document
	base   extractor.Document
}

// readGraphDocumentOf removes the path of the read folder from the reason, so that the reason names
// a repo-relative path.
func readGraphDocumentOf(what string, path string, effective []string, notes *noteLines) (extractor.Document, error) {
	document, err := extractor.Extract(path, effective, command, notes)
	if err != nil {
		return extractor.Document{}, fmt.Errorf("%s could not be read: %s", what, strings.ReplaceAll(err.Error(), path+"/", ""))
	}
	return document, nil
}

func documentsOf(root string, reviewBase base, effective []string, cache bool, notes *noteLines) (documents, error) {
	branch, err := readGraphDocumentOf("the branch", root, effective, notes)
	if err != nil {
		return documents{}, err
	}
	short, err := shortCommitOf(root, reviewBase.commit)
	if err != nil {
		return documents{}, err
	}
	readBase := func() (extractor.Document, error) {
		return inWorktreeAt(root, reviewBase.commit, func(path string) (extractor.Document, error) {
			return readGraphDocumentOf("the base "+short, path, effective, notes)
		})
	}
	if !cache {
		document, err := readBase()
		return documents{branch: branch, base: document}, err
	}
	repo, err := commonDirOf(root)
	if err != nil {
		return documents{}, err
	}
	document, err := throughBaseCache(baseKey{repo: repo, checkout: root, commit: reviewBase.commit, scope: effective}, readBase)
	return documents{branch: branch, base: document}, err
}

func filesOf(read []extractor.Document) map[string]bool {
	files := map[string]bool{}
	for _, document := range read {
		for _, file := range document.Files {
			files[file] = true
		}
	}
	return files
}

// sourcesOf gives the base source of each file that git lists as changed and that a base graph
// document holds, as ADR-0038 records.
func sourcesOf(root string, commit string, branch []extractor.Document, baseDocuments []extractor.Document) (sources, error) {
	read := sources{Branch: map[string]string{}, Base: map[string]string{}}
	for file := range filesOf(branch) {
		text, err := os.ReadFile(filepath.Join(root, filepath.FromSlash(file)))
		if err != nil {
			return read, err
		}
		read.Branch[file] = string(text)
	}
	changed, err := changedFilesOf(root, commit)
	if err != nil {
		return read, err
	}
	baseFiles := filesOf(baseDocuments)
	for _, file := range changed {
		if !baseFiles[file] {
			continue
		}
		text, err := fileAt(root, commit, file)
		if err != nil {
			return read, err
		}
		read.Base[file] = text
	}
	return read, nil
}

func checkoutOf(root string, reviewBase base, effective []string) (checkout, error) {
	baseCommit, err := shortCommitOf(root, reviewBase.commit)
	if err != nil {
		return checkout{}, err
	}
	headCommit, err := shortCommitOf(root, "HEAD")
	if err != nil {
		return checkout{}, err
	}
	uncommitted, err := uncommittedFilesOf(root)
	if err != nil {
		return checkout{}, err
	}
	return checkout{
		Branch:      branchNameOf(root),
		BaseName:    reviewBase.name,
		BaseCommit:  baseCommit,
		HeadCommit:  headCommit,
		Uncommitted: slices.ContainsFunc(uncommitted, func(path string) bool { return isInReviewScope(path, effective) }),
	}, nil
}

type finishedReview struct {
	out   string
	notes []string
}

func runReview(read invocation) (finishedReview, error) {
	repo, err := filepath.Abs(read.repo)
	if err != nil {
		return finishedReview{}, err
	}
	root, err := repoRootOf(repo)
	if err != nil {
		return finishedReview{}, err
	}
	reviewBase, err := baseOf(root, read.base)
	if err != nil {
		return finishedReview{}, err
	}
	effective := scope.Effective(read.scope, read.tests)

	workingTree, err := workingTreeFilesOf(root)
	if err != nil {
		return finishedReview{}, err
	}
	atBase, err := filesAtCommit(root, reviewBase.commit)
	if err != nil {
		return finishedReview{}, err
	}
	files := append(workingTree, atBase...)
	inScope := slices.DeleteFunc(slices.Clone(files), func(path string) bool { return !isInReviewScope(path, effective) })

	notes := &noteLines{}
	input := reviewInput{
		FormatVersion: reviewInputFormatVersion,
		Base:          []extractor.Document{},
		Branch:        []extractor.Document{},
		Editor:        editorChoice{Name: read.editor, RepoRoot: root},
	}
	if readsGoFiles(inScope, files) {
		goDocuments, err := documentsOf(root, reviewBase, effective, read.cache, notes)
		if err != nil {
			return finishedReview{}, err
		}
		input.Base = append(input.Base, goDocuments.base)
		input.Branch = append(input.Branch, goDocuments.branch)
	}
	texts, err := sourcesOf(root, reviewBase.commit, input.Branch, input.Base)
	if err != nil {
		return finishedReview{}, err
	}
	if input.PackedSources, err = packedSourcesOf(texts); err != nil {
		return finishedReview{}, err
	}
	if input.Checkout, err = checkoutOf(root, reviewBase, effective); err != nil {
		return finishedReview{}, err
	}
	page, err := readerPageOf(input)
	if err != nil {
		return finishedReview{}, err
	}

	out := read.out
	if out == "" {
		out = defaultOutOf(root)
	}
	if out, err = filepath.Abs(out); err != nil {
		return finishedReview{}, err
	}
	if err := os.MkdirAll(filepath.Dir(out), 0o755); err != nil {
		return finishedReview{}, err
	}
	if err := os.WriteFile(out, []byte(page), 0o644); err != nil {
		return finishedReview{}, err
	}
	if read.open {
		openInBrowser(out)
	}
	return finishedReview{out: out, notes: append(otherLanguageLinesOf(inScope), notes.lines...)}, nil
}
