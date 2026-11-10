# The packages

The core packages read data and never read source code or a filesystem. See ADR-0009.

| Package                   | What it owns                                                                                                                                                               |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@callmap/graph-document` | The graph document an extractor emits: files, functions, calls with their one-of groups, open ends, a language and a scope                                                 |
| `@callmap/review`         | The review of a branch: the changed functions, their neighbours, the added and removed calls, their open ends and one-of groups, and one resolution rate for each language |
| `@callmap/review-input`   | The review input in the data block of the reader page: its type, its format version, the escape rule, the packed sources, and the read and the write of the data block |
| `@callmap/scope`          | The scope globs, the test globs and the skipped directories that every walk of a repo shares                                                                                               |
| `@callmap/editor-link`    | The editor link that opens a file at a line                                                                                                                                |

The extractors are the other side of the contract. Each one reads a repo and names its language.

| Package                         | What it owns                                                                                |
| ------------------------------- | ------------------------------------------------------------------------------------------- |
| `@callmap/extractor-typescript` | TypeScript and JavaScript, with functions and calls resolved by the TypeScript type checker |
| `@callmap/extractor-go`         | Go, with functions and calls resolved by `go/types`                                         |
| `@callmap/extractor-ruby`       | Ruby, with functions and calls resolved by the Callmap Ruby rules                           |

The host runs the extractors and writes the review input into the reader page. The page computes the review.

| Package        | What it owns                                                                              |
| -------------- | ----------------------------------------------------------------------------------------- |
| `@callmap/cli` | The `callmap` command: git, the extractor processes, and the reader page with ELK inlined |

The page script lives in `packages/cli/page/`. `npm run build` bundles it with `elkjs` once, and writes the page template `packages/cli/dist/page-template.html`. The page template is the HTML shell of the reader page with the page style and the page script inlined. Its data block holds the marker `{{CALLMAP_REVIEW_INPUT}}`, and the command writes each page with `pageOfTemplate` of `@callmap/review-input`, which puts the escaped review input at the marker of the data block. A run of the source in `packages/cli/src/` builds the page template at each run, so a test always sees the current page. `page/levels.ts` builds the boxes and the lines of each level. The layout module, `page/layout.ts`, holds the ELK options, keeps the layout of each choice of the reader and marks the graph busy. It runs ELK in a Web Worker from the worker source that the build inlines as a fixed string, and in the page thread where the browser has no `Worker`, as in JSDOM. The page draws every view as SVG. A view is one module in `packages/cli/page/views/`: a pure function from the page data to frames, boxes and lines. A new part of the page is one module in `packages/cli/page/parts/` that default-exports a `PagePart`. The CLI loads each part in name order, with no change to another file.

The distribution `callmap-ts` lives in `callmap-ts/`, an npm workspace of the repo, as ADR-0040 records. Its thin CLI in `callmap-ts/src/` gives the review command of `packages/cli/src/` the record of the distribution: the command name `callmap-ts`, the one language that it reads, and the TypeScript extractor. The review command prints one line for each other language in scope. `npm run build` also writes `callmap-ts/dist/`: the command, the TypeScript extractor and the page template from the build of the same commit. Git holds no copy of the page template. The package pins `typescript` and bundles everything else. It carries no Go source and no Ruby script. A `callmap-ts/v*` tag publishes it.

The distribution `callmap-go` is the Go module `github.com/callmap-dev/callmap/callmap-go` in `callmap-go/`, as ADR-0040 records. Its main package at the root of the module is the review command `callmap-go`. The Go extractor is its package `internal/extractor`, and the command runs it in its own process, so no build runs on the first run. The scope globs and the test globs are its package `internal/scope`. The module commits a copy of the page template and of `packages/scope/test-globs.json` for `go:embed`, because `go install` builds from the files of the module only. A `callmap-go/v*` tag releases it. `callmap-go/README.md` tells how to prepare a release.

The distribution `callmap-rb` is the gem `callmap-rb` in `callmap-rb/`, as ADR-0040 records. Its thin CLI in Ruby is the review command `callmap-rb`. Its Ruby extractor runs in the same process: the Ripper script `lib/callmap_rb/ripper/read.rb`, and the Ruby rules of the walk, the load units, Zeitwerk, the constant aliases, the class chain, the macros and the type flow in `lib/callmap_rb/extractor/`. These rules tie the direct calls, the calls on a value whose class the type flow proves, the one-of groups and the open ends. The gem build copies the page template from the build of the same commit, the test globs and the license into the gem. Git ignores these copies. `@callmap/extractor-ruby` runs the same Ripper script. A `callmap-rb/v*` tag publishes the gem.

`@callmap/cli` also goes to npm. `npm run build` writes it to `packages/cli/dist/`: the command, the TypeScript extractor, the launcher of the Go extractor, the Ruby extractor `extract-ruby.js`, and the page template `page-template.html` with the page script and style inlined. The build bundles the other `@callmap/*` packages and `elkjs` into these files. `typescript` stays a dependency of the package, at a pinned version. The build copies the Go source of the Go extractor from `callmap-go/`, with its vendored modules, into `packages/cli/dist/go/`, and the command builds `cmd/callmap-extract-go` on the first run. It leaves out the review command of `callmap-go` and its page template. The build copies the Ripper script of the Ruby extractor from `callmap-rb/lib/callmap_rb/ripper/` to `packages/cli/dist/ruby/read.rb`. ADR-0021 and ADR-0026 record why.

`test/core-is-language-blind-and-pure.test.ts` reads the imports of every package. It holds the core away from the filesystem and from any language name. It holds each extractor to the opposite. It holds the host to its own list, and keeps the page script off every Node built-in.

Each extractor runs as its own process and writes its document to its standard output. Like `callmap review`, it reads no test file without `--tests`:

```sh
node packages/extractor-typescript/src/cli.ts <repo> [--scope <glob>]... [--tsconfig <path>] [--tests]
node packages/extractor-ruby/src/cli.ts <repo> [--scope <glob>]... [--tests]
node packages/extractor-go/src/cli.ts <repo> [--scope <glob>]... [--tests]
```

The Ruby extractor needs `ruby` on the `PATH`. It parses with Ripper, which every Ruby ships, so it needs no gem. The Go extractor needs `go` 1.26 or later on the `PATH`, because its vendored `golang.org/x/tools` v0.52.0 needs it. It loads the repo with `golang.org/x/tools/go/packages`, which its module vendors. It runs the go tool with `GOPROXY=off` and `GOTOOLCHAIN=local`, so it needs no network.

An extractor must be tested against files on disk. The TypeScript and Ruby extractors commit a small fixture repo under `packages/<extractor>/fixture/`. The tests of the Go extractor write a throwaway repo for each case.
