# Callmap

Callmap is a call graph reader for an engineer who still reads code.

It reads a branch of a TypeScript, Go or Ruby repo and writes one HTML page for the code review. The page shows each function that the branch added, removed or changed, with its callers and its callees. Callmap uses no AI. The type checker of the language proves each call, so the same commits always give the same page.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/diff-view-dark.png">
  <img alt="The Diff view of the review fixture, with the changed function receipt selected and its diff in the code panel." src="docs/screenshots/diff-view-light.png">
</picture>

## Try it

Callmap has one distribution for each language. Each one reads only the files of its language, so it needs no tool of another language. Install the one of your language:

| Language                  | Distribution | Install                                                   | Needs              |
| ------------------------- | ------------ | --------------------------------------------------------- | ------------------ |
| TypeScript and JavaScript | `callmap-ts` | `npm install --global callmap-ts`, or `npx callmap-ts`    | Node 22.18 or later |
| Go                        | `callmap-go` | `go install github.com/callmap-dev/callmap/callmap-go@latest` | `go` 1.26 or later |
| Ruby                      | `callmap-rb` | `gem install callmap-rb`                                  | `ruby` 3.1 or later |

Check out the branch, then run the review in its repo, for example:

```sh
npx callmap-ts review
callmap-go review
callmap-rb review
```

The page opens in the browser. If the branch also holds files of another language, the command prints one line that names the distribution for them. [callmap-ts](callmap-ts/README.md), [callmap-go](callmap-go/README.md) and [callmap-rb](callmap-rb/README.md) tell more about each one.

The npm package `@callmap/cli` with the command `callmap` is deprecated. Use `callmap-ts` in its place.

## What the page shows

- **Diff:** the changed functions and one hop of callers and callees around each. This view opens first. Over the Diff limit of 2,000 calls, it shows one folder or one file at a time, with only the changed code and its neighbours.
- **Whole project:** the folder tree one level at a time, with the count of the calls between 2 folders.
- **Folder:** the functions of one folder and the calls between them.
- **Route:** the whole call tree of one entry point.
- **Code:** a click on a function shows its code, as a diff when the branch changed it.

The page is one file with no network access, so you can attach it to a pull request. [The reader page](docs/reader-page.md) describes the views, the zoom and the keys.

## What Callmap proves

| Language                  | Checker                                      | Calls resolved | Measured on                           |
| ------------------------- | -------------------------------------------- | -------------- | ------------------------------------- |
| TypeScript and JavaScript | The TypeScript type checker                  | 96.7%          | The backend of a private app          |
| Go                        | `go/types`                                   | 97.6%          | `go-gitea/gitea` without its tests    |
| Ruby                      | [The Callmap Ruby rules](docs/ruby-rules.md) | 47.6%          | `mastodon/mastodon` without its tests |

Callmap never guesses a call. A call that the checker cannot prove is an open end, and the page marks it at its call site. The page also shows the resolution rate of your branch and the checker that proved its calls. [The research folder](docs/research/) holds the measurements.

## Options

Every distribution takes the same command and the same flags. Only `callmap-ts` takes `--tsconfig`.

```sh
callmap-ts review [<repo>] [--base <commit>] [--scope <glob>]... [--tsconfig <file>] [--out <file>] [--no-open] [--no-cache] [--editor vscode|jetbrains] [--tests]
```

| Argument            | What it does                                                                            | Default                                          |
| ------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `<repo>`            | The repo to review. Any folder inside it works.                                         | The current folder                               |
| `--base <commit>`   | The commit to compare the branch with.                                                  | The merge base with the default branch           |
| `--scope <glob>`    | Limits the review to the files that the glob matches. Give it once for each glob.       | Every file of the repo that git does not ignore  |
| `--scope '!<glob>'` | Leaves out the files that the glob matches, also when another glob takes them.          | Nothing left out                                 |
| `--tsconfig <file>` | `callmap-ts` only. The TypeScript config to read, as an absolute path or a path relative to the repo root. | `tsconfig.json` at the repo root, if it exists   |
| `--out <file>`      | Where the page is written.                                                              | `review-<repo folder>.html` in `$TMPDIR/callmap` |
| `--no-open`         | Writes the page and does not open it, for example to attach it to a merge request.      | The page opens in the browser                    |
| `--no-cache`        | Reads the base again and does not write the cache.                                      | The base comes from the cache if it is there     |
| `--editor <name>`   | The editor that the editor link on each function opens: `vscode` or `jetbrains`.        | `vscode`                                         |
| `--tests`           | Reads the test files too.                                                               | The test files stay out                          |

A backend in a subfolder of a monorepo, with its generated files left out:

```sh
callmap-ts review --tsconfig server/tsconfig.json --scope 'server/src/**' --scope '!**/*.generated.ts'
```

[The review command](docs/review-command.md) describes the base, the cache, the scope globs and the test files. [The command contract](docs/command-contract.md) holds the rule of each flag.

## Ask Claude for a review

This repo is also a Claude Code plugin marketplace. Its plugin `callmap` holds a skill that runs the review command of the distribution of the repo and opens the page. Install the plugin once in Claude Code:

```sh
/plugin install callmap --marketplace callmap-dev/callmap
```

Then ask Claude for a Callmap review of the branch. The skill needs the distribution of your language from the install step.

## More

To use Callmap:

- [The reader page](docs/reader-page.md) describes the views, the levels, the zoom and the keys.
- [The review command](docs/review-command.md) describes the distributions, the base, the cache and the scope.
- [The Callmap Ruby rules](docs/ruby-rules.md) tell how Callmap ties a Ruby call with no type checker.

To change Callmap:

- [CONTRIBUTING.md](CONTRIBUTING.md) tells how to set up a clone, and [the checks](docs/checks.md) tell how to check a change.
- [The packages](docs/packages.md) describe the core, the reader page, the distributions and the build.
- [The command contract](docs/command-contract.md) holds the rules that every distribution follows.
- [The product record](docs/product.md), [the glossary](GLOSSARY.md) and [the decisions](docs/adr/) hold the reasons.

## License

Callmap has the [MIT license](LICENSE).
