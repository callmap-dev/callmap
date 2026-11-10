import { readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pageTemplate } from '@callmap/reader-page';
import type { Assets } from './assets.ts';
import { sha256OfFiles } from './file-hash.ts';
import type { NamedFile } from './file-hash.ts';
import { typescriptVersionFor } from './package-manifest.ts';

const TYPESCRIPT_EXTRACTOR = fileURLToPath(new URL('../extractor/cli.ts', import.meta.url));

const sourceFilesOf = (folder: string): readonly string[] =>
  readdirSync(folder, { recursive: true, encoding: 'utf8' })
    .filter((file) => file.endsWith('.ts'))
    .sort();

export const extractorSourceFiles = (): readonly NamedFile[] => {
  const scope = dirname(createRequire(TYPESCRIPT_EXTRACTOR).resolve('@callmap/scope'));
  return (
    [
      ['extractor', dirname(TYPESCRIPT_EXTRACTOR)],
      ['scope', scope],
    ] as const
  ).flatMap(([name, folder]) =>
    sourceFilesOf(folder).map((file) => ({ name: `${name}/${file}`, path: join(folder, file) })),
  );
};

export const assets: Assets = {
  typescriptExtractor: TYPESCRIPT_EXTRACTOR,
  pageTemplate,
  typescriptExtractorVersion: () =>
    sha256OfFiles(
      extractorSourceFiles(),
      `typescript ${typescriptVersionFor(TYPESCRIPT_EXTRACTOR)}\0`,
    ),
};
