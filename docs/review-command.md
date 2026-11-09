# The review command

The README holds the arguments of `callmap review`. This file holds the detail behind them.

## The languages

The review reads each language that has a file in scope. It reads TypeScript and JavaScript with the TypeScript type checker, Go with `go/types`, and Ruby with the Callmap Ruby rules. A Go file enters the review only when the go tool builds it. So a file that imports `C` enters only when cgo is on. The go tool turns cgo off with no C compiler on the `PATH`, or with `CGO_ENABLED=0`. A call never crosses from one language to another. The review reads the base and the branch of TypeScript at the same time. It reads the base and the branch of Go one after the other, and the same for Ruby. One read of a large Go repo can take several GB of memory.

A review of a repo with Go files needs `go` 1.26 or later on the `PATH`. The package carries the source of the Go extractor. The first review with a Go file in scope builds it with that `go`. The build writes the binary to `$XDG_CACHE_HOME/callmap/go-extractor/`, or to `~/.cache/callmap/go-extractor/`, and later reviews use it again. A new version of `@callmap/cli` or a new `go` builds it again. The source holds a copy of `golang.org/x/tools`, so the build needs no network. If `go` is not on the `PATH`, or is older than 1.26, the review skips the Go files. It prints one line that says so.

A review of a repo with Ruby files needs `ruby` on the `PATH`. The Ruby extractor parses each file with Ripper, which every Ruby ships, so it needs no gem. If `ruby` is not on the `PATH`, the review skips the Ruby files. It prints one line that says so. If Ripper cannot parse a Ruby file, the review reads no functions in that file and prints one line for it.

`docs/ruby-rules.md` holds the rules that tie each Ruby call.

## The base

The default branch is the head of `origin`, then the head of any other remote, then `main`, then `master`. The review reads the base commit in a temporary git worktree and removes it at the end, so the checkout and the uncommitted files never move. The worktree links to the `node_modules` folders of the checkout, so the library types resolve on the base too. Git may not track the `go.work` and the `go.work.sum` at the repo root. Then the worktree gets a copy of them, so the Go modules load on the base as on the branch. An absolute `use` path or `replace` target into the checkout points at the same folder in the worktree. The command prints the path of the page when it ends.

## The cache

The command caches the graph of the base, so a second review of the same base reads only the branch. The cache is in `$XDG_CACHE_HOME/callmap/`, or in `~/.cache/callmap/` when the variable is not set. The cache holds one entry for each language of the review. An entry belongs to one language, one base commit and one set of scope globs. Without `--tests`, the set holds the test globs. So a review with `--tests` never uses an entry of a review without it. It also belongs to the dependency files of that language in the checkout. It belongs to one version of the extractor of that language too. An entry of TypeScript also belongs to one tsconfig. A change of any of them reads the base of that language again. The entries of the other languages stay. The dependency files of TypeScript are the lock files of npm, Yarn, pnpm and Bun. The dependency files of Go are every `go.sum` and every `go.work.sum` in the checkout, in any folder. The workspace file `go.work` at the repo root is a dependency file of Go too. Ruby has no dependency file. The version of the TypeScript extractor holds the version of `@callmap/cli` and the version of its `typescript`. It also holds a hash of the extractor source that the build saw. So a new release starts with an empty cache. The version of the Go extractor holds the version of `@callmap/cli` and the output of `go version`. It also holds a hash of the Go source with its vendored modules, without its `_test.go` files. The version of the Ruby extractor holds the version of `@callmap/cli` and the output of `ruby --version`. It also holds a hash of the Ruby extractor source with its Ripper script. A run of the source in a clone uses the version of `typescript`, the output of `go version` or the output of `ruby --version`, and a hash of the extractor source. The cache never holds the graph of the branch. It keeps the 20 newest entries for each repo. A cache file that cannot be read gives a fresh read of the base. You can delete the folder at any time.

## The scope

A scope glob matches a whole path from the repo root. `*` matches inside one folder, `**` matches across folders, and `?` matches one character. A glob that starts with `!` leaves files out. Quote each glob, so that the shell does not expand it.

A backend in a subfolder of a monorepo, with its generated files left out:

```sh
callmap review --tsconfig server/tsconfig.json --scope 'server/src/**' --scope '!**/*.generated.ts'
```

A Go repo with its tests:

```sh
callmap review --tests
```

## The test files

By default, the review reads no test file. A test file is a path that one of these globs matches: `**/*_test.go`, `**/*.test.*`, `**/*.spec.*`, `**/*_spec.rb`, `**/*_test.rb`, `**/__tests__/**`, `**/test/**`, `**/tests/**` and `**/spec/**`. The command adds each of them to the scope as a `!` glob. So a `--scope` glob does not put a test file back. `--tests` reads the test files. A test that mocks its calls adds open ends, so it lowers the resolution rate. A folder named `test` that holds real code stays out too, and `--tests` brings it back. ADR-0029 records why.
