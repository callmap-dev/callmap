---
name: callmap-review
description: Review a branch with Callmap. Use when the user asks for a Callmap review, or asks to see the calls that a branch changed.
---

Run the review command of the Callmap distribution for the language of the repo that the user names, or of the current directory:

- `callmap-ts review` for TypeScript and JavaScript. Run `npx callmap-ts review` when `callmap-ts` is not installed.
- `callmap-go review` for Go.
- `callmap-rb review` for Ruby.

Each command reads only the files of its language. When the branch holds files of another language too, the command prints one line that names the distribution for them. Run that distribution too only when the user asks for it.

Pass a flag only when the user asks for it:

- `--base <commit>` for a different base.
- `--scope <glob>` for each subtree, and `--scope '!<glob>'` for each set of files to leave out.
- `--tsconfig <file>` for a TypeScript config that is not at the repo root. Only `callmap-ts` takes it.
- `--editor jetbrains` for a JetBrains editor.

The command writes the reader page, prints its path and opens it in the browser. Give the user that path. If the command fails, give the user its error text as it is.
