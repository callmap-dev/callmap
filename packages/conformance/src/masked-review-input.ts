import type { GraphDocument } from '@callmap/graph-document';
import { reviewInputOfPage, unpackedReviewInputOf } from '@callmap/review-input';
import type { UnpackedReviewInput } from '@callmap/review-input';

const COMMIT_MASK = '<commit>';
const REPO_ROOT_MASK = '<repo root>';
const CHECKER_VERSION_MASK = '<checker version>';

const withCheckerMasked = (document: GraphDocument): GraphDocument => ({
  ...document,
  checker: { ...document.checker, version: CHECKER_VERSION_MASK },
});

export const maskedReviewInputOfPage = async (page: string): Promise<UnpackedReviewInput> => {
  const input = await unpackedReviewInputOf(reviewInputOfPage(page));
  return {
    ...input,
    base: input.base.map(withCheckerMasked),
    branch: input.branch.map(withCheckerMasked),
    checkout: { ...input.checkout, baseCommit: COMMIT_MASK, headCommit: COMMIT_MASK },
    editor: { ...input.editor, repoRoot: REPO_ROOT_MASK },
  };
};
