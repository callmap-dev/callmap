import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { packedSourcesOf, pageOfTemplate } from '@callmap/review-input';
import type { ReviewInput, Sources } from '@callmap/review-input';
import { assets } from '../src/assets.ts';
import { typescriptVersionFor } from '../src/package-manifest.ts';

export type ReviewInputFile = 'typescript/review' | 'typescript/levels';

type ExpectedReviewInput = Omit<ReviewInput, 'packedSources'> & { readonly sources: Sources };

type GraphDocument = ReviewInput['base'][number];

const REPO_ROOT = '/home/reader/shop';
const BASE_COMMIT = '1a2b3c4';
const HEAD_COMMIT = '5d6e7f8';

export const typescriptVersion = (): string =>
  typescriptVersionFor(fileURLToPath(import.meta.resolve('@callmap/extractor-typescript/cli')));

const expectedReviewInputOf = (file: ReviewInputFile): ExpectedReviewInput =>
  JSON.parse(
    readFileSync(
      new URL(
        `../../conformance/fixture-repos/${file}/expected-review-input.json`,
        import.meta.url,
      ),
      'utf8',
    ),
  ) as ExpectedReviewInput;

const withCheckerVersion = (document: GraphDocument): GraphDocument => ({
  ...document,
  checker: { ...document.checker, version: typescriptVersion() },
});

const reviewInputOfFile = async (file: ReviewInputFile): Promise<ReviewInput> => {
  const { sources, ...input } = expectedReviewInputOf(file);
  return {
    ...input,
    base: input.base.map(withCheckerVersion),
    branch: input.branch.map(withCheckerVersion),
    checkout: { ...input.checkout, baseCommit: BASE_COMMIT, headCommit: HEAD_COMMIT },
    editor: { ...input.editor, repoRoot: REPO_ROOT },
    packedSources: await packedSourcesOf(sources),
  };
};

let pageTemplate: Promise<string> | undefined;

const pageTemplateOnce = (): Promise<string> => (pageTemplate ??= assets.pageTemplate());

export const readerPageOfFile = async (
  file: ReviewInputFile,
  change: (input: ReviewInput) => ReviewInput = (input) => input,
): Promise<string> =>
  pageOfTemplate(await pageTemplateOnce(), change(await reviewInputOfFile(file)));
