import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fireEvent, within } from '@testing-library/dom';
import { beforeAll, describe, expect, it } from 'vitest';
import { CALLMAP } from '../src/callmap.ts';
import { runReview } from '../src/review-command.ts';
import { featureBranchRepo } from './fixture-repo.ts';
import { boxesOf, clickBox, loadReaderPageWithDiffLimit, openTab, settled } from './reader-page.ts';
import type { LoadedPage } from './reader-page.ts';
import { readerPageOfFile } from './review-input-file.ts';
import { tempDir } from '../../../test/temp-dir.ts';

const MONEY = 'src/money.ts';
const DIFF_CALLS = 11;

let repo = '';
let html = '';

beforeAll(async () => {
  repo = featureBranchRepo();
  html = await readerPageOfFile('typescript/review');
});

const commandReview = () =>
  runReview(
    {
      repo,
      base: undefined,
      scope: [],
      tsconfig: undefined,
      out: join(tempDir('callmap-out-'), 'review.html'),
      open: false,
      cache: false,
      editor: 'vscode',
      tests: false,
    },
    CALLMAP,
  );

const pageWithDiffLimit = (diffLimit: number): Promise<LoadedPage> =>
  loadReaderPageWithDiffLimit(html, diffLimit);

const OVER_LIMIT =
  'This review holds 11 functions and 11 calls. The Diff view draws up to 10 calls, so it draws none of them. Open the Whole project view to read the changes level by level.';

const ONE_MORE_HOP_OVER_LIMIT =
  'This review holds 12 functions and 13 calls. The Diff view draws up to 11 calls, so it draws none of them.';

const selectedTabOf = ({ window }: LoadedPage): string =>
  within(window.document.body).getByRole('tab', { selected: true }).firstChild?.textContent ?? '';

const diffLayoutsOf = (page: LoadedPage): readonly string[] =>
  page.layouts.filter((name) => name.startsWith('callmap layout: Diff'));

const diffLimitMessageOf = ({ window }: LoadedPage): HTMLElement | null =>
  within(window.document.body).queryByRole('status', { name: 'Over the Diff limit' });

describe('a review over the Diff limit', () => {
  it('prints no note to stderr, because the page of the command says that the review is over the limit', async () => {
    const { out, notes } = await commandReview();
    const page = await loadReaderPageWithDiffLimit(readFileSync(out, 'utf8'), DIFF_CALLS - 1);
    await openTab(page, 'Diff');
    expect(diffLimitMessageOf(page)?.textContent).toContain(OVER_LIMIT);
    expect(notes).toEqual([]);
  });

  it('opens on the Whole project view, and the Diff tab says what it left out', async () => {
    const page = await pageWithDiffLimit(DIFF_CALLS - 1);
    expect(selectedTabOf(page)).toBe('Whole project');
    expect(diffLimitMessageOf(page)).toBeNull();

    await openTab(page, 'Diff');
    expect(diffLimitMessageOf(page)?.textContent).toContain(OVER_LIMIT);
    expect(diffLayoutsOf(page)).toEqual([]);
  });

  it('opens the Whole project view from the button in the message', async () => {
    const page = await pageWithDiffLimit(DIFF_CALLS - 1);
    await openTab(page, 'Diff');
    within(diffLimitMessageOf(page) ?? page.window.document.body)
      .getByRole('button', { name: 'Open Whole project' })
      .click();
    await settled(page);
    expect(selectedTabOf(page)).toBe('Whole project');
    expect(diffLimitMessageOf(page)).toBeNull();
  });

  it('hides the message at once when the reader leaves the Diff tab for a view that lays out in the page', async () => {
    const page = await pageWithDiffLimit(DIFF_CALLS - 1);
    await openTab(page, 'Diff');
    fireEvent.click(within(page.window.document.body).getByRole('tab', { name: 'Route' }));
    expect(diffLimitMessageOf(page)).toBeNull();
    await settled(page);
  });
});

describe('a review at exactly the Diff limit', () => {
  it('lays out the Diff view as before', async () => {
    const page = await pageWithDiffLimit(DIFF_CALLS);
    expect(selectedTabOf(page)).toBe('Diff');
    expect(boxesOf(page).filter(({ kind }) => kind === 'function')).toHaveLength(11);
  });
});

describe('a next hop that takes the Diff view over the Diff limit', () => {
  it('shows the message with the new counts, and does not lay out the Diff view', async () => {
    const page = await pageWithDiffLimit(DIFF_CALLS);
    expect(diffLimitMessageOf(page)).toBeNull();
    const layoutsBefore = [...page.layouts];

    await clickBox(page, `${MONEY}#format`);
    expect(diffLimitMessageOf(page)?.textContent).toContain(ONE_MORE_HOP_OVER_LIMIT);
    expect(page.layouts).toEqual(layoutsBefore);
  });
});

describe('a search that takes the Diff view over the Diff limit', () => {
  it('shows the message with the new counts, and does not lay out the Diff view', async () => {
    const page = await pageWithDiffLimit(DIFF_CALLS);
    expect(diffLimitMessageOf(page)).toBeNull();
    const layoutsBefore = [...page.layouts];

    const body = within(page.window.document.body);
    fireEvent.input(body.getByRole('searchbox', { name: 'Find a function' }), {
      target: { value: 'round' },
    });
    fireEvent.click(
      within(body.getByRole('region', { name: 'Search' })).getByRole('button', {
        name: `round ${MONEY}`,
      }),
    );
    await settled(page);
    expect(diffLimitMessageOf(page)?.textContent).toContain(ONE_MORE_HOP_OVER_LIMIT);
    expect(page.layouts).toEqual(layoutsBefore);
  });
});
