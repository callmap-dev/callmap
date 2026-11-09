# Release assets

Each distribution shares a set of assets with this repo. A `v*` tag releases them. The release job attaches 2 files to the GitHub release of the tag:

- `callmap-core-assets-<version>.tar.gz` is the archive of the assets. The version is the tag without the `v`. So the tag `v0.2.0` gives `callmap-core-assets-0.2.0.tar.gz`.
- `callmap-core-assets-<version>.tar.gz.sha256` holds the SHA-256 checksum of the archive, in the format of `sha256sum`.

The archive holds one folder, `callmap-core-assets-<version>/`, with these assets:

- `page-template.html` is the page template. A distribution writes each reader page from it and the escaped review input.
- `graph-document.schema.json` is the JSON Schema of the graph document.
- `review-input.schema.json` is the JSON Schema of the review input.
- `test-globs.json` holds the test globs of each language. A review leaves out these files without `--tests`.
- `fixture-repos/` holds the fixture repos of the conformance suite. Each fixture repo holds its expected review input. `packages/conformance/README.md` tells how the suite reads them.

A distribution pins one version of the assets in a file of its repo. It downloads the archive and the checksum file of that version, and checks the archive before it unpacks it:

```sh
version=0.2.0
release=https://github.com/callmaphq/callmap-core/releases/download/v$version
curl -fLO "$release/callmap-core-assets-$version.tar.gz"
curl -fLO "$release/callmap-core-assets-$version.tar.gz.sha256"
sha256sum -c "callmap-core-assets-$version.tar.gz.sha256"
tar -xzf "callmap-core-assets-$version.tar.gz"
```

The CI of the distribution then runs the conformance suite on the fixture repos of the pinned version. It gives the folder to the suite with `--fixtures callmap-core-assets-<version>/fixture-repos`.

The release job builds the assets from the tagged commit with `npm run release-assets`. The script `scripts/release-assets.ts` packs the assets and runs the conformance suite on the packed fixture repos, with the `callmap` command of the same commit. If the suite fails, the script writes no archive, and the job stops before it publishes anything. For example, this writes the archive of `v0.2.0` to `release-assets/`:

```sh
npm run release-assets -- v0.2.0 release-assets node packages/cli/src/cli.ts
```

The script reads the page template from `packages/cli/dist/`, so run `npm run build` first.
