import type { Distribution } from './distribution.ts';
import { goExtractor } from './go-extractor.ts';
import { rubyExtractor } from './ruby-extractor.ts';
import { typescriptExtractor } from './typescript-extractor.ts';

export const CALLMAP: Distribution = {
  command: 'callmap',
  language: undefined,
  extractorsFor: (root, { tsconfig }) => [
    typescriptExtractor(root, tsconfig),
    goExtractor(),
    rubyExtractor(),
  ],
};
