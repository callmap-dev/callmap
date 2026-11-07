import { globSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = join(import.meta.dirname, '..');

const textOf = (path: string): string => readFileSync(join(REPO_ROOT, path), 'utf8');

const filesThatCall = (paths: readonly string[], names: readonly string[]): readonly string[] =>
  paths.filter((path) => new RegExp(`\\b(${names.join('|')})\\(`).test(textOf(path)));

const CLI_TESTS = globSync('packages/cli/test/*.test.ts', { cwd: REPO_ROOT }).sort();
const PAGE_READERS = [
  'loadReaderPage',
  'loadReaderPageWithDiffLimit',
  'pageDataOf',
  'sourcesOf',
  'startCostsOf',
];
const COMMAND_RUNNERS = ['runCallmap', 'reviewHtmlOf', 'reviewOf', 'reviewPage', 'reviewPageOf'];

describe('the DOM tests of the reader page', () => {
  it('run the command only in the files that check the command, or that read a repo with no review input file', () => {
    const pageTests = filesThatCall(CLI_TESTS, PAGE_READERS);
    expect(filesThatCall(pageTests, COMMAND_RUNNERS)).toEqual([
      'packages/cli/test/base-cache.test.ts',
      'packages/cli/test/base.test.ts',
      'packages/cli/test/checkout.test.ts',
      'packages/cli/test/code-panel.test.ts',
      'packages/cli/test/drawing.test.ts',
      'packages/cli/test/folder.test.ts',
      'packages/cli/test/go-review.test.ts',
      'packages/cli/test/levels.test.ts',
      'packages/cli/test/look.test.ts',
      'packages/cli/test/read-on-page.test.ts',
      'packages/cli/test/resolution.test.ts',
      'packages/cli/test/review.test.ts',
      'packages/cli/test/route.test.ts',
      'packages/cli/test/ruby-review.test.ts',
      'packages/cli/test/scope.test.ts',
      'packages/cli/test/tests.test.ts',
      'packages/cli/test/tsconfig.test.ts',
    ]);
  });
});

describe('the tests', () => {
  it('write the data block of a page only through the writer of the review input package', () => {
    const offenders = globSync('packages/*/{test,test-browser,test-pack}/**/*.ts', {
      cwd: REPO_ROOT,
    })
      .filter((path) => !path.startsWith('packages/review-input/'))
      .filter((path) =>
        /['"`]"(formatVersion|base|branch|packedSources|checkout|editor)":/.test(textOf(path)),
      )
      .sort();
    expect(offenders).toEqual([]);
  });
});
