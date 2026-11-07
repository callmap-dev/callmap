import { readFileSync } from 'node:fs';
import { reviewInputOfDataBlock } from '@callmap/review-input';
import { within } from '@testing-library/dom';
import { beforeAll, describe, expect, it } from 'vitest';
import { readerPageOf } from '../src/reader-page.ts';
import { boxesOf, callsOf, clickBox, loadReaderPage } from './reader-page.ts';
import type { LoadedPage } from './reader-page.ts';

const SHOP = 'src/shop.ts';

const REVIEW_INPUT = readFileSync(
  new URL('../fixture-review-input/review-input.json', import.meta.url),
  'utf8',
);

let html = '';

beforeAll(async () => {
  html = await readerPageOf(reviewInputOfDataBlock(REVIEW_INPUT));
});

const bodyOf = ({ window }: LoadedPage) => within(window.document.body);

describe('a reader page built from a review input file, with no git and no extractor', () => {
  it('draws the review that the page computes from the graph documents', async () => {
    const page = await loadReaderPage(html);
    expect(
      boxesOf(page)
        .filter(({ kind }) => kind === 'function')
        .map(({ id, classes }) => [
          id,
          ['added', 'changed', 'neighbour'].find((mark) => classes.includes(mark)),
        ]),
    ).toEqual([
      [`${SHOP}#price`, 'neighbour'],
      [`${SHOP}#tax`, 'added'],
      [`${SHOP}#total`, 'changed'],
    ]);
    expect(
      callsOf(page).map(({ from, to, classes }) => [from, to, classes.includes('added')]),
    ).toEqual([
      [`${SHOP}#total`, `${SHOP}#price`, false],
      [`${SHOP}#total`, `${SHOP}#tax`, true],
    ]);
  });

  it('names the branch and the base from the facts of git', async () => {
    const { window } = await loadReaderPage(html);
    const checkout = window.document.querySelector('.top-bar .checkout');
    expect(checkout?.querySelector('.checkout-names')?.textContent).toContain('tax');
    expect(checkout?.querySelector('.checkout-names')?.textContent).toContain('main');
    expect(checkout?.querySelector('.checkout-range')?.textContent).toBe('1a2b3c4…5d6e7f8');
  });

  it('shows the code of a changed function from the packed sources, with a link to the editor', async () => {
    const page = await loadReaderPage(html);
    await clickBox(page, `${SHOP}#total`);
    const code = within(bodyOf(page).getByRole('region', { name: 'Code' }));
    expect(code.getByRole('link', { name: /^Open in/ }).getAttribute('href')).toBe(
      'vscode://file/home/reader/shop/src/shop.ts:5',
    );
    expect(code.getByRole('textbox').textContent).toContain('return net + tax(net);');
  });
});

describe('a review input of a format version that the page does not know', () => {
  it('shows a message in place of the graph that names the format version and says which side to update', async () => {
    const page = await loadReaderPage(html.replace('"formatVersion":1', '"formatVersion":2'));
    const message = bodyOf(page).getByRole('alert');
    expect(message.textContent).toContain('format version 2');
    expect(message.textContent).toContain('Update the reader page.');
    expect(page.window.document.getElementById('graph')?.hidden).toBe(true);
    expect(boxesOf(page)).toEqual([]);
  });
});
