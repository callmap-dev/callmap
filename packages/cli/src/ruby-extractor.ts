import { spawnSync } from 'node:child_process';
import { assets } from './assets.ts';
import { notingExtractionOf, once } from './extractor.ts';
import type { Extractor } from './extractor.ts';
import { RUBY_FILES } from './languages.ts';

const rubyVersionOnPath = (): string | undefined => {
  const finished = spawnSync('ruby', ['--version'], { encoding: 'utf8' });
  return finished.error === undefined && finished.status === 0 ? finished.stdout.trim() : undefined;
};

export const rubyExtractor = (): Extractor => {
  const rubyVersion = once(rubyVersionOnPath);
  return {
    language: 'ruby',
    dependencyFiles: [],
    options: [],
    version: () => assets.rubyExtractorVersion(rubyVersion() ?? ''),
    claimsAnyOf: RUBY_FILES.claimsAnyOf,
    readsInParallel: false,
    skipNote: () =>
      rubyVersion() === undefined
        ? 'callmap skipped the Ruby files, because ruby is not on the PATH.'
        : undefined,
    ...notingExtractionOf(assets.rubyExtractor, assets.rubyExtractorEnv),
  };
};
