import type { FunctionId } from '@callmap/graph-document';
import type { FunctionMark, LineSpan, ReviewFunction } from '@callmap/review';
import type { SourceTexts, Sources } from '@callmap/review-input';
import type { ReaderPageData } from './data.ts';

export type PageFunction = ReviewFunction;

export const isChangeMark = (mark: FunctionMark | undefined): boolean =>
  mark !== undefined && mark !== 'neighbour';

export const pageFunctionsOf = (data: ReaderPageData): ReadonlyMap<FunctionId, PageFunction> =>
  new Map(data.review.allFunctions.map((shown): [FunctionId, PageFunction] => [shown.id, shown]));

export interface FunctionText {
  readonly firstLine: number;
  readonly text: string;
}

export type FunctionCode =
  | { readonly kind: 'diff'; readonly base: FunctionText; readonly branch: FunctionText }
  | { readonly kind: 'added' | 'removed' | 'kept'; readonly code: FunctionText };

const textOf = (
  texts: SourceTexts,
  file: string,
  { firstLine, lastLine }: LineSpan,
): FunctionText => ({
  firstLine,
  text: (texts[file] ?? '')
    .split(/\r?\n/)
    .slice(firstLine - 1, lastLine)
    .join('\n'),
});

export const functionCodeOf = (
  data: ReaderPageData,
  { base, branch }: Sources,
  shown: PageFunction,
): FunctionCode => {
  if (shown.mark === 'removed') return { kind: 'removed', code: textOf(base, shown.file, shown) };
  const code = textOf(branch, shown.file, shown);
  if (shown.mark === 'added') return { kind: 'added', code };
  const basePlace = shown.mark === 'changed' ? data.review.basePlaces[shown.id] : undefined;
  if (basePlace === undefined) return { kind: 'kept', code };
  return { kind: 'diff', base: textOf(base, shown.file, basePlace), branch: code };
};
