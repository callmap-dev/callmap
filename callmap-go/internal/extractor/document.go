package extractor

type checker struct {
	Name    string `json:"name"`
	Version string `json:"version"`
}

type function struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	File       string `json:"file"`
	FirstLine  int    `json:"firstLine"`
	LastLine   int    `json:"lastLine"`
	SourceHash string `json:"sourceHash"`
}

type call struct {
	Caller string `json:"caller"`
	Callee string `json:"callee"`
	Line   int    `json:"line"`
	Group  string `json:"group,omitempty"`
}

type openEndReason string

const (
	missingModule    openEndReason = "missing-module"
	dynamicKey       openEndReason = "dynamic-key"
	untyped          openEndReason = "untyped"
	functionValue    openEndReason = "function-value"
	noImplementation openEndReason = "no-implementation"
	otherReason      openEndReason = "other"
)

type openEnd struct {
	Caller     string        `json:"caller"`
	Line       int           `json:"line"`
	Expression string        `json:"expression"`
	Reason     openEndReason `json:"reason"`
}

// Document is the graph document of the Go files, as packages/graph-document/graph-document.schema.json gives it.
type Document struct {
	Language  string     `json:"language"`
	Checker   checker    `json:"checker"`
	Scope     []string   `json:"scope"`
	Files     []string   `json:"files"`
	Functions []function `json:"functions"`
	Calls     []call     `json:"calls"`
	OpenEnds  []openEnd  `json:"openEnds"`
}

// Complete reports whether each field of the document holds a value, as a document that the
// extractor wrote does.
func (read Document) Complete() bool {
	return read.Language == "go" && read.Checker.Name != "" && read.Checker.Version != "" &&
		read.Scope != nil && read.Files != nil && read.Functions != nil && read.Calls != nil &&
		read.OpenEnds != nil
}
