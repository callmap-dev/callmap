# The review input carries the base source of each changed file, and the suite compares it by structure

A distribution writes the review input from git and its graph documents only, with no rule of the review core. So the review input holds the base source of each file that the branch changed, and not of each file that holds a changed function. The conformance suite compares the review input by its structure, not by its bytes. The Diff limit is not part of the review input. The owner made these decisions in a grilling on 2026-11-07, after an architecture review against spec 24.

This changes decision 7 of ADR-0036.

## Decisions

1. **The base source rule.** The review input holds the base source of each file that `git diff --name-only --no-renames <base>` lists against the working tree, in scope and in the language of the distribution. A renamed file gives its old path and its new path. Today the command packs the base files of the removed and the changed functions, so it needs the marks of the review to choose them.
2. **The compare by structure.** The conformance suite parses the review input, unpacks the sources, masks the commit hashes, the repo root and the checker version, and compares the result as JSON values. The key order is not part of the contract. The expected files keep their keys in sorted order, so that a diff of 2 expected files is easy to read.
3. **The Diff limit stays in the page.** The review input does not hold the Diff limit, and neither does its JSON Schema. A test that needs a smaller limit sets it through one hook of the page loader in JSDOM.

## Why

- **A distribution copies no rule of the review core.** If the base files came from the marks, `callmap-go` and `callmap-rb` would each need a copy of the change rules. ADR-0037 keeps one copy of the review core in the page.
- **A file list from git is the same in every language.** Each distribution already runs `git`. The list is a superset of the files that hold a removed or a changed function, so the page loses no base source.
- **2 JSON writers do not give the same bytes.** Go sorts the keys of a map and keeps the field order of a struct. Ruby keeps the insertion order. A compare by bytes would force one writer order on 3 languages for no gain to the reader.
- **The Diff limit is a fact of the page, not of the review.** Only tests change it.

## Considered options

- **Every file of the base graph documents.** It needs no git diff, but the page grows with the size of the repo, not with the size of the branch.
- **A declared key order, from the JSON Schema.** It keeps a compare by bytes, but each distribution must write its JSON in that order by hand.
- **`diffLimit` as an optional field of the review input.** It puts a test setting into the contract of 3 distributions.

## Consequences

- **The page can hold more base source than it shows.** A changed file with no changed function still carries its base source. Spec 24 step 1 measures the page size.
- **Spec 24 user story 23 stays.** One distribution still gives a byte-identical page file for the same review input and the same page version.
