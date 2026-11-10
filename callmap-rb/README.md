# callmap-rb

Callmap is a call graph reader for an engineer who still reads code. `callmap-rb` is the distribution of Callmap for Ruby. It reads only the Ruby files of a repo, so it needs no Node and no Go.

## Install

It needs `ruby` 3.1 or later, and no other gem.

```sh
gem install callmap-rb
```

The install gives the command `callmap-rb`. A review needs no network after the install.

## Review a branch

Run this command in a git repo:

```sh
callmap-rb review
```

The command compares the branch with its base, writes the reader page and opens it. It prints the path of the page.

If the scope holds files of another language, the command prints one line that names the distribution for that language. For TypeScript and JavaScript, use `callmap-ts`. For Go, use `callmap-go`.

## The flags

```
callmap-rb review [<repo>] [--base <commit>] [--scope <glob>]... [--out <file>] [--no-open] [--no-cache] [--editor vscode|jetbrains] [--tests]
```

The command contract gives the rule of each flag: <https://github.com/callmap-dev/callmap/blob/master/docs/command-contract.md>.

## The gem

The gem lives in the folder `callmap-rb/` of the repo `callmap-dev/callmap`, as ADR-0040 records. It holds these parts:

- `lib/callmap_rb/ripper/read.rb` is the Ripper script. It reads the bodies, the methods and the call sites of each file. The `callmap` command of `@callmap/cli` runs the same script.
- `lib/callmap_rb/extractor/` holds the Ruby rules: the walk, the load units, Zeitwerk, the constant aliases and the class chain. They tie the direct calls: a call on `self`, on `super` and on a constant. A call to a method that a macro makes, such as `has_many`, is a library call. A call on `self` or on `super` in a module, and a call to an abstract method, give a one-of group. A call on a value is an open end with the reason `untyped`, because the type flow is not ported yet.
- `lib/callmap_rb/` also holds the thin CLI: the arguments, git, the base cache and the page writer.

The gem build copies 3 files of the core into the gem: the page template from `packages/cli/dist/page-template.html`, the test globs from `packages/scope/test-globs.json` and the license. git ignores these copies. So build the page template of the same commit before the gem:

```sh
npm run build --workspace @callmap/cli
cd callmap-rb
gem build callmap-rb.gemspec
```

## License

MIT.
