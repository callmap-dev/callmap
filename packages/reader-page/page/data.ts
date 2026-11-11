import { reviewOf } from '@callmap/review';
import type { Review } from '@callmap/review';
import type { Checkout, EditorChoice, ReviewInput } from '@callmap/review-input';

export interface ReaderPageData {
  readonly review: Review;
  readonly packedSources: string;
  readonly editor: EditorChoice;
  readonly checkout: Checkout;
  readonly diffLimit: number;
}

export const readerPageDataOf = (input: ReviewInput, diffLimit: number): ReaderPageData => ({
  review: reviewOf(input),
  packedSources: input.packedSources,
  editor: input.editor,
  checkout: input.checkout,
  diffLimit,
});
