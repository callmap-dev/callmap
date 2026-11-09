# The distributions live in one repo, named callmap

The 3 distributions and the code that they share live in one repo, `callmap-dev/callmap`. ADR-0036 gave each distribution its own repo. No distribution repo exists yet, so this change moves no code back. The owner made the decision for one repo and for its name on 2026-11-09.

This supersedes decisions 3 and 5 of ADR-0036, and its reason "The Go module sits at the root of its repo". It changes decisions 1, 6, 7 and 10 of ADR-0036. Decisions 2, 4, 8 and 9 of ADR-0036 stay.

## Decisions

1. **One repo.** `callmap-dev/callmap` holds the reader page, the review core, the JSON Schemas, the command contract, the conformance suite, the docs and the 3 distributions. On 2026-11-09, the repo `callmaphq/callmap-core` got the name `callmap`, and the org `callmaphq` got the name `callmap-dev`. GitHub redirects the old URL.
2. **One folder at the repo root for each distribution.** The folders are `callmap-ts/`, `callmap-go/` and `callmap-rb/`. Each folder holds the thin CLI and the extractor of its language. `callmap-ts/` is an npm workspace of the repo. For example, `packages/extractor-go/go` moves to `callmap-go/`.
3. **The Go module sits in `callmap-go/`.** The module path is `github.com/callmap-dev/callmap/callmap-go`, and the main package is the root of the module. So `go install github.com/callmap-dev/callmap/callmap-go@latest` gives the command `callmap-go`.
4. **Each distribution has its own version, and a tag with its name releases it.** The tag `callmap-go/v0.1.0` releases the Go module, as the go tool needs for a module in a subfolder. The tag `callmap-ts/v0.1.0` publishes the npm package `callmap-ts`. The tag `callmap-rb/v0.1.0` publishes the gem `callmap-rb`. A plain `v*` tag releases only `@callmap/cli`, until its last release.
5. **`callmap-go` commits a copy of each shared file that it embeds.** `go install` builds from the files of a tag and runs no npm build. So `go:embed` needs the page template and the test globs of Go inside `callmap-go/`. The CI fails when the copy of the test globs differs from the file of the core. The copy of the page template changes only in a pull request that prepares a release of `callmap-go`. The release job of a `callmap-go/v*` tag builds the page template from the tagged commit, and it fails when the copy differs.
6. **`callmap-ts` and `callmap-rb` commit no copy.** The build of the npm package and the build of the gem copy the page template from the build of the same commit. No distribution pins a version of the core, and no bot opens a pull request.
7. **The conformance suite reads the same checkout.** The CI runs the suite for each distribution on the fixture repos of the commit under test. No distribution downloads the fixture repos.
8. **The release assets go.** No distribution downloads them. The release job no longer packs them. `scripts/release-assets.ts`, its tests, `docs/release-assets.md` and the glossary entry **Release assets** go with them. The JSON Schemas, the test globs and the fixture repos stay as files of the repo.
9. **The migration keeps its 4 steps.** In step 2, `callmap-ts` becomes a folder of this repo, and not a new repo. After step 4, the old command in `packages/cli` and the 3 extractor packages go. The reader page then gets its own package.

## Why

- **One maintainer keeps one repo.** 4 repos need 4 CI setups, 4 sets of secrets and a bot for each pinned copy.
- **One pull request changes a contract and each user of it.** A change to the review input also changes the page, the expected files and each thin CLI. In one repo, one pull request holds them, and the CI checks them together. With 4 repos, the same change takes a release of the core and 3 more pull requests.
- **The go tool supports a module in a subfolder.** The tag `callmap-go/v0.1.0` gives the version, and the module zip holds only the files of `callmap-go/`. So the reason of ADR-0036 for a repo of its own does not hold.
- **The gains of ADR-0036 stay.** A Go user still needs no Node, and each distribution still reads one language.

## Considered options

- **One repo for each distribution.** This is decision 3 of ADR-0036. It was rejected for the cost of 4 repos to one maintainer.
- **The Go module at the repo root.** A plain `v*` tag then releases it. But the module zip then holds every file of the repo, and one version covers the 3 distributions.
- **A check at each commit that the page template of `callmap-go` equals the build.** Each change to the reader page then commits a new copy of the built page.
- **The release assets stay for a distribution outside this repo.** No such distribution exists, so the job, the script and the docs would have no user.

## Consequences

- **The install path of Go is longer.** It is `github.com/callmap-dev/callmap/callmap-go`, in place of `github.com/callmaphq/callmap-go`.
- **Each release tag has a prefix.** The release workflow reads the prefix to choose the distribution that it publishes.
- **The trusted publisher of npm must name the repo `callmap-dev/callmap`.** The owner changes it on npmjs.com before the next release.
- **Spec #24 and its open tickets #34 to #40 name the separate repos.** Their text changes before an agent builds them.
- **The ADRs before this one keep the name `callmaphq/callmap-core`.** A settled ADR is not rewritten.
