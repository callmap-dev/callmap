# Each language has its own distribution in its own repo

> Changed in part by ADR-0038. Decision 7: the conformance suite compares the review input by its structure after it unpacks the sources and masks the machine facts, not by its bytes.

Callmap ships one distribution for each language: `callmap-ts` on npm, `callmap-go` as a Go module and `callmap-rb` as a gem. Each distribution reads only the files of its own language, so its user needs no tool of another language. Each distribution lives in its own repo of the GitHub org `callmaphq`. The current repo becomes `callmaphq/callmap-core` and holds what the distributions share. The owner made these decisions in a grilling on 2026-11-07.

This supersedes decision 1 of ADR-0025 and its reason "One page for a mixed branch". It supersedes ADR-0026, because `callmap-ts` carries only the TypeScript extractor. It changes ADR-0021: `@callmap/cli` is no longer the one package on npm.

## Decisions

1. **One distribution for each language.** The package names are the command names: `callmap-ts`, `callmap-rb`, and `callmap-go` from the module `github.com/callmaphq/callmap-go`.
2. **A distribution reads only its own language.** A branch that changes Go and TypeScript gives 2 reader pages, one from `callmap-go` and one from `callmap-ts`.
3. **One repo for each distribution, and one core repo.** `callmap-core` holds the reader page, the review core, the ELK layout, the JSON Schema of the graph document and of the review input, the command contract, the test globs of each language as data, the conformance fixtures and the docs. Each distribution repo holds its CLI and its extractor. For example, `packages/extractor-go/go` moves to `callmap-go`.
4. **The core shares contracts and built files, not code.** A Go or Ruby program cannot import TypeScript. So each distribution writes its own thin CLI in its language: git, the base cache, scope matching and the page writer.
5. **Each distribution commits a pinned copy of the built page.** `callmap-core` releases the built `page.js` and `page.css` as release assets. Each distribution repo commits a copy and pins its version in a file. A bot opens a pull request when a new page version comes out.
6. **Each repo has its own version.** The review input carries a format version, and the page refuses a format that it does not know.
7. **One conformance suite.** `callmap-core` holds the fixture repos and the expected review input for each language. The CI of each distribution fetches them at its pinned page version. The review input of a distribution must be byte-identical to the expected file. The suite also tests the command contract: `review`, `--base`, `--tests`, the scope globs, the base cache and the editor link.
8. **`callmap-rb` ports the Ruby rules to Ruby.** Today about 1,300 lines of these rules are TypeScript in `packages/extractor-ruby/src`. The rate on `mastodon/mastodon` at `7be1842` must stay at 47.6%.
9. **`@callmap/cli` gets one last release.** Its deprecation message points to `callmap-ts`.
10. **The migration has 4 steps, and each step leaves a working command.** First, the review core and the layout move into the page (ADR-0037). Second, the repo moves to `callmaphq`, and `callmap-ts` splits out. Third comes `callmap-go`, and fourth comes `callmap-rb`.

## Why

- **A Go user needs no Node.** ADR-0021 decision 1 makes sure that a TypeScript user needs no Go and no Ruby. Before this decision, a Go or Ruby user still needed Node 22.18.
- **A distribution with one language is small.** If `callmap-go` ran every extractor, it would embed the TypeScript extractor and the pinned `typescript`, about 9 MB compressed, and it would still need `node` for a mixed branch.
- **The Go module sits at the root of its repo.** `go install` builds from the source of a tag, and runs no npm build. In its own repo, the module takes plain `v*` tags, and `go:embed` reads the committed page.
- **The contract is the review input, not a version.** One version for 4 repos would release every repo for each change.

## Considered options

- **Each distribution runs every extractor.** This keeps one page for a mixed branch, but the Go and Ruby distributions then need `node` for TypeScript.
- **The runs of each language share one page through the cache.** Each run writes its graph documents to the cache, and each run writes the page from every document of that base and branch. It was rejected as too complex for the gain.
- **One copy of the CLI logic compiled to WebAssembly.** A gem would need a native WebAssembly runtime, such as `wasmtime-rb`. WebAssembly also cannot run `git`, so each distribution would still write the git part.
- **One native core binary for each platform.** ADR-0026 rejected a binary for each platform.

## Consequences

- **A mixed branch costs 2 commands and 2 pages.** The page of one language does not show the files that the branch changed in the other language. The "across files and languages" claim of `docs/product.md` needs a change.
- **The thin CLI has 3 copies.** Each copy is about 700 lines. The conformance suite keeps them equal.
- **The glossary and every ADR stay in `callmap-core`,** also the ADRs of one language, such as ADR-0024 and ADR-0027. The distribution repos link to them.
- **The glossary entries for the resolution rate, the checker and the dependency file still say "for each language".** They change when the distributions ship.
