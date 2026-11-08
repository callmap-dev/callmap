import { packedSourcesOf, unpackedSourcesOf } from './packed-sources.ts';
import type { Sources } from './packed-sources.ts';
import type { ReviewInput } from './review-input.ts';

export type UnpackedReviewInput = Omit<ReviewInput, 'packedSources'> & {
  readonly sources: Sources;
};

export const unpackedReviewInputOf = async ({
  packedSources,
  ...input
}: ReviewInput): Promise<UnpackedReviewInput> => ({
  ...input,
  sources: await unpackedSourcesOf(packedSources),
});

export const packedReviewInputOf = async ({
  sources,
  ...input
}: UnpackedReviewInput): Promise<ReviewInput> => ({
  ...input,
  packedSources: await packedSourcesOf(sources),
});
