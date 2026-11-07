import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Assets } from './assets.ts';
import { callmapCacheFolder } from './cache-folder.ts';
import { packageManifestAt, typescriptVersionFor } from './package-manifest.ts';
import { PAGE_TEMPLATE_FILE } from './page-template.ts';

const TYPESCRIPT_EXTRACTOR = fileURLToPath(new URL('extract-typescript.js', import.meta.url));

const packageNameAndVersion = (): string => {
  const { name, version } = packageManifestAt(new URL('../package.json', import.meta.url));
  return `${name} ${version}`;
};

const goExtractorVersion = (goVersion: string): string =>
  [
    packageNameAndVersion(),
    readFileSync(new URL('go-extractor-source.sha256', import.meta.url), 'utf8'),
    goVersion,
  ].join('\0');

export const assets: Assets = {
  typescriptExtractor: TYPESCRIPT_EXTRACTOR,
  pageTemplate: () =>
    Promise.resolve(readFileSync(new URL(PAGE_TEMPLATE_FILE, import.meta.url), 'utf8')),
  typescriptExtractorVersion: () => {
    const source = readFileSync(new URL('extractor-source.sha256', import.meta.url), 'utf8');
    return `${packageNameAndVersion()}\0typescript ${typescriptVersionFor(TYPESCRIPT_EXTRACTOR)}\0${source}`;
  },
  goExtractor: fileURLToPath(new URL('extract-go.js', import.meta.url)),
  goExtractorVersion,
  goExtractorEnv: (goVersion) => ({
    CALLMAP_GO_EXTRACTOR_SOURCE: fileURLToPath(new URL('go', import.meta.url)),
    CALLMAP_GO_EXTRACTOR_BINARY: join(
      callmapCacheFolder(),
      'go-extractor',
      createHash('sha256').update(goExtractorVersion(goVersion)).digest('hex'),
      'callmap-extract-go',
    ),
  }),
  rubyExtractor: fileURLToPath(new URL('extract-ruby.js', import.meta.url)),
  rubyExtractorVersion: (rubyVersion) =>
    [
      packageNameAndVersion(),
      readFileSync(new URL('ruby-extractor-source.sha256', import.meta.url), 'utf8'),
      rubyVersion,
    ].join('\0'),
  rubyExtractorEnv: () => ({
    CALLMAP_RUBY_EXTRACTOR_SCRIPT: fileURLToPath(new URL('ruby/read.rb', import.meta.url)),
  }),
};
