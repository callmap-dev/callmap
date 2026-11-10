import type { Distribution } from '@callmap/cli/src/distribution.ts';
import { TYPESCRIPT_FILES } from '@callmap/cli/src/languages.ts';
import { typescriptExtractor } from '@callmap/cli/src/typescript-extractor.ts';

export const CALLMAP_TS: Distribution = {
  command: 'callmap-ts',
  language: TYPESCRIPT_FILES,
  extractorsFor: (root, { tsconfig }) => [typescriptExtractor(root, tsconfig)],
};
