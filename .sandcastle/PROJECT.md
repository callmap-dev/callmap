# Project map

The agents read this file before they work. Keep it short and correct.

## Layout

Callmap is an npm workspace with these packages in `packages/`:

- `cli`: the `callmap` command and the reader page.
- `review`, `graph-document`, `scope`, `editor-link`: the core packages.
- `extractor-typescript`, `extractor-go`, `extractor-ruby`: the extractors. `extractor-go` builds and runs the Go extractor of `callmap-go/cmd/callmap-extract-go`. The Ruby extractor runs the Ripper script of `callmap-rb/lib/callmap_rb/ripper/read.rb`.

`callmap-go/` is the Go module of the distribution `callmap-go`: its review command at the root of the module, the Go extractor in `internal/extractor/`, the vendored modules, and committed copies of the page template and of the test globs. Its tests in `callmap-go/test/` run in `npm test`.

`callmap-rb/` is the gem of the distribution `callmap-rb`: its thin CLI in Ruby, the Ripper script that `extractor-ruby` also runs, and the Ruby rules of the direct calls in `lib/callmap_rb/extractor/`. The gem build copies the page template of `packages/cli/dist/`, so its tests in `callmap-rb/test/` need `npm run build` first. They run in `npm test`.

`callmap-ts/` is the npm workspace of the distribution `callmap-ts`: its thin CLI in `callmap-ts/src/`, its build and its tests. It reuses the review command of `packages/cli/src/` and bundles the TypeScript extractor. ADR-0040 records the folder.

Shared tests are in `test/`.

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
- `npm run test:pack`: run it when you change what `@callmap/cli` or `callmap-ts` packs.

Do not run `npm run test:browser` or `npm run screenshots`. The runner has no Chromium.

## Known pre-existing failures

None.
