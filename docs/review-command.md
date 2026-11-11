# The review command

Each distribution has the command `review`, with the same flags: `callmap-ts review`, `callmap-go review` and `callmap-rb review`. The README holds the flags. `docs/command-contract.md` holds the rule of each flag and each message. This file holds the detail behind them.

## The distributions

Each distribution reads only the files of its own language. If the scope holds files of another language, the command prints one line that names the distribution for them. A call never crosses from one language to another.

- **`callmap-ts`** reads TypeScript and JavaScript with the TypeScript type checker. It needs Node 22.18 or later. It reads the base and the branch at the same time.
- **`callmap-go`** reads Go with `go/types`. It needs `go` 1.26 or later on the `PATH`, and no network. A Go file enters the review only when the go tool builds it. So a file that imports `C` enters only when cgo is on. The go tool turns cgo off with no C compiler on the `PATH`, or with `CGO_ENABLED=0`. It reads the base and the branch one after the other, because one read of a large Go repo can take several GB of memory. The checker on the page is the Go version that built `callmap-go`.
- **`callmap-rb`** reads Ruby with the Callmap Ruby rules. It parses each file with Ripper, which every Ruby ships, so it needs no other gem. If Ripper cannot parse a Ruby file, the review reads no functions in that file and prints one line for it. It reads the base and the branch one after the other.

`docs/ruby-rules.md` holds the rules that tie each Ruby call.

## The base

The default branch is the head of `origin`, then the head of any other remote, then `main`, then `master`. The review reads the base commit in a temporary git worktree and removes it at the end, so the checkout and the uncommitted files never move. In `callmap-ts`, the worktree links to the `node_modules` folders of the checkout, so the library types resolve on the base too. The command prints the path of the page when it ends.

## The cache

The command caches the graph of the base, so a second review of the same base reads only the branch. Each distribution keeps its cache in its own folder: `$XDG_CACHE_HOME/callmap-ts/`, or `~/.cache/callmap-ts/` when the variable is not set, and the same for `callmap-go` and `callmap-rb`. An entry belongs to one base commit and one set of scope globs. Without `--tests`, the set holds the test globs. So a review with `--tests` never uses an entry of a review without it. It also belongs to the dependency files of the language in the checkout, and to one version of the distribution. An entry of `callmap-ts` also belongs to one tsconfig. A change of any of them reads the base again. The dependency files of TypeScript are the lock files of npm, Yarn, pnpm and Bun. The dependency files of Go are every `go.sum` and every `go.work.sum` in the checkout, in any folder, and the `go.work` at the repo root. Ruby has no dependency file. The version of `callmap-ts` holds the version of the package and the version of its `typescript`. It also holds a hash of the extractor source that the build saw. So a new release starts with an empty cache. A run of the source in a clone uses the version of `typescript` and a hash of the extractor source. `docs/command-contract.md` gives the version of `callmap-go` and of `callmap-rb`. The cache never holds the graph of the branch. It keeps the 20 newest entries for each repo. A cache file that cannot be read gives a fresh read of the base. You can delete the folder at any time.

## The scope

A scope glob matches a whole path from the repo root. `*` matches inside one folder, `**` matches across folders, and `?` matches one character. A glob that starts with `!` leaves files out. Quote each glob, so that the shell does not expand it.

A backend in a subfolder of a monorepo, with its generated files left out:

```sh
callmap-ts review --tsconfig server/tsconfig.json --scope 'server/src/**' --scope '!**/*.generated.ts'
```

A Go repo with its tests:

```sh
callmap-go review --tests
```

## The test files

By default, the review reads no test file. A test file is a path that one of these globs matches: `**/*_test.go`, `**/*.test.*`, `**/*.spec.*`, `**/*_spec.rb`, `**/*_test.rb`, `**/__tests__/**`, `**/test/**`, `**/tests/**` and `**/spec/**`. The command adds each of them to the scope as a `!` glob. So a `--scope` glob does not put a test file back. `--tests` reads the test files. A test that mocks its calls adds open ends, so it lowers the resolution rate. A folder named `test` that holds real code stays out too, and `--tests` brings it back. ADR-0029 records why.
