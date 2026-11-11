import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PAGE_TEMPLATE_FILE } from '@callmap/reader-page/page-template';
import type { Assets } from './assets.ts';
import { packageManifestAt, typescriptVersionFor } from './package-manifest.ts';

const TYPESCRIPT_EXTRACTOR = fileURLToPath(new URL('extract-typescript.js', import.meta.url));

export const packageNameAndVersion = (): string => {
  const { name, version } = packageManifestAt(new URL('../package.json', import.meta.url));
  return `${name} ${version}`;
};

export const assets: Assets = {
  typescriptExtractor: TYPESCRIPT_EXTRACTOR,
  pageTemplate: () =>
    Promise.resolve(readFileSync(new URL(PAGE_TEMPLATE_FILE, import.meta.url), 'utf8')),
  typescriptExtractorVersion: () => {
    const source = readFileSync(new URL('extractor-source.sha256', import.meta.url), 'utf8');
    return `${packageNameAndVersion()}\0typescript ${typescriptVersionFor(TYPESCRIPT_EXTRACTOR)}\0${source}`;
  },
};
