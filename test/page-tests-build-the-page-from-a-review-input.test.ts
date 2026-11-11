import { globSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = join(import.meta.dirname, '..');

const textOf = (path: string): string => readFileSync(join(REPO_ROOT, path), 'utf8');

const filesThatCall = (paths: readonly string[], names: readonly string[]): readonly string[] =>
  paths.filter((path) => new RegExp(`\\b(${names.join('|')})\\(`).test(textOf(path)));

const CORE_TESTS = globSync('packages/*/{test,test-browser}/**/*.ts', { cwd: REPO_ROOT }).sort();
const COMMAND_RUNNERS = [
  'runCallmap',
  'runCallmapTs',
  'runReview',
  'reviewHtmlOf',
  'reviewPage',
  'reviewPageOf',
];

describe('the tests of the core', () => {
  it('build each page from a review input file, and run no command', () => {
    expect(CORE_TESTS.length).toBeGreaterThan(0);
    expect(filesThatCall(CORE_TESTS, COMMAND_RUNNERS)).toEqual([]);
  });

  it('import no code of a distribution', () => {
    const offenders = CORE_TESTS.filter((path) =>
      /from '[^']*callmap-(ts|go|rb)\//.test(textOf(path)),
    );
    expect(offenders).toEqual([]);
  });
});

describe('the tests', () => {
  it('write the data block of a page only through the writer of the review input package', () => {
    const offenders = globSync(
      '{packages/*/{test,test-browser},callmap-ts/{test,test-pack},callmap-go/test,callmap-rb/test}/**/*.ts',
      { cwd: REPO_ROOT },
    )
      .filter((path) => !path.startsWith('packages/review-input/'))
      .filter((path) =>
        /['"`]"(formatVersion|base|branch|packedSources|checkout|editor)":/.test(textOf(path)),
      )
      .sort();
    expect(offenders).toEqual([]);
  });
});
