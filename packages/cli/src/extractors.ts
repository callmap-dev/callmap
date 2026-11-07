import type { ReviewInvocation } from './arguments.ts';
import type { Extractor } from './extractor.ts';
import { goExtractor } from './go-extractor.ts';
import { rubyExtractor } from './ruby-extractor.ts';
import { typescriptExtractor } from './typescript-extractor.ts';

export const extractorsFor = (
  root: string,
  { tsconfig }: Pick<ReviewInvocation, 'tsconfig'>,
): readonly Extractor[] => [typescriptExtractor(root, tsconfig), goExtractor(), rubyExtractor()];
