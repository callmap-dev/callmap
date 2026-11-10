# callmap-go

Callmap is a call graph reader for an engineer who still reads code. `callmap-go` is the distribution of Callmap for Go. It reads only the Go files of a repo, so it needs no Node and no Ruby.

## Install

It needs `go` 1.26 or later.

```sh
go install github.com/callmap-dev/callmap/callmap-go@latest
```

The install gives the command `callmap-go`. A review needs no network after the install. The checker on the reader page is the Go version that built `callmap-go`.

## Review a branch

Run this command in a git repo:

```sh
callmap-go review
```

The command compares the branch with its base, writes the reader page and opens it. It prints the path of the page.

If the scope holds files of another language, the command prints one line that names the distribution for that language. For TypeScript and JavaScript, use `callmap-ts`. For Ruby, use `callmap-rb`.

## The flags

```
callmap-go review [<repo>] [--base <commit>] [--scope <glob>]... [--out <file>] [--no-open] [--no-cache] [--editor vscode|jetbrains] [--tests]
```

The command contract gives the rule of each flag: <https://github.com/callmap-dev/callmap/blob/master/docs/command-contract.md>.

## The module

The module is `github.com/callmap-dev/callmap/callmap-go`, in the folder `callmap-go/` of the repo `callmap-dev/callmap`, as ADR-0040 records. The main package is the root of the module. The Go extractor is the package `internal/extractor`, and it runs in the same process as the command. The folder `vendor/` holds `golang.org/x/tools`, so a build from a checkout needs no network.

`go install` builds from the files of the module only. So the module commits a copy of each file of the core that it embeds:

- `internal/scope/test-globs.json` is a copy of `packages/scope/test-globs.json`. The CI fails when the 2 files differ.
- `page-template.html` is a copy of the page template that `npm run build` writes to `packages/reader-page/dist/page-template.html`. It changes only in a pull request that prepares a release.

`cmd/callmap-extract-go` is the Go extractor as a separate process. The tests of the Go extractor in `test/` run it, and the command `callmap-go` does not.

## Release

1. In a pull request, set the copy of the page template to the build of the same commit: `npm run build && cp packages/reader-page/dist/page-template.html callmap-go/page-template.html`.
2. After the merge, push a tag `callmap-go/v<version>`, for example `callmap-go/v0.1.0`.

The release job builds the page template from the tagged commit, and fails when the copy differs. It then installs `callmap-go` from the checkout, runs the conformance suite for Go, makes the GitHub release and asks the Go module proxy for the version.

## License

MIT.
