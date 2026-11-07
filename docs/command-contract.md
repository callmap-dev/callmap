# The command contract

This document gives the rules that every distribution of Callmap follows: `callmap-ts`, `callmap-go` and `callmap-rb`. ADR-0036 makes one distribution for each language. Each distribution writes its own thin CLI in its own language, so this document is the one rule set for the 3 CLIs. The conformance suite tests these rules.

The `callmap` command of `@callmap/cli` follows these rules today, with 2 differences. It reads every language, and it takes `--tsconfig` for every repo. The messages below come from the code of `callmap` today. A distribution prints its own command name in place of `callmap`.

## The command

Every distribution takes this command and these flags:

```
review [<repo>] [--base <commit>] [--scope <glob>]... [--out <file>] [--no-open] [--no-cache] [--editor <name>] [--tests]
```

`callmap-ts` also takes `--tsconfig <file>`. No other distribution takes it.

The flags can come in any order, before or after `<repo>`. A flag that takes a value takes it from the next argument. A value cannot start with `--`.

| Argument | Default | Rule |
| --- | --- | --- |
| `<repo>` | the current folder | A folder inside a git repo. The review reads the whole repo from its top folder. Only one `<repo>` is allowed. |
| `--base <commit>` | the merge base of the branch | Any revision that git reads as a commit. The base is that commit itself, not a merge base. "The base" below gives the default. |
| `--scope <glob>` | no glob, so every file | A scope glob. The flag can come more than once. "The scope" below gives the syntax. |
| `--out <file>` | `<temp>/callmap/review-<name>.html` | The path of the reader page. A relative path starts at the current folder. `<temp>` is the temp folder of the system. `<name>` is the name of the top folder of the repo. The command makes the missing folders. |
| `--no-open` | the page opens | The command does not open the page. Without this flag, the system opener opens it: `open` on macOS, `xdg-open` on Linux, `rundll32 url.dll,FileProtocolHandler` on Windows. |
| `--no-cache` | the cache is on | The command does not read the base cache and does not write to it. |
| `--editor <name>` | `vscode` | The editor that the editor links open. The names are `vscode` and `jetbrains`. |
| `--tests` | the tests stay out | The walk also reads the test files. "The test globs" below gives the rule. |
| `--tsconfig <file>` | the `tsconfig.json` in the top folder of the repo | `callmap-ts` only. A relative path starts at the top folder of the repo. |

## The base

If `--base` is absent, the command finds a base branch:

1. The remote head of `origin`, such as `refs/remotes/origin/HEAD`, if git knows it.
2. Else the remote head of another remote, in the order of `git for-each-ref`.
3. Else the local branch `main`, and then the local branch `master`.

The base is the merge base of `HEAD` and that branch. The command reads the base in a temporary git worktree at the base commit. It removes the worktree after the read.

The branch is the working tree of the repo, with its uncommitted changes.

## The scope

A scope glob matches a repo-relative path with forward slashes. It matches the whole path, never a prefix. So the glob `src/checkout` does not take `src/checkout.ts`.

- `*` matches any text inside one path segment.
- `**` as a whole segment matches any run of segments, also no segment.
- `?` matches one character inside one path segment.
- Every other character is a literal. So a dot is a dot.
- A glob that starts with `!` leaves out the files that it matches. It wins over every other glob.
- If no glob takes files in, every file of the repo is in scope, except the files that a `!` glob leaves out.

### The test globs

The test globs live in one data file, `packages/scope/test-globs.json`. The file holds one JSON array of scope globs. Every distribution reads this file.

If `--tests` is absent, the command adds each test glob as a `!` glob after the globs of the user. It adds them in the order of the file. It does not add a `!` glob that the scope of the user already holds. The result is the effective scope, as ADR-0029 records.

Every distribution adds every glob of the file, also the globs for the files of another language. The graph document records the effective scope, and the base cache key reads it. So the same scope gives the same document in every distribution.

### The walk rules

Each walk follows ADR-0035:

1. The walk runs `git ls-files --others --ignored --exclude-standard --directory -z` once, in its root. It does not walk a path from that list.
2. The walk takes a file that git tracks, also inside an ignored folder.
3. The ignore rules of the repo that holds the root apply, also when the root has no `.git` of its own.
4. The walk always enters its root, also when an outer repo ignores the root.
5. The walk skips a folder below the root that it cannot read, on `EACCES` or `EPERM`. An unreadable root fails the review.

The walk also skips each folder named `node_modules` or `vendor`, and each folder whose name starts with a dot. The Go walk also skips each folder named `testdata`, and each folder whose name starts with `_`.

The walk for the dependency files of the base cache does not apply the git ignore rules. It still skips the folders above and the folders that it cannot read.

## The files of another language

A distribution reads only the files of its own language. The files of a language are these:

- TypeScript: the files that end in `.ts`, `.tsx`, `.mts`, `.cts`, `.js`, `.jsx`, `.mjs` or `.cjs`.
- Go: the files that end in `.go`, in a folder that holds a `go.mod` or below such a folder.
- Ruby: the files that end in `.rb`.

The command looks at the files of the working tree and of the base commit, in the effective scope. If these files hold a language of another distribution, the command prints one line on standard error for that language. The line names the language and the distribution for it:

```
callmap-go read only the Go files. Run callmap-ts review for the TypeScript files.
```

A branch with 2 other languages gives 2 lines. `callmap` reads every language today, so it prints no such line.

## The output and the exit codes

The command exits with code 0 when it writes the page. It prints the absolute path of the page on standard output, as one line. Before it, it prints each note on standard error, one note on each line.

The command exits with code 1 when the review cannot run. It prints one message on standard error and writes no page. It also removes the temporary worktree of the base.

## The error messages

In each message, a word in angle brackets is a value of the run.

| When | Message |
| --- | --- |
| The first argument is not `review` | the usage line below |
| A flag that takes a value has no value after it | `<flag> needs a value after it` |
| `--editor` names an editor that Callmap does not know | `--editor needs one of vscode, jetbrains after it` |
| An argument starts with `--` and is no flag | `<argument> is not a flag callmap review knows` |
| A second `<repo>` follows the first | `'<argument>' follows no flag. Callmap reviews one repo at a time.` |
| `<repo>` is not inside a git repo, or does not exist | `<folder> is not inside a git repo` |
| No `--base`, and the command finds no base branch | `<root> has no remote head, no main and no master to find a base on. Name one with --base.` |
| The branch shares no commit with the base branch | `HEAD shares no commit with <base branch> in <root>` |
| `--base` names no commit | `the base '<commit>' is not a commit in <root>` |
| The extractor fails on the branch | `the branch could not be read: <reason>` |
| The extractor fails on the base | `the base <short commit> could not be read: <reason>` |

- `<folder>` is the absolute path of `<repo>`.
- `<root>` is the top folder of the repo.
- `<short commit>` is the base commit with 7 characters.
- `<reason>` is the message of the extractor. The command removes the path of the read folder from it, so the reason names a repo-relative path.

The usage line of `callmap` today is this:

```
usage: callmap review [<repo>] [--base <commit>] [--scope <glob>]... [--tsconfig <file>] [--out <file>] [--no-open] [--no-cache] [--editor vscode|jetbrains] [--tests]
```

The usage line names only the flags of the distribution. So the usage line of `callmap-go` has no `--tsconfig`.

## The notes

A note tells the reader about a part of the review that the command left out or read in another way. The review still runs. These are the notes of `callmap` today:

- `callmap skipped the Go files, because go is not on the PATH.`
- `callmap skipped the Go files, because the Go extractor needs go 1.26 or later, and the go on the PATH is <version>.`
- `callmap skipped the Ruby files, because ruby is not on the PATH.`
- `callmap read each Go module on its own, because the go tool refused the go.work: <reason>`
- `callmap skipped the Go module <module>, because the go tool refused it: <reason>`
- `callmap read no functions in <file>, because Ripper could not parse it.`
- `The <view> view holds <functions and calls>, over the <view> limit of <calls>. The page opens on the <view> view.`

The last note goes when the page lays out every view, as ADR-0037 records. Then the level bar of the page tells the reader.

## The base cache

The base cache keeps the graph document of a base, so that a second review of the same base is fast. The key of each entry has these parts:

1. The base commit, as the full hash.
2. The effective scope.
3. The dependency files of the language. The key holds a hash of their content. A dependency file that does not exist adds nothing.
4. The version of the distribution.

The glossary lists the dependency files of each language. If a flag or a setting of the language changes the graph document, the key also holds it. For example, the key of `callmap-ts` holds the `--tsconfig` path.

The cache home is `$XDG_CACHE_HOME` if it holds an absolute path, else `~/.cache`. Each distribution keeps its cache in its own folder in the cache home, named for its command. For example, `callmap-go` uses `~/.cache/callmap-go`. `callmap` uses `~/.cache/callmap` today.

- **One folder for each repo.** The name of the folder is the SHA-256 of the git common folder of the repo. So the worktrees of one repo share their entries.
- **One file for each entry.** The name of the file is the SHA-256 of the key, with `.json`. The file holds the graph document.
- **20 entries for each repo.** A read of an entry makes it the newest. A write removes the oldest entries over 20.
- **A broken entry is a miss.** If an entry is not a valid graph document, the command reads the base again.
- **A failed write is not an error.** The review goes on without the entry.

## The data block

The reader page holds its data in one data block:

```html
<script type="application/json" id="reader-page-data">...</script>
```

The data block holds the review input as JSON, as ADR-0037 records. The command writes the JSON on one line. Each `<` in the JSON becomes `\u003c`. So no text in the JSON, such as `</script>` in a source file, can close the data block. The JSON parser of the page reads `\u003c` back as `<`.

The command writes the page from the page template, `page-template.html`. The page template holds the data block with the marker `{{CALLMAP_REVIEW_INPUT}}` in place of the JSON:

```html
<script type="application/json" id="reader-page-data">{{CALLMAP_REVIEW_INPUT}}</script>
```

The page template holds the marker once. The command puts the escaped JSON at the marker and changes no other byte of the page template. So the same review input and the same page template give a byte-identical page in every distribution.

The JSON Schema of the review input is `packages/review-input/review-input.schema.json`. It refers to the JSON Schema of the graph document, `packages/graph-document/graph-document.schema.json`. A distribution can check its review input against them, as ADR-0039 records. The schemas cannot check a rule that joins 2 fields, such as a caller that must be a function of the same document. The reader of the graph document checks these rules.
