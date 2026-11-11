import type { Distribution } from './distribution.ts';
import { TYPESCRIPT_FILES } from './languages.ts';
import { typescriptExtractor } from './typescript-extractor.ts';

export const CALLMAP_TS: Distribution = {
  command: 'callmap-ts',
  language: TYPESCRIPT_FILES,
  extractorsFor: (root, { tsconfig }) => [typescriptExtractor(root, tsconfig)],
};
