import type { ReviewInvocation } from './arguments.ts';
import type { Extractor } from './extractor.ts';
import type { LanguageFiles } from './languages.ts';

export interface Distribution {
  readonly command: string;
  /** The one language that the distribution reads, or undefined for a command that reads every language. */
  readonly language: LanguageFiles | undefined;
  /** A line that the command prints on each run, before it reads the arguments. */
  readonly notice?: string;
  readonly extractorsFor: (
    root: string,
    invocation: Pick<ReviewInvocation, 'tsconfig'>,
  ) => readonly Extractor[];
}
