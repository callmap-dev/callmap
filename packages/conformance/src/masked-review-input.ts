import { reviewInputOfPage, unpackedSourcesOf } from '@callmap/review-input';
import type { ReviewInput } from '@callmap/review-input';

const COMMIT_MASK = '<commit>';
const REPO_ROOT_MASK = '<repo root>';
const CHECKER_VERSION_MASK = '<checker version>';

type GraphDocument = ReviewInput['base'][number];

const withCheckerMasked = (document: GraphDocument): GraphDocument => ({
  ...document,
  checker: { ...document.checker, version: CHECKER_VERSION_MASK },
});

export const maskedReviewInputOfPage = async (page: string): Promise<unknown> => {
  const { packedSources, ...input } = reviewInputOfPage(page);
  return {
    ...input,
    base: input.base.map(withCheckerMasked),
    branch: input.branch.map(withCheckerMasked),
    checkout: { ...input.checkout, baseCommit: COMMIT_MASK, headCommit: COMMIT_MASK },
    editor: { ...input.editor, repoRoot: REPO_ROOT_MASK },
    sources: await unpackedSourcesOf(packedSources),
  };
};
