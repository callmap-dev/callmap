import { chmodSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'rolldown';
import { assets, extractorSourceFiles } from './clone-assets.ts';
import { sha256OfFiles } from './file-hash.ts';
import { pageTemplateBuild } from './page-build.ts';
import { PAGE_TEMPLATE_FILE } from './page-template.ts';

const CLONE_ASSETS = fileURLToPath(new URL('clone-assets.ts', import.meta.url));

export interface TypescriptPackage {
  readonly dist: string;
  readonly cli: string;
  /** The module that the build puts in place of the clone assets, so the package reads its own dist folder. */
  readonly packageAssets: string;
  readonly otherExtractors: Readonly<Record<string, string>>;
}

export const buildTypescriptPackage = async ({
  dist,
  cli,
  packageAssets,
  otherExtractors,
}: TypescriptPackage): Promise<readonly string[]> => {
  rmSync(dist, { recursive: true, force: true });
  const { output } = await build({
    input: { cli, 'extract-typescript': assets.typescriptExtractor, ...otherExtractors },
    platform: 'node',
    external: ['typescript'],
    logLevel: 'warn',
    plugins: [
      {
        name: 'package-assets',
        resolveId: async function (source, importer, options) {
          const resolved = await this.resolve(source, importer, { ...options, skipSelf: true });
          return resolved?.id === CLONE_ASSETS ? packageAssets : null;
        },
      },
    ],
    output: { dir: dist, format: 'esm' },
  });

  // npm makes a bin executable only when it links it, and a linked clone runs each new build.
  chmodSync(join(dist, 'cli.js'), 0o755);

  const page = await pageTemplateBuild();
  writeFileSync(join(dist, PAGE_TEMPLATE_FILE), page.template);
  writeFileSync(join(dist, 'extractor-source.sha256'), sha256OfFiles(extractorSourceFiles()));
  return [
    ...output.flatMap((chunk) => (chunk.type === 'chunk' ? chunk.moduleIds : [])),
    ...page.moduleIds,
  ];
};
