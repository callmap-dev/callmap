import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import type { GraphDocument } from '@callmap/graph-document';
import { packedReviewInputOf, pageOfTemplate } from '@callmap/review-input';
import type { ReviewInput, UnpackedReviewInput } from '@callmap/review-input';
import { pageTemplate } from '../build/index.ts';

/**
 * A review input file holds a review input as the conformance suite writes it: the sources
 * unpacked, the keys in sorted order, and the commits, the repo root and the checker version
 * masked. The expected files of the conformance suite are review input files, and
 * `review-inputs/` holds the others that the tests of the page need.
 */
export type ReviewInputFile =
  | 'go/review'
  | 'ruby/review'
  | 'typescript/added-line'
  | 'typescript/broadcast-on-base'
  | 'typescript/cycle'
  | 'typescript/levels'
  | 'typescript/long-names'
  | 'typescript/no-entry-point'
  | 'typescript/review'
  | 'typescript/unchanged-files';

const CONFORMANCE_FILES: readonly ReviewInputFile[] = [
  'go/review',
  'ruby/review',
  'typescript/levels',
  'typescript/review',
];

export const REPO_ROOT = '/home/reader/shop';
const BASE_COMMIT = '1a2b3c4';
const HEAD_COMMIT = '5d6e7f8';

const TYPESCRIPT_MANIFEST = createRequire(import.meta.url).resolve('typescript/package.json');

const CHECKER_VERSIONS: Readonly<Record<string, string>> = {
  typescript: (JSON.parse(readFileSync(TYPESCRIPT_MANIFEST, 'utf8')) as { version: string })
    .version,
  go: '1.26.0',
  ruby: 'callmap-rb 0.1.0, ruby 3.4.1 (2024-12-25 revision 48d4efcb85) +PRISM [x86_64-linux]',
};

export const checkerVersionOf = (language: string): string => CHECKER_VERSIONS[language] ?? '';

export const typescriptVersion = (): string => checkerVersionOf('typescript');

const urlOf = (file: ReviewInputFile): URL =>
  CONFORMANCE_FILES.includes(file)
    ? new URL(`../../conformance/fixture-repos/${file}/expected-review-input.json`, import.meta.url)
    : new URL(`../review-inputs/${file}.json`, import.meta.url);

const unpackedReviewInputOfFile = (file: ReviewInputFile): UnpackedReviewInput =>
  JSON.parse(readFileSync(urlOf(file), 'utf8')) as UnpackedReviewInput;

const withCheckerVersion = (document: GraphDocument): GraphDocument => ({
  ...document,
  checker: { ...document.checker, version: checkerVersionOf(document.language) },
});

export const reviewInputOfFile = (file: ReviewInputFile): Promise<ReviewInput> => {
  const input = unpackedReviewInputOfFile(file);
  return packedReviewInputOf({
    ...input,
    base: input.base.map(withCheckerVersion),
    branch: input.branch.map(withCheckerVersion),
    checkout: { ...input.checkout, baseCommit: BASE_COMMIT, headCommit: HEAD_COMMIT },
    editor: { ...input.editor, repoRoot: REPO_ROOT },
  });
};

let template: Promise<string> | undefined;

const pageTemplateOnce = (): Promise<string> => (template ??= pageTemplate());

export const readerPageOfFile = async (
  file: ReviewInputFile,
  change: (input: ReviewInput) => ReviewInput = (input) => input,
): Promise<string> =>
  pageOfTemplate(await pageTemplateOnce(), change(await reviewInputOfFile(file)));
