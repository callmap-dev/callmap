import { fireEvent, within } from '@testing-library/dom';
import { beforeAll, describe, expect, it } from 'vitest';
import { featureBranchRepo } from './fixture-repo.ts';
import {
  boxesOf,
  loadReaderPage,
  openTab,
  pageDataOf,
  reviewHtmlOf,
  settled,
} from './reader-page.ts';
import type { LoadedPage } from './reader-page.ts';

let html = '';

beforeAll(() => {
  html = reviewHtmlOf(featureBranchRepo());
}, 120_000);

const graphOf = ({ window }: LoadedPage): HTMLElement => {
  const graph = window.document.getElementById('graph');
  if (graph === null) throw new Error('the page holds no graph');
  return graph;
};

const functionIdsOf = (page: LoadedPage): readonly string[] =>
  boxesOf(page)
    .filter(({ kind }) => kind === 'function')
    .map(({ id }) => id);

describe('the layout of the Diff view and the Whole project view', () => {
  it('is not in the page data that the command writes', () => {
    expect(Object.keys(pageDataOf(html))).not.toContain('placements');
  });

  it('runs in the page for the Diff view', async () => {
    const page = await loadReaderPage(html);
    expect(page.layouts).toEqual(['callmap layout: Diff']);
    expect(functionIdsOf(page)).toContain('src/cart.ts#receipt');
  });

  it('runs in the page for the top level of the Whole project view', async () => {
    const page = await loadReaderPage(html);
    await openTab(page, 'Whole project');
    expect(page.layouts).toEqual([
      'callmap layout: Diff',
      'callmap layout: Whole project level:src',
    ]);
    expect(boxesOf(page).length).toBeGreaterThan(0);
  });

  it('marks the graph busy while it runs, and not busy after it', async () => {
    const page = await loadReaderPage(html);
    expect(graphOf(page).getAttribute('aria-busy')).toBe('false');
    fireEvent.click(within(page.window.document.body).getByRole('tab', { name: 'Whole project' }));
    expect(graphOf(page).getAttribute('aria-busy')).toBe('true');
    await settled(page);
    expect(graphOf(page).getAttribute('aria-busy')).toBe('false');
    expect(page.layouts).toHaveLength(2);
  });
});
