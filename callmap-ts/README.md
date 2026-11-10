# callmap-ts

Callmap is a call graph reader for an engineer who still reads code. `callmap-ts` is the distribution of Callmap for TypeScript and JavaScript. It reads only the TypeScript and JavaScript files of a repo, so it needs no Go and no Ruby.

## Review a branch

Run this command in a git repo. It needs Node 22.18 or later.

```sh
npx callmap-ts review
```

The command compares the branch with its base, writes the reader page and opens it. It prints the path of the page.

If the scope holds files of another language, the command prints one line that names the distribution for that language. For Go, use `callmap-go`. For Ruby, use `callmap-rb`.

## The flags

```
callmap-ts review [<repo>] [--base <commit>] [--scope <glob>]... [--tsconfig <file>] [--out <file>] [--no-open] [--no-cache] [--editor vscode|jetbrains] [--tests]
```

The command contract gives the rule of each flag: <https://github.com/callmap-dev/callmap/blob/master/docs/command-contract.md>.

## License

MIT. The package bundles third-party packages. `dist/THIRD-PARTY-NOTICES.txt` gives the license of each one.
