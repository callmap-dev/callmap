# Project map

The agents read this file before they work. Keep it short and correct.

## Layout

Callmap is an npm workspace with these packages in `packages/`:

- `cli`: the `callmap` command and the reader page.
- `review`, `graph-document`, `scope`, `editor-link`: the core packages.
- `extractor-typescript`, `extractor-go`, `extractor-ruby`: the extractors. The Go extractor has Go source in `packages/extractor-go/go/`. The Ruby extractor runs a Ripper script.

Shared tests are in `test/`.

## Docs to read first

- `CONTRIBUTING.md`: the checks, the branch names and the commit format.
- `GLOSSARY.md`: the words of the project. Use them in code, tests and commits.
- `docs/adr/`: the decisions. Read the ADRs of the part that you change. Do not rewrite a settled ADR.
- `docs/product.md`: what Callmap is for.

## Checks

Run `npm ci` first if `node_modules` is missing. Then run these from the repo root:

- `npm run lint`: Prettier, `tsc` and ESLint. `npm run format` fixes the format.
- `npm test -- --testTimeout=30000 --hookTimeout=60000`: the whole Vitest suite. The runner has `go` and `ruby` on the `PATH`.
- `npm run test:pack`: run it when you change what `@callmap/cli` packs.

Do not run `npm run test:browser` or `npm run screenshots`. The runner has no Chromium.

## Known pre-existing failures

None.
