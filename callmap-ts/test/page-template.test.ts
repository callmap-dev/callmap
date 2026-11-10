import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { pageTemplate } from '@callmap/reader-page';
import { pageOfTemplate, reviewInputOfPage } from '@callmap/review-input';
import { describe, expect, it } from 'vitest';
import { featureBranchRepo } from '../../test/fixture-repo.ts';
import { reviewHtmlOf } from './callmap-ts-run.ts';

const CALLMAP_TS = fileURLToPath(new URL('..', import.meta.url));

const git = (...args: readonly string[]): string =>
  execFileSync('git', args, { cwd: CALLMAP_TS, encoding: 'utf8' });

describe('the page template of callmap-ts', () => {
  it('has no copy in git, because the build copies it from the build of the same commit', () => {
    expect(git('ls-files', '--', '.').split('\n')).not.toEqual(
      expect.arrayContaining([expect.stringMatching(/page-template\.html$/)]),
    );
    expect(git('check-ignore', '--no-index', 'dist/page-template.html').trim()).toBe(
      'dist/page-template.html',
    );
  });
});

describe('the page of callmap-ts', () => {
  it('is the page template with the escaped review input at the marker of the data block', async () => {
    const page = reviewHtmlOf(featureBranchRepo());
    expect(page).toBe(pageOfTemplate(await pageTemplate(), reviewInputOfPage(page)));
  });
});
