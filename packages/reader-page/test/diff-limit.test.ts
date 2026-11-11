import { fireEvent, within } from '@testing-library/dom';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  boxElementOf,
  boxesOf,
  clickBox,
  loadReaderPage,
  loadReaderPageWithDiffLimit,
  openTab,
  settled,
} from './reader-page.ts';
import type { LoadedPage } from './reader-page.ts';
import { readerPageOfFile } from './review-input-file.ts';

const MONEY = 'src/money.ts';
const DIFF_CALLS = 11;
const LEVELS_DIFF_CALLS = 14;

const ORDERS = 'src/orders';
const NOTIFY = 'src/notify';
const MONEY_FOLDER = 'src/money';
const CARRIERS = 'src/shipping/carriers';
const RATE = 'src/tax/rate.ts';
const ROUND_FILE = 'src/money/round.ts';

let html = '';
let levelsHtml = '';

beforeAll(async () => {
  html = await readerPageOfFile('typescript/review');
  levelsHtml = await readerPageOfFile('typescript/levels');
});

const pageWithDiffLimit = (diffLimit: number): Promise<LoadedPage> =>
  loadReaderPageWithDiffLimit(html, diffLimit);

const levelsPageOverLimit = (): Promise<LoadedPage> =>
  loadReaderPageWithDiffLimit(levelsHtml, LEVELS_DIFF_CALLS - 1);

const bodyOf = ({ window }: LoadedPage) => within(window.document.body);

const selectedTabOf = (page: LoadedPage): string =>
  bodyOf(page).getByRole('tab', { selected: true }).firstChild?.textContent ?? '';

const levelBarOf = (page: LoadedPage): HTMLElement | null =>
  bodyOf(page).queryByRole('region', { name: 'Level bar' });

const crumbsOf = (page: LoadedPage): readonly string[] =>
  within(bodyOf(page).getByRole('region', { name: 'Level bar' }))
    .getAllByRole('button')
    .filter((button) => button.closest('nav') !== null)
    .map((crumb) => crumb.textContent);

const noteOf = (page: LoadedPage): string | undefined =>
  levelBarOf(page)?.querySelector('.diff-limit-note:not([hidden])')?.textContent ?? undefined;

const levelBoxIdsOf = (page: LoadedPage): readonly string[] =>
  boxesOf(page)
    .filter(({ kind, classes }) => kind !== 'function' && !classes.includes('outside'))
    .map(({ id }) => id);

const functionBoxIdsOf = (page: LoadedPage): readonly string[] =>
  boxesOf(page)
    .filter(({ kind }) => kind === 'function')
    .map(({ id }) => id);

const titleOf = (page: LoadedPage, id: string): string | undefined =>
  boxElementOf(page, id)?.querySelector(':scope > title')?.textContent ?? undefined;

const isSelected = (page: LoadedPage, id: string): boolean =>
  boxElementOf(page, id)?.classList.contains('selected') ?? false;

const diffLimitMessageOf = (page: LoadedPage): HTMLElement | null =>
  bodyOf(page).queryByRole('status', { name: 'Over the Diff limit' });

const searchFor = async (page: LoadedPage, text: string, name: string): Promise<void> => {
  const body = bodyOf(page);
  fireEvent.input(body.getByRole('searchbox', { name: 'Find a function' }), {
    target: { value: text },
  });
  fireEvent.click(
    within(body.getByRole('region', { name: 'Search' })).getByRole('button', { name }),
  );
  await settled(page);
};

const clearNextHops = async (page: LoadedPage): Promise<void> => {
  fireEvent.click(bodyOf(page).getByRole('button', { name: 'Clear next hops' }));
  await settled(page);
};

const LEVELS_OVER_LIMIT =
  'This review holds 15 functions and 14 calls, over the Diff limit of 13 calls, so the Diff view shows one level at a time.';

const ONE_MORE_HOP_OVER_LIMIT =
  'This review holds 12 functions and 13 calls, over the Diff limit of 11 calls, so the Diff view shows one level at a time.';

describe('a review over the Diff limit', () => {
  it('opens on the Diff view at the deepest folder that holds every function of the Diff view', async () => {
    const page = await levelsPageOverLimit();
    expect(selectedTabOf(page)).toBe('Diff');
    expect(crumbsOf(page)).toEqual(['src/']);
    expect(levelBoxIdsOf(page)).toEqual([MONEY_FOLDER, NOTIFY, ORDERS, CARRIERS]);
    expect(page.layouts).toEqual(['callmap layout: Diff level:src']);
  });

  it('gives no box to a folder or a file with no changed function and no neighbour', async () => {
    const page = await levelsPageOverLimit();
    expect(boxElementOf(page, RATE)).toBeUndefined();
    await clickBox(page, NOTIFY);
    expect(levelBoxIdsOf(page)).toEqual([`${NOTIFY}/mail.ts`, `${NOTIFY}/sms.ts`]);
  });

  it('counts the functions of the Diff view and their changed, added and removed functions on each box', async () => {
    const page = await levelsPageOverLimit();
    expect([ORDERS, MONEY_FOLDER, NOTIFY, CARRIERS].map((id) => titleOf(page, id))).toEqual([
      'orders/\n2 changed, 1 added',
      'money/\n1 removed',
      'notify/\n1 added, 1 open end',
      'shipping/carriers/\n1 changed',
    ]);
    expect(boxElementOf(page, NOTIFY)?.querySelector(':scope > text.functions')?.textContent).toBe(
      '3 fn',
    );
  });

  it('says in the level bar that the review is over the Diff limit, and shows no message in place of the drawing', async () => {
    const page = await levelsPageOverLimit();
    expect(noteOf(page)).toBe(LEVELS_OVER_LIMIT);
    expect(diffLimitMessageOf(page)).toBeNull();
  });

  it('keeps the level bar and its note off the Whole project view', async () => {
    const page = await levelsPageOverLimit();
    await openTab(page, 'Whole project');
    expect(noteOf(page)).toBeUndefined();
    expect(boxElementOf(page, RATE)).toBeDefined();
    await openTab(page, 'Diff');
    expect(noteOf(page)).toBe(LEVELS_OVER_LIMIT);
    expect(crumbsOf(page)).toEqual(['src/']);
  });

  it('opens the levels of the Diff view with the breadcrumb and "Up one level"', async () => {
    const page = await levelsPageOverLimit();
    await clickBox(page, MONEY_FOLDER);
    await clickBox(page, ROUND_FILE);
    expect(crumbsOf(page)).toEqual(['src/', 'money/', 'round.ts']);
    expect(functionBoxIdsOf(page)).toEqual([`${ROUND_FILE}#round`, `${ROUND_FILE}#legacyRound`]);
    fireEvent.click(
      within(levelBarOf(page) ?? page.window.document.body).getByRole('button', {
        name: 'Up one level',
      }),
    );
    await settled(page);
    expect(crumbsOf(page)).toEqual(['src/', 'money/']);
  });
});

describe('a next hop inside a level of the Diff view', () => {
  it('adds the callers and the callees of the clicked function to the levels, and draws the open level again', async () => {
    const page = await levelsPageOverLimit();
    await clickBox(page, MONEY_FOLDER);
    await clickBox(page, ROUND_FILE);
    expect(boxElementOf(page, RATE)).toBeUndefined();

    await clickBox(page, `${ROUND_FILE}#round`);
    expect(crumbsOf(page)).toEqual(['src/', 'money/', 'round.ts']);
    expect(boxElementOf(page, RATE)).toBeDefined();
    expect(isSelected(page, `${ROUND_FILE}#round`)).toBe(true);

    fireEvent.click(within(levelBarOf(page) ?? page.window.document.body).getByText('src/'));
    await settled(page);
    expect(levelBoxIdsOf(page)).toContain(RATE);
  });
});

describe('clearing the next hops on a level that only the next hops hold', () => {
  it('opens the first level again, and keeps the levels while the Diff view stays over the limit', async () => {
    const page = await levelsPageOverLimit();
    await clickBox(page, MONEY_FOLDER);
    await clickBox(page, ROUND_FILE);
    await clickBox(page, `${ROUND_FILE}#round`);
    fireEvent.click(within(levelBarOf(page) ?? page.window.document.body).getByText('src/'));
    await settled(page);
    await clickBox(page, RATE);
    expect(crumbsOf(page).at(-1)).toBe('tax/rate.ts');

    await clearNextHops(page);
    expect(crumbsOf(page)).toEqual(['src/']);
    expect(levelBoxIdsOf(page)).toEqual([MONEY_FOLDER, NOTIFY, ORDERS, CARRIERS]);
    expect(noteOf(page)).toBe(LEVELS_OVER_LIMIT);
    expect(bodyOf(page).queryByRole('button', { name: 'Clear next hops' })).toBeNull();
  });
});

describe('a next hop on a level of the Diff view whose callers and callees the levels already hold', () => {
  it('adds no next hop and lays out nothing again', async () => {
    const page = await levelsPageOverLimit();
    await clickBox(page, CARRIERS);
    await clickBox(page, `${CARRIERS}/post.ts`);
    const layoutsBefore = [...page.layouts];

    await clickBox(page, `${CARRIERS}/post.ts#measure`);
    expect(page.layouts).toEqual(layoutsBefore);
    expect(bodyOf(page).queryByRole('button', { name: 'Clear next hops' })).toBeNull();
  });
});

describe('a review at exactly the Diff limit', () => {
  it('lays out the Diff view as one drawing, with no level bar', async () => {
    const page = await pageWithDiffLimit(DIFF_CALLS);
    expect(selectedTabOf(page)).toBe('Diff');
    expect(boxesOf(page).filter(({ kind }) => kind === 'function')).toHaveLength(11);
    expect(levelBarOf(page)).toBeNull();
  });

  it('draws the same Diff view as a page with the default Diff limit', async () => {
    const atLimit = await pageWithDiffLimit(DIFF_CALLS);
    const withDefault = await loadReaderPage(html);
    const drawingOf = ({ window }: LoadedPage): string | undefined =>
      window.document.querySelector('#graph svg.drawing')?.outerHTML;
    expect(drawingOf(atLimit)).toBeDefined();
    expect(drawingOf(atLimit)).toBe(drawingOf(withDefault));
  });
});

describe('a next hop that takes the Diff view over the Diff limit', () => {
  it('opens the level of the file of the clicked function, with that function selected', async () => {
    const page = await pageWithDiffLimit(DIFF_CALLS);
    expect(levelBarOf(page)).toBeNull();

    await clickBox(page, `${MONEY}#format`);
    expect(crumbsOf(page)).toEqual(['src/', 'money.ts']);
    expect(isSelected(page, `${MONEY}#format`)).toBe(true);
    expect(noteOf(page)).toBe(ONE_MORE_HOP_OVER_LIMIT);
    expect(diffLimitMessageOf(page)).toBeNull();
  });

  it('draws one drawing again after the reader clears the next hops', async () => {
    const page = await pageWithDiffLimit(DIFF_CALLS);
    await clickBox(page, `${MONEY}#format`);
    await clearNextHops(page);
    expect(levelBarOf(page)).toBeNull();
    expect(functionBoxIdsOf(page)).toHaveLength(11);
  });
});

describe('a search that takes the Diff view over the Diff limit', () => {
  it('opens the level of the file of the found function, with that function selected', async () => {
    const page = await pageWithDiffLimit(DIFF_CALLS);
    await searchFor(page, 'round', `round ${MONEY}`);
    expect(crumbsOf(page)).toEqual(['src/', 'money.ts']);
    expect(isSelected(page, `${MONEY}#round`)).toBe(true);
    expect(noteOf(page)).toBe(ONE_MORE_HOP_OVER_LIMIT);
  });
});
