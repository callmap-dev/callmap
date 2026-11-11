import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { within } from '@testing-library/dom';
import { describe, expect, it } from 'vitest';
import { loadReaderPageWithDiffLimit } from '../../packages/reader-page/test/reader-page.ts';
import { featureBranchRepo } from '../../test/fixture-repo.ts';
import { tempDir } from '../../test/temp-dir.ts';
import { CALLMAP_TS } from '../src/callmap-ts.ts';
import { runReview } from '../src/review-command.ts';

const DIFF_CALLS = 11;

describe('callmap-ts review over the Diff limit', () => {
  it('prints no note, and its page opens on a level of the Diff view', async () => {
    const { out, notes } = await runReview(
      {
        repo: featureBranchRepo(),
        base: undefined,
        scope: [],
        tsconfig: undefined,
        out: join(tempDir('callmap-out-'), 'review.html'),
        open: false,
        cache: false,
        editor: 'vscode',
        tests: false,
      },
      CALLMAP_TS,
    );
    const page = await loadReaderPageWithDiffLimit(readFileSync(out, 'utf8'), DIFF_CALLS - 1);
    const body = within(page.window.document.body);
    expect(body.getByRole('tab', { selected: true }).firstChild?.textContent).toBe('Diff');
    expect(
      body
        .getByRole('region', { name: 'Level bar' })
        .querySelector('.diff-limit-note:not([hidden])')?.textContent,
    ).toContain('so the Diff view shows one level at a time');
    expect(notes).toEqual([]);
  });
});
