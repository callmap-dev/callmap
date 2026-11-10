package main

import (
	"bytes"
	"compress/gzip"
	_ "embed"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/callmap-dev/callmap/callmap-go/internal/extractor"
)

const reviewInputFormatVersion = 1

type checkout struct {
	Branch      *string `json:"branch"`
	BaseName    string  `json:"baseName"`
	BaseCommit  string  `json:"baseCommit"`
	HeadCommit  string  `json:"headCommit"`
	Uncommitted bool    `json:"uncommitted"`
}

type editorChoice struct {
	Name     string `json:"name"`
	RepoRoot string `json:"repoRoot"`
}

type sources struct {
	Branch map[string]string `json:"branch"`
	Base   map[string]string `json:"base"`
}

type reviewInput struct {
	FormatVersion int                  `json:"formatVersion"`
	Base          []extractor.Document `json:"base"`
	Branch        []extractor.Document `json:"branch"`
	PackedSources string               `json:"packedSources"`
	Checkout      checkout             `json:"checkout"`
	Editor        editorChoice         `json:"editor"`
}

// jsonOf writes no HTML escape, so that the escape rule of the data block is the only one.
func jsonOf(value any) ([]byte, error) {
	var text bytes.Buffer
	encoder := json.NewEncoder(&text)
	encoder.SetEscapeHTML(false)
	if err := encoder.Encode(value); err != nil {
		return nil, err
	}
	return bytes.TrimSuffix(text.Bytes(), []byte("\n")), nil
}

func packedSourcesOf(texts sources) (string, error) {
	text, err := jsonOf(texts)
	if err != nil {
		return "", err
	}
	var packed bytes.Buffer
	writer := gzip.NewWriter(&packed)
	if _, err := writer.Write(text); err != nil {
		return "", err
	}
	if err := writer.Close(); err != nil {
		return "", err
	}
	return base64.StdEncoding.EncodeToString(packed.Bytes()), nil
}

// page-template.html is a copy of the page template that the build of the reader page writes. It
// changes only in a pull request that prepares a release of callmap-go, and the release job fails
// when it differs from the build of the tagged commit.
//
//go:embed page-template.html
var pageTemplate string

const dataBlockStart = `<script type="application/json" id="reader-page-data">`

const templateDataBlock = dataBlockStart + "{{CALLMAP_REVIEW_INPUT}}</script>"

func readerPageOf(input reviewInput) (string, error) {
	parts := strings.Split(pageTemplate, templateDataBlock)
	if len(parts) != 2 {
		return "", fmt.Errorf("the page template holds the data block %s %d times, not once", templateDataBlock, len(parts)-1)
	}
	text, err := jsonOf(input)
	if err != nil {
		return "", err
	}
	escaped := strings.ReplaceAll(string(text), "<", `<`)
	return parts[0] + dataBlockStart + escaped + "</script>" + parts[1], nil
}
