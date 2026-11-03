# A walk leaves out the files that git ignores

Each walk of Callmap leaves out a file that git ignores and does not track. The walk also skips a folder below its root that it cannot read. This covers the TypeScript, Ruby and Go walks, and the Go document. The walk of the base cache for dependency files skips only the folders that it cannot read. The base worktree gets a copy of a root `go.work` and `go.work.sum` that git does not track, and these files are often ignored. So the cache key must read them. The owner decided this in the review of pull request 20 on 2026-11-03.

This changes in part ADR-0011. ADR-0011 says that a reader cannot tell a file that the extractor left out from a file that the repo does not hold. A file that git ignores is now left out, and the `scope` field does not show it.

## Decisions

1. **One git call for each walk.** The walk gets the ignored paths once, from `git ls-files --others --ignored --exclude-standard --directory -z`, run in its root. A path in that list is not walked.
2. **A tracked file stays in.** Git does not list a tracked file as ignored. So a file that git tracks inside an ignored folder is still walked.
3. **The rules of the repo that holds the root apply.** If the root is a folder inside a git repo, the ignore rules of that repo apply, also when the root has no `.git` of its own. If no git repo holds the root, the walk enters every folder. Git does not go into a nested repo or a submodule, so the ignore rules of that inner repo do not apply.
4. **The walk never skips its root.** If an outer repo ignores the root, the walk still enters the root and reads its files.
5. **An unreadable folder below the root is skipped.** The walk skips a folder on `EACCES` or `EPERM`. An unreadable root still fails, because then the walk can read nothing.
6. **The Go document leaves out the files that git ignores.** The go tool loads each package folder in full. The Go extractor drops each file of `pkg.Syntax` whose path, or one of whose folders, is in the ignored list of the walk. A file that the walk does not take for another cause stays in, such as a symbolic link to a `.go` file. The document holds no call and no open end for a call into a dropped file, and the resolution rate does not count it.
7. **The document does not record this leave-out.** The `scope` field holds the scope globs only, as before. The leave-out is a walk rule, like the folders that `isSkippedDirectory` in `packages/scope/src/skipped.ts` and `skipped` in `packages/extractor-go/go/walk.go` name, and not a scope glob.

## Why

- **The review failed on a folder that a container owns.** A database container can own its data folder inside the worktree, such as `tools/devlocal/var/postgres`. The walk opened that folder and stopped with `EACCES`, whatever the scope. `--scope` did not help, because a scope glob filters files and not folders.
- **An ignored file is not code of the repo.** Build output, generated code and local data are ignored files. They make the graph larger, and they are not part of the change that a review shows. The base worktree never holds an untracked ignored source file, so a branch read that took one showed it as added code.
- **Git knows the rules.** The rules of `.gitignore`, `.git/info/exclude` and the global excludes file are complex. One git call gives the result that git uses, so no walk copies the rules.

## Consequences

- **A reader cannot see the leave-out.** The `scope` field does not show a file that git ignores. The same is true before this decision for the folders that `isSkippedDirectory` and the Go `skipped` name.
- **A `--scope` glob does not bring back an ignored file.** The walk does not enter the path, so no glob reaches it. To read such a file, track it in git or change the ignore rules.
- **The three walks keep their own copy.** A core package must not read the filesystem, per ADR-0009 and `test/core-is-language-blind-and-pure.test.ts`. So the TypeScript, Ruby and Go extractors each run the git call in their own walk, and the Go walk is a Go copy.
- **An outer repo that ignores `*` can hide a root.** A dotfiles repo in the home folder is an example. If the outer repo tracks no file in the root, git lists the root as one ignored path, and decision 4 walks it in full. If the outer repo tracks a file in the root, the walk takes only the files that the outer repo tracks.
