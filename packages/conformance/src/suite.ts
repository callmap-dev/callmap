import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { canonicalJsonOf } from './canonical-json.ts';
import { fixtureRepoAt } from './fixture-repo.ts';
import { lineDiffOf } from './line-diff.ts';
import { maskedReviewInputOfPage } from './masked-review-input.ts';

const EXPECTED_FILE = 'expected-review-input.json';

export interface SuiteSettings {
  readonly reviewCommand: readonly string[];
  readonly fixtures: string;
  readonly language: string | undefined;
  readonly update: boolean;
}

type Verdict = 'ok' | 'updated' | 'FAIL';

export interface FixtureOutcome {
  readonly fixture: string;
  readonly verdict: Verdict;
  readonly detail: string;
}

const foldersIn = (folder: string): readonly string[] =>
  readdirSync(folder, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

const fixtureNamesIn = (fixtures: string, language: string | undefined): readonly string[] => {
  const languages = language === undefined ? foldersIn(fixtures) : [language];
  const names = languages.flatMap((name) =>
    existsSync(join(fixtures, name))
      ? foldersIn(join(fixtures, name)).map((fixture) => `${name}/${fixture}`)
      : [],
  );
  if (names.length === 0)
    throw new Error(`${fixtures} holds no fixture repo for ${language ?? 'any language'}`);
  return names;
};

const pageOfReview = (reviewCommand: readonly string[], fixture: string, work: string): string => {
  const repo = join(work, 'repo');
  const out = join(work, 'review.html');
  fixtureRepoAt(repo, fixture);
  const [program = '', ...programArgs] = reviewCommand;
  const finished = spawnSync(
    program,
    [...programArgs, 'review', repo, '--no-open', '--no-cache', '--out', out],
    { encoding: 'utf8' },
  );
  if (finished.error !== undefined) throw finished.error;
  if (finished.status !== 0)
    throw new Error(
      `the review command exited with ${String(finished.status)}: ${finished.stderr}`,
    );
  return readFileSync(out, 'utf8');
};

const reviewInputTextOf = async (
  reviewCommand: readonly string[],
  fixture: string,
): Promise<string> => {
  const work = mkdtempSync(join(tmpdir(), 'callmap-conformance-'));
  try {
    return canonicalJsonOf(
      await maskedReviewInputOfPage(pageOfReview(reviewCommand, fixture, work)),
    );
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
};

const differenceFrom = (expectedFile: string, actual: string): string | undefined => {
  if (!existsSync(expectedFile))
    return `${expectedFile} does not exist. Run the suite with --update to write it.`;
  const expected = canonicalJsonOf(JSON.parse(readFileSync(expectedFile, 'utf8')));
  return expected === actual ? undefined : lineDiffOf(expected, actual);
};

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const outcomeOf = async (settings: SuiteSettings, fixture: string): Promise<FixtureOutcome> => {
  const folder = join(settings.fixtures, fixture);
  const expectedFile = join(folder, EXPECTED_FILE);
  try {
    const actual = await reviewInputTextOf(settings.reviewCommand, folder);
    if (settings.update) {
      writeFileSync(expectedFile, actual);
      return { fixture, verdict: 'updated', detail: '' };
    }
    const difference = differenceFrom(expectedFile, actual);
    return difference === undefined
      ? { fixture, verdict: 'ok', detail: '' }
      : { fixture, verdict: 'FAIL', detail: difference };
  } catch (error) {
    return { fixture, verdict: 'FAIL', detail: messageOf(error) };
  }
};

export const runSuite = async (settings: SuiteSettings): Promise<readonly FixtureOutcome[]> => {
  const outcomes: FixtureOutcome[] = [];
  for (const fixture of fixtureNamesIn(settings.fixtures, settings.language))
    outcomes.push(await outcomeOf(settings, fixture));
  return outcomes;
};
