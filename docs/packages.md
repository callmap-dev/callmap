# The packages

The core packages read data and never read source code or a filesystem. See ADR-0009.

| Package                   | What it owns                                                                                                                                                               |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@callmap/graph-document` | The graph document an extractor emits: files, functions, calls with their one-of groups, open ends, a language and a scope                                                 |
| `@callmap/review`         | The review of a branch: the changed functions, their neighbours, the added and removed calls, their open ends and one-of groups, and the resolution rate |
| `@callmap/review-input`   | The review input in the data block of the reader page: its type, its format version, the escape rule, the packed sources, and the read and the write of the data block |
| `@callmap/scope`          | The scope globs, the test globs and the skipped directories that every walk of a repo shares                                                                                               |
| `@callmap/editor-link`    | The editor link that opens a file at a line                                                                                                                                |

The reader page has a package of its own.

| Package                 | What it owns                                                                                       |
| ----------------------- | -------------------------------------------------------------------------------------------------- |
| `@callmap/reader-page`  | The page script, the page style, the layout of every view with ELK, and the build of the page template |

The page script lives in `packages/reader-page/page/`. It reads the review input from the data block, computes the review with `@callmap/review` and lays out every view, as ADR-0037 records. `npm run build` bundles it with `elkjs` once, and writes the page template `packages/reader-page/dist/page-template.html`. The page template is the HTML shell of the reader page with the page style and the page script inlined. Its data block holds the marker `{{CALLMAP_REVIEW_INPUT}}`, and a distribution writes each page with the page template and the escaped review input. `pageTemplate` in `packages/reader-page/build/` builds the page template in a test or a build, so a test always sees the current page. `page/levels.ts` builds the boxes and the lines of each level. The layout module, `page/layout.ts`, holds the ELK options, keeps the layout of each choice of the reader and marks the graph busy. It runs ELK in a Web Worker from the worker source that the build inlines as a fixed string, and in the page thread where the browser has no `Worker`, as in JSDOM. The page draws every view as SVG. A view is one module in `packages/reader-page/page/views/`: a pure function from the page data to frames, boxes and lines. A new part of the page is one module in `packages/reader-page/page/parts/` that default-exports a `PagePart`. The build loads each part in name order, with no change to another file.

The tests of the reader page build each page from a review input file, with no git and no extractor. A review input file holds a review input as the conformance suite writes it: the sources unpacked, the keys in sorted order, and the commits, the repo root and the checker version masked. The expected files of the conformance suite are review input files. `packages/reader-page/review-inputs/` holds the others that the tests need.

`@callmap/conformance` is the conformance suite. It runs the review command of a distribution on each fixture repo of its language and compares the review input of the page with the expected file. `packages/conformance/README.md` tells how it works.

## The distributions

Each distribution reads git, runs its extractor, keeps the base cache and writes the review input into the page template. Each one lives in its own folder at the repo root, as ADR-0040 records. `docs/command-contract.md` gives the rules that each one follows.

The distribution `callmap-ts` lives in `callmap-ts/`, an npm workspace of the repo. Its thin CLI is in `callmap-ts/src/`: the arguments, git, the base cache, the page writer and the review command. Its TypeScript extractor is in `callmap-ts/extractor/`, and the command runs it as a process of its own. The extractor resolves each call with the TypeScript type checker. `npm run build` writes `callmap-ts/dist/`: the command, the TypeScript extractor and the page template from the build of the same commit. Git holds no copy of the page template. The package pins `typescript` and bundles everything else, with `elkjs` and the `@callmap/*` packages. It carries no Go source and no Ruby script. A `callmap-ts/v*` tag publishes it.

The distribution `callmap-go` is the Go module `github.com/callmap-dev/callmap/callmap-go` in `callmap-go/`. Its main package at the root of the module is the review command `callmap-go`. The Go extractor is its package `internal/extractor`, and the command runs it in its own process, so no build runs on the first run. It resolves each call with `go/types`. The scope globs and the test globs are its package `internal/scope`. The module commits a copy of the page template and of `packages/scope/test-globs.json` for `go:embed`, because `go install` builds from the files of the module only. A `callmap-go/v*` tag releases it. `callmap-go/README.md` tells how to prepare a release.

The distribution `callmap-rb` is the gem `callmap-rb` in `callmap-rb/`. Its thin CLI in Ruby is the review command `callmap-rb`. Its Ruby extractor runs in the same process: the Ripper script `lib/callmap_rb/ripper/read.rb`, and the Ruby rules of the walk, the load units, Zeitwerk, the constant aliases, the class chain, the macros and the type flow in `lib/callmap_rb/extractor/`. These rules tie the direct calls, the calls on a value whose class the type flow proves, the one-of groups and the open ends. The gem build copies the page template from the build of the same commit, the test globs and the license into the gem. Git ignores these copies. A `callmap-rb/v*` tag publishes the gem.

`test/core-is-language-blind-and-pure.test.ts` reads the imports of the core packages, of the reader page and of `callmap-ts`. It holds the core away from the filesystem and from any language name. It keeps the page script off every Node built-in. It holds the TypeScript extractor to the opposite, and keeps the command of `callmap-ts` from parsing any source.

## The extractors

An extractor reads a repo and writes its graph document. Like the review command, it reads no test file without `--tests`. The TypeScript extractor runs as its own process:

```sh
node callmap-ts/extractor/cli.ts <repo> [--scope <glob>]... [--tsconfig <path>] [--tests]
```

The Go extractor of `callmap-go` also builds as its own process, `callmap-go/cmd/callmap-extract-go`, for its tests in `callmap-go/test/`. It needs `go` 1.26 or later, because its vendored `golang.org/x/tools` v0.52.0 needs it. It loads the repo with `golang.org/x/tools/go/packages`, and it runs the go tool with `GOPROXY=off` and `GOTOOLCHAIN=local`, so it needs no network.

The Ruby extractor of `callmap-rb` parses with Ripper, which every Ruby ships, so it needs no gem. Its tests in `callmap-rb/test/` run the Ruby rules of `lib/` in a ruby process.

An extractor must be tested against files on disk. The TypeScript extractor commits small fixture repos in `callmap-ts/fixture/`, `callmap-ts/fixture-calls/` and `callmap-ts/fixture-resolution/`. The Ruby extractor commits its fixture repo in `callmap-rb/test/fixture/`. The tests of the Go extractor write a throwaway repo for each case. The tests of each distribution build fixture repos with git history from `test/fixture-repos/`.
