# Checks

```sh
npm install
npm run lint   # formatting, types, and eslint
npm test       # the whole suite
npm run test:browser
npm run test:pack
```

`npm run test:pack` packs `@callmap/cli` with `npm pack` and installs the tarball in a fixture repo with TypeScript, in one with Go and TypeScript, and in one with Ruby and TypeScript. Then it runs `callmap review` from that install and reads the page. It builds the Go extractor from the tarball with `GOPROXY=off` and an empty module cache. It also checks that a second review uses the binary again. It reads the Ruby files with the Ripper script in the tarball. The tarball may hold the manifest, the README, the LICENSE and the built files in `dist/`. It may also hold the Go source in `dist/go/` and the Ripper script of the Ruby extractor in `dist/ruby/`. Any other file fails the check. The install fetches `typescript` from npm. The check needs `go` 1.26 or later and `ruby` on the `PATH`. Plain `npm test` does not run this check. The CI runs it on each pull request, and the release workflow runs it before it publishes.

`npm run test:browser` builds reader pages from the fixture repos and opens them in headless Chromium. It reads the place of each label on the screen. It fails when a label runs past its box or its frame. It also fails when a box name runs over its "N fn" count. It also fails when a frame label or a "one of" label runs over a box. It checks the Diff, Folder and Whole project views. It checks each view in the Read, Scan and Map bands, in light mode and in dark mode. It also fails when an edge hint covers a box while the graph pans, when the zoom label has no room on either side or changes the width of the zoom controls, and when a chip of a level box in the Map band is smaller than at the reading floor or a box border is less than 1 px. In dark mode, it also fails when a box border in the Map band has a contrast below 3 to 1. Plain `npm test` does not run these checks.

The command does not download a browser. It uses the first Chromium that it finds:

1. The path in the `CALLMAP_CHROMIUM` environment variable.
2. The Chromium that Playwright keeps in its cache.
3. `chromium-browser` or `chromium` on the `PATH`.

If it finds no Chromium, the command fails and tells you how to get one.

The screenshots in the README and in `docs/reader-page.md` come from the fixture repos of `packages/cli`. `npm run screenshots` makes them again in light mode and in dark mode, and writes them to `docs/screenshots/`. It finds Chromium in the same way.
