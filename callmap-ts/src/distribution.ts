import type { ReviewInvocation } from './arguments.ts';
import type { Extractor } from './extractor.ts';
import type { LanguageFiles } from './languages.ts';

export interface Distribution {
  readonly command: string;
  /** The one language that the distribution reads. */
  readonly language: LanguageFiles;
  readonly extractorsFor: (
    root: string,
    invocation: Pick<ReviewInvocation, 'tsconfig'>,
  ) => readonly Extractor[];
}
