# Checks

```sh
npm install
npm run lint   # formatting, types, and eslint
npm test       # the whole suite
npm run test:browser
npm run test:pack
```

`npm run test:pack` packs `callmap-ts`. It runs `npx` with the tarball in a fixture repo with TypeScript, in one with Go and in one with Ruby. It checks the page and the line that names the distribution of each other language. The tarball of `callmap-ts` may hold the manifest, the README, the LICENSE and the built files in `dist/`. Any other file fails the check. The install fetches `typescript` from npm. The check needs no `go` and no `ruby`. Plain `npm test` does not run this check. The CI runs it on each pull request, and the release workflow runs it before it publishes `callmap-ts`.

`npm test` runs the tests of the core from review input files, with no git and no extractor. It runs the tests of `callmap-ts` in `callmap-ts/test/` from the source: they run `callmap-ts review` on fixture repos with git history and read the page.

`npm test` also runs the tests of `callmap-go` in `callmap-go/test/`. They run `go install` in `callmap-go/` with `GOPROXY=off` and an empty module cache. Then they run `callmap-go review` from that install on fixture repos and read the page, and they run the conformance suite for Go against it. They also fail when the copy of the test globs in `callmap-go/` differs from `packages/scope/test-globs.json`.

`npm test` also runs the tests of `callmap-rb` in `callmap-rb/test/`. They build the gem in `callmap-rb/` and install it into a temporary gem home. Then they run `callmap-rb review` from that install with no Node on the `PATH`, read the page, and run the conformance suite for Ruby against it. They compare the graph document of its fixture repo with `callmap-rb/test/fixture-graph-document.json`, the graph document that the Ruby extractor of `@callmap/cli` gave. They also run the Ruby rules on the fixture repo in `callmap-rb/test/fixture/`. The gem build copies the page template from `packages/reader-page/dist/`, so run `npm run build` before the tests.

`npm run test:browser` builds reader pages from review input files and opens them in headless Chromium. It reads the place of each label on the screen. It fails when a label runs past its box or its frame. It also fails when a box name runs over its "N fn" count. It also fails when a frame label or a "one of" label runs over a box. It checks the Diff, Folder and Whole project views. It checks each view in the Read, Scan and Map bands, in light mode and in dark mode. It also fails when an edge hint covers a box while the graph pans, when the zoom label has no room on either side or changes the width of the zoom controls, and when a chip of a level box in the Map band is smaller than at the reading floor or a box border is less than 1 px. In dark mode, it also fails when a box border in the Map band has a contrast below 3 to 1. Plain `npm test` does not run these checks.

The command does not download a browser. It uses the first Chromium that it finds:

1. The path in the `CALLMAP_CHROMIUM` environment variable.
2. The Chromium that Playwright keeps in its cache.
3. `chromium-browser` or `chromium` on the `PATH`.

If it finds no Chromium, the command fails and tells you how to get one.

The screenshots in the README and in `docs/reader-page.md` come from the review input files of `packages/reader-page`. `npm run screenshots` makes them again in light mode and in dark mode, and writes them to `docs/screenshots/`. It finds Chromium in the same way.

## The CI legs of each distribution

`.github/workflows/ci.yml` runs the lint and the tests of the core and of the page in one job on Linux. Each distribution has its own job, a matrix of 3 legs:

| Distribution | Linux, current runtime           | macOS, current runtime           | Linux, runtime floor                |
| ------------ | -------------------------------- | -------------------------------- | ----------------------------------- |
| `callmap-ts` | `callmap-ts on Linux, Node 22.x` | `callmap-ts on macOS, Node 22.x` | `callmap-ts on Linux, Node 22.18.0` |
| `callmap-go` | `callmap-go on Linux, Go 1.26.x` | `callmap-go on macOS, Go 1.26.x` | `callmap-go on Linux, Go 1.26.0`    |
| `callmap-rb` | `callmap-rb on Linux, Ruby 3.4`  | `callmap-rb on macOS, Ruby 3.4`  | `callmap-rb on Linux, Ruby 3.1`     |

Each leg runs the tests of the distribution and then its conformance suite against the installed review command. The floor leg runs the floor that the manifest of the distribution declares: `engines` in `callmap-ts/package.json`, the `go` line in `callmap-go/go.mod` and `required_ruby_version` in `callmap-rb/callmap-rb.gemspec`. A raise of a floor changes the floor leg in the same commit. `CONTRIBUTING.md` tells what each leg of each distribution runs.

## The audit command and the field run command

The 2 commands are tools of the repo for the gates of ADR-0042. They live in `packages/gates/`. No distribution ships them, and they are not part of the stable surface. `packages/gates/README.md` gives each flag of each command.

- `npm run audit` reads a reader page and a seed, and writes an audit sheet: a sample of the lines of the source text that can hold a call, with what the graph document holds on each line. `npm run audit -- --verdicts <audit sheet>` counts the verdicts of a filled audit sheet. It exits with code 1 when a verdict is `wrong` or empty.
- `npm run field-run` reads a list file of repos with pinned commits and the review command of one distribution. It reviews each repo and writes a field record with the exit code, the notes, the time of a first review and of a cached review, and the resolution rate of each repo. It exits with code 1 when a repo failed.

`npm test` runs the tests of both commands in `test/audit-sheet.test.ts` and `test/field-run.test.ts`, on the fixture repos of the conformance suite. They need no network. A test of `test/field-run.test.ts` also reads each list file of `docs/research/field-repos/` with the field run command, and checks that each list holds 5 repos at full commit hashes, with the audit repo first.

## The gates of version 1.0

ADR-0042 gives each distribution 5 gates. Pass each gate again before each 1.0 tag of a distribution. Run the steps below from the root of a clone, with the released version of the distribution installed. The examples use `callmap-ts`. For `callmap-go`, use `go.json`, `go-gitea/gitea` and the command `callmap-go`. For `callmap-rb`, use `ruby.json`, `mastodon/mastodon` and the command `callmap-rb`.

### The audit

1. Clone the audit repo, the first entry of the list file in `docs/research/field-repos/`, and check out its branch commit. Install its dependencies as a user does: `npm ci --ignore-scripts` for TypeScript, and `go mod download` for Go with a go of at least the version of its `go.mod`. A Ruby repo needs no install.
2. Write the reader page with the released distribution: `callmap-ts review --base <base commit> --out review.html --no-open --no-cache`.
3. Pick a seed, and write the audit sheet into the research folder: `npm run audit -- review.html --seed <seed> --repo apache/echarts --distribution callmap-ts --version <version> --out docs/research/<date>-audit-of-callmap-ts/audit-sheet.md`. A small `--count` first gives a quick look at the sheet.
4. Check each section by hand against the code. A call must be the right call, a one-of group must hold each implementation, and an open end must have a true open-end reason. A section where the graph document holds nothing must be a library call. Write `right` or `wrong` after `Verdict:`.
5. Count the verdicts: `npm run audit -- --verdicts docs/research/<date>-audit-of-callmap-ts/audit-sheet.md`. The gate passes with exit code 0, when each verdict is `right`. Each `wrong` verdict gets an issue.
6. Commit the filled audit sheet, so that a stranger can check each verdict.

### The 5 repos and the run times

1. Run the field run on the list of the language: `npm run field-run -- --list docs/research/field-repos/typescript.json --distribution callmap-ts --version <version> --runtime "Node $(node --version | cut -c 2-)" --out docs/research/<date>-field-run-of-callmap-ts/field-record.md callmap-ts`. For `callmap-go`, `--runtime` names the Go version of `go version`, and for `callmap-rb` the Ruby version of `ruby --version`. The command clones each repo, so it needs the network. It installs no dependency of a repo. The review then reads each repo as a fresh clone. The go tool of `callmap-go` uses only the module cache, so a Go module whose dependencies are not in the cache gives a note, and that note is true.
2. The 5 repos gate passes when the command exits with code 0, so no repo crashed, and each note in the record is true. Check each note by hand. A crash or a false note gets an issue.
3. Copy the time of a first review and of a cached review of the audit repo from the record to the README of the distribution, with the runtime, the processor and the system of the head of the record. ADR-0042 states these times and promises none.
4. Commit the field record.

### The use record

Each review of a real branch with a released version adds one line to the use record of the distribution in `docs/research/use-records/`. The head of each file tells the columns. The gate passes with 20 lines, when each line with a wrong call or a crash links an issue and each linked issue is closed.

### The CI

The gate passes when the 3 legs of the job of the distribution pass on the commit of the tag.
