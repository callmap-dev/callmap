import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Assets } from './assets.ts';
import { cacheFolderOf } from './cache-folder.ts';
import { assets as typescriptAssets, packageNameAndVersion } from './typescript-package-assets.ts';

const goExtractorVersion = (goVersion: string): string =>
  [
    packageNameAndVersion(),
    readFileSync(new URL('go-extractor-source.sha256', import.meta.url), 'utf8'),
    goVersion,
  ].join('\0');

export const assets: Assets = {
  ...typescriptAssets,
  goExtractor: fileURLToPath(new URL('extract-go.js', import.meta.url)),
  goExtractorVersion,
  goExtractorEnv: (goVersion) => ({
    CALLMAP_GO_EXTRACTOR_SOURCE: fileURLToPath(new URL('go', import.meta.url)),
    CALLMAP_GO_EXTRACTOR_BINARY: join(
      cacheFolderOf('callmap'),
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
