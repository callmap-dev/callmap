// Package scope reads a scope glob as every distribution of Callmap reads it, as
// docs/command-contract.md gives it: `*` inside one segment, `**` across segments, `?` for one
// character inside a segment, everything else literal, whole path only. A glob that starts with `!`
// leaves out the files it matches.
package scope

import (
	"bytes"
	_ "embed"
	"encoding/json"
	"fmt"
	"regexp"
	"slices"
	"strings"
)

func segmentPattern(segment string) string {
	quoted := regexp.QuoteMeta(segment)
	quoted = strings.ReplaceAll(quoted, `\?`, "[^/]")
	return strings.ReplaceAll(quoted, `\*`, "[^/]*")
}

func globPattern(glob string) string {
	segments := strings.Split(glob, "/")
	var pattern strings.Builder
	for index, segment := range segments {
		last := index == len(segments)-1
		switch {
		case segment == "**" && last:
			pattern.WriteString(".*")
		case segment == "**":
			pattern.WriteString("(?:[^/]+/)*")
		case last:
			pattern.WriteString(segmentPattern(segment))
		default:
			pattern.WriteString(segmentPattern(segment) + "/")
		}
	}
	return pattern.String()
}

func matches(path string, glob string) bool {
	return regexp.MustCompile("^" + globPattern(glob) + "$").MatchString(path)
}

// InScope reports whether a repo-relative path is in scope. An empty scope narrows nothing.
func InScope(path string, scope []string) bool {
	taken := false
	anyTaking := false
	for _, glob := range scope {
		if leftOut, negated := strings.CutPrefix(glob, "!"); negated {
			if matches(path, leftOut) {
				return false
			}
			continue
		}
		anyTaking = true
		taken = taken || matches(path, glob)
	}
	return taken || !anyTaking
}

// test-globs.json is a copy of packages/scope/test-globs.json, because go install builds from the
// files of this module only. A test of the repo fails when the 2 copies differ.
//
//go:embed test-globs.json
var testGlobsFile []byte

// testGlobsOf keeps the order of the keys of the file, because the effective scope adds the test
// globs in that order, and a Go map has no order.
func testGlobsOf(file []byte) ([]string, error) {
	decoder := json.NewDecoder(bytes.NewReader(file))
	if opening, err := decoder.Token(); err != nil || opening != json.Delim('{') {
		return nil, fmt.Errorf("the test globs are not one JSON object: %v", err)
	}
	globs := []string{}
	for decoder.More() {
		if _, err := decoder.Token(); err != nil {
			return nil, err
		}
		var ofLanguage []string
		if err := decoder.Decode(&ofLanguage); err != nil {
			return nil, err
		}
		for _, glob := range ofLanguage {
			if !slices.Contains(globs, glob) {
				globs = append(globs, glob)
			}
		}
	}
	return globs, nil
}

var testGlobs = func() []string {
	globs, err := testGlobsOf(testGlobsFile)
	if err != nil {
		panic(err)
	}
	return globs
}()

// Effective adds each test glob as a `!` glob after the globs of the user, unless the user asks for
// the tests. A negated glob that the scope already holds does not repeat.
func Effective(scope []string, tests bool) []string {
	if tests {
		return scope
	}
	effective := append([]string{}, scope...)
	for _, glob := range testGlobs {
		if !slices.Contains(scope, "!"+glob) {
			effective = append(effective, "!"+glob)
		}
	}
	return effective
}
