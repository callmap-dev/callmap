import type { LanguageRate } from '@callmap/review';
import { codeOf, inlineCodeOf } from './markdown.ts';

export interface FieldRepo {
  readonly url: string;
  readonly branchCommit: string;
  readonly baseCommit: string;
}

export interface FieldHead {
  readonly distribution: string;
  readonly version: string;
  readonly checker: string;
  readonly system: string;
  readonly processor: string;
}

interface PassedRepo {
  readonly verdict: 'ok';
  readonly repo: FieldRepo;
  readonly notes: readonly string[];
  readonly firstReviewMilliseconds: number;
  readonly cachedReviewMilliseconds: number;
  readonly resolutionRates: readonly LanguageRate[];
}

interface FailedRepo {
  readonly verdict: 'FAIL';
  readonly repo: FieldRepo;
  readonly exitCode: string;
  readonly message: string;
}

export type RepoOutcome = PassedRepo | FailedRepo;

const NO_CHECKER = 'none, because no review finished';

const secondsOf = (milliseconds: number): string => `${(milliseconds / 1000).toFixed(1)} s`;

const rateTextOf = ({ checker, resolved, open, rate }: LanguageRate): string =>
  `${checker.name} ${checker.version}, ${(rate * 100).toFixed(1)}%, ${String(resolved)} of ${String(resolved + open)} calls proved`;

const headOf = (head: FieldHead): string =>
  [
    '# Field record',
    '',
    `- Distribution: ${inlineCodeOf(head.distribution)}`,
    `- Version: ${inlineCodeOf(head.version)}`,
    `- Checker: ${head.checker === '' ? NO_CHECKER : head.checker}`,
    `- System: ${head.system}`,
    `- Processor: ${head.processor}`,
    '',
  ].join('\n');

const notesOf = (notes: readonly string[]): readonly string[] =>
  notes.length === 0 ? ['Notes: none.'] : ['Notes:', '', ...notes.map((note) => `- ${note}`)];

const resultLinesOf = (outcome: RepoOutcome): readonly string[] =>
  outcome.verdict === 'ok'
    ? [
        '- Exit code: 0',
        `- First review: ${secondsOf(outcome.firstReviewMilliseconds)}`,
        `- Cached review: ${secondsOf(outcome.cachedReviewMilliseconds)}`,
        `- Resolution rate: ${outcome.resolutionRates.map(rateTextOf).join('; ')}`,
        '',
        ...notesOf(outcome.notes),
      ]
    : [`- Exit code: ${outcome.exitCode}`, '', 'Message:', '', codeOf(outcome.message)];

const sectionOf = (outcome: RepoOutcome): string =>
  [
    `## ${outcome.repo.url}`,
    '',
    `- Branch commit: ${inlineCodeOf(outcome.repo.branchCommit)}`,
    `- Base commit: ${inlineCodeOf(outcome.repo.baseCommit)}`,
    ...resultLinesOf(outcome),
    '',
  ].join('\n');

export const fieldRecordOf = (head: FieldHead, outcomes: readonly RepoOutcome[]): string =>
  [headOf(head), ...outcomes.map(sectionOf)].join('\n');
