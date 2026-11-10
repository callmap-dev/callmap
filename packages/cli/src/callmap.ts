import type { Distribution } from './distribution.ts';
import { goExtractor } from './go-extractor.ts';
import { rubyExtractor } from './ruby-extractor.ts';
import { typescriptExtractor } from './typescript-extractor.ts';

export const CALLMAP: Distribution = {
  command: 'callmap',
  language: undefined,
  notice: '@callmap/cli is replaced by callmap-ts. Run npx callmap-ts.',
  extractorsFor: (root, { tsconfig }) => [
    typescriptExtractor(root, tsconfig),
    goExtractor(),
    rubyExtractor(),
  ],
};
