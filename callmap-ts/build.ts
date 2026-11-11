import { chmodSync, copyFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pageTemplateBuild } from '@callmap/reader-page';
import { PAGE_TEMPLATE_FILE } from '@callmap/reader-page/page-template';
import { build } from 'rolldown';
import { noticesOf, npmNoticesOf } from './build-notices.ts';
import { assets, extractorSourceFiles } from './src/clone-assets.ts';
import { sha256OfFiles } from './src/file-hash.ts';

const PACKAGE = import.meta.dirname;
const DIST = join(PACKAGE, 'dist');
const CLONE_ASSETS = fileURLToPath(new URL('src/clone-assets.ts', import.meta.url));
const PACKAGE_ASSETS = join(PACKAGE, 'src', 'package-assets.ts');

rmSync(DIST, { recursive: true, force: true });
const { output } = await build({
  input: { cli: join(PACKAGE, 'src', 'cli.ts'), 'extract-typescript': assets.typescriptExtractor },
  platform: 'node',
  external: ['typescript'],
  logLevel: 'warn',
  plugins: [
    {
      // The package reads its own dist folder, so the build puts the package assets in place of the clone assets.
      name: 'package-assets',
      resolveId: async function (source, importer, options) {
        const resolved = await this.resolve(source, importer, { ...options, skipSelf: true });
        return resolved?.id === CLONE_ASSETS ? PACKAGE_ASSETS : null;
      },
    },
  ],
  output: { dir: DIST, format: 'esm' },
});

// npm makes a bin executable only when it links it, and a linked clone runs each new build.
chmodSync(join(DIST, 'cli.js'), 0o755);

const page = await pageTemplateBuild();
writeFileSync(join(DIST, PAGE_TEMPLATE_FILE), page.template);
writeFileSync(join(DIST, 'extractor-source.sha256'), sha256OfFiles(extractorSourceFiles()));
writeFileSync(
  join(DIST, 'THIRD-PARTY-NOTICES.txt'),
  noticesOf(
    npmNoticesOf([
      ...output.flatMap((chunk) => (chunk.type === 'chunk' ? chunk.moduleIds : [])),
      ...page.moduleIds,
    ]),
  ),
);
copyFileSync(join(PACKAGE, '..', 'LICENSE'), join(PACKAGE, 'LICENSE'));
