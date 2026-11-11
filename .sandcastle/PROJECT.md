# Project map

The agents read this file before they work. Keep it short and correct.

## Layout

Callmap is an npm workspace with these packages in `packages/`:

- `review`, `graph-document`, `review-input`, `scope`, `editor-link`: the core packages.
- `reader-page`: the reader page. The page script is in `page/`, and `build/` builds the page template. Its tests in `test/` build each page from a review input file, with no git and no extractor. `review-inputs/` holds the review input files that are not expected files of the conformance suite.
- `conformance`: the conformance suite and its fixture repos.

`callmap-ts/` is the npm workspace of the distribution `callmap-ts`: its thin CLI in `callmap-ts/src/`, its TypeScript extractor in `callmap-ts/extractor/`, its build and its tests. ADR-0040 records the folder.

`callmap-go/` is the Go module of the distribution `callmap-go`: its review command at the root of the module, the Go extractor in `internal/extractor/`, the vendored modules, and committed copies of the page template and of the test globs. Its tests in `callmap-go/test/` run in `npm test`. They also build the Go extractor of `cmd/callmap-extract-go` and run it as a process.

`callmap-rb/` is the gem of the distribution `callmap-rb`: its thin CLI in Ruby, the Ripper script, and the Ruby rules in `lib/callmap_rb/extractor/`. The gem build copies the page template of `packages/reader-page/dist/`, so its tests in `callmap-rb/test/` need `npm run build` first. They run in `npm test`.

Shared tests are in `test/`. `test/fixture-repos/` holds the fixture repos with git history that the tests of the distributions review.

## Docs to read first

- `CONTRIBUTING.md`: the checks, the branch names and the commit format.
- `CODING_STANDARDS.md`: the rules that a review checks.
- `GLOSSARY.md`: the words of the project. Use them in code, tests and commits.
- `docs/adr/`: the decisions. Read the ADRs of the part that you change. Do not rewrite a settled ADR.
- `docs/product.md`: what Callmap is for.

## Checks

Run `npm ci` first if `node_modules` is missing. Then run these from the repo root:

- `npm run lint`: Prettier, `tsc` and ESLint. `npm run format` fixes the format.
- `npm test -- --testTimeout=30000 --hookTimeout=60000`: the whole Vitest suite. The runner has `go` and `ruby` on the `PATH`.
- `npm run test:pack`: run it when you change what `callmap-ts` packs.

Do not run `npm run test:browser` or `npm run screenshots`. The runner has no Chromium.

## Known pre-existing failures

None.
