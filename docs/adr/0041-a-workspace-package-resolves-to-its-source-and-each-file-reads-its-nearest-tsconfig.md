# A workspace package resolves to its source, and each file reads its nearest tsconfig

The TypeScript extractor reads the nearest `tsconfig.json` above each file. An import of a workspace package resolves to the source of that package in the repo. So a call into a workspace package is a call, and a call through a path alias of one app is a call. The owner decided this on 2026-11-20, after a review of a private pnpm workspace.

This changes the rule that the extractor reads one `tsconfig.json`, at the repo root.

## Decisions

1. **Each file reads the nearest `tsconfig.json` above it.** The extractor looks in the folder of the file, then in each parent folder, up to the repo root. It reads only a file with the name `tsconfig.json`, and never a `tsconfig.build.json`. The path aliases and the module resolution of that file apply to the imports of the file.
2. **A file with no `tsconfig.json` above it gets the default options.** These are the options that a repo with no root `tsconfig.json` gets today.
3. **`--tsconfig` names one file for every file.** With `--tsconfig`, the extractor uses that one file for every file in scope, as before, and decision 1 does not apply.
4. **A workspace package is an import that resolves through `node_modules` to a folder inside the repo.** The extractor follows the link in `node_modules` to its real path. If the real path is inside the repo and not inside a `node_modules` folder, the package is a workspace package. The extractor reads no `pnpm-workspace.yaml` and no `workspaces` field.
5. **An import of a workspace package resolves to its source.** When the package exports a file in its build folder, the extractor maps that file to the source file with the `outDir` and the `rootDir` of the `tsconfig.json` of the package, as TypeScript project references do. So `dist/index.d.ts` gives `src/index.ts`.
6. **The source wins over the build.** When the build folder exists, the import still resolves to the source.
7. **A call that crosses a network stays out.** A call on a client that a library makes from a contract, such as `api.orders.list.queryOptions`, is a library call. The graph draws no line from it to the handler of the contract.

## Why

- **The review lost the calls that it must show.** In a review of 37 changed functions, 185 open ends with the reason "code not found" named a function of the repo. The app kept its `@/*` alias in `apps/web/tsconfig.json`, and the repo had no root `tsconfig.json`. Two packages exported from a `dist` folder that no one built.
- **A fresh worktree has no build.** A reviewer often makes a worktree for one review. A rule that needs a build gives a graph with lost calls and no message.
- **One rule covers each package manager.** pnpm, npm and yarn each put a link in `node_modules` for a workspace package. So the extractor needs no parser for each workspace file.
- **The graph must not change with the build state.** With decision 6, the same commit gives the same graph before a build and after it.
- **A flag that hides the open ends hides the lost calls.** The owner first asked for that flag. The open ends were the only sign of the cause, so the flag was not built.

## Consequences

- **The review needs installed dependencies.** Decision 4 reads the links in `node_modules`. In a checkout with no `node_modules`, an import of a workspace package stays an open end with the reason "code not found". The review prints a warning for each run that has such imports.
- **A package with no `outDir` and no `rootDir` is not mapped.** If the map of decision 5 finds no source file, the import resolves as the type checker resolves it, to the build file or to nothing.
- **The cache key reads more files.** The cache entry of the base belongs to each `tsconfig.json` in the repo, and not only to the one at the root.
- **The options can differ between 2 files.** A file of one app and a file of another app can resolve the same import text to 2 files. This is correct, because each app compiles with its own config.
- **A client to handler line needs its own decision.** No checker proves that line, so ADR-0027 and decision 7 keep it out.
