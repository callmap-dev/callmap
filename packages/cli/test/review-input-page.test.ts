import type { ReviewInput } from '@callmap/review-input';
import { within } from '@testing-library/dom';
import { beforeAll, describe, expect, it } from 'vitest';
import { boxesOf, callsOf, clickBox, loadReaderPage } from './reader-page.ts';
import type { LoadedPage } from './reader-page.ts';
import { readerPageOfFile } from './review-input-file.ts';

const ALERTS = 'src/alerts.ts';
const CART = 'src/cart.ts';
const CHECKOUT = 'src/checkout.ts';
const MONEY = 'src/money.ts';
const NOTIFY = 'src/notify.ts';

let html = '';

beforeAll(async () => {
  html = await readerPageOfFile('typescript/review');
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
          ['added', 'removed', 'changed', 'neighbour'].find((mark) => classes.includes(mark)),
        ]),
    ).toEqual([
      [`${ALERTS}#alert`, 'changed'],
      [`${ALERTS}#relay`, 'added'],
      [`${CART}#subtotal`, 'neighbour'],
      [`${CART}#legacyTotal`, 'removed'],
      [`${CART}#taxed`, 'added'],
      [`${CART}#receipt`, 'changed'],
      [`${CART}#label`, 'neighbour'],
      [`${CHECKOUT}#checkout`, 'neighbour'],
      [`${MONEY}#format`, 'neighbour'],
      [`${NOTIFY}#Mail.send`, 'neighbour'],
      [`${NOTIFY}#Sms.send`, 'neighbour'],
    ]);
    expect(
      callsOf(page)
        .filter(({ from }) => from === `${CART}#receipt`)
        .map(({ to, classes }) => [to, ['added', 'removed'].find((mark) => classes.includes(mark))])
        .sort(([left = ''], [right = '']) => left.localeCompare(right)),
    ).toEqual([
      [`${CART}#label`, 'removed'],
      [`${CART}#legacyTotal`, 'removed'],
      [`${CART}#taxed`, 'added'],
      [`${MONEY}#format`, undefined],
    ]);
  });

  it('names the branch and the base from the facts of git', async () => {
    const { window } = await loadReaderPage(html);
    const checkout = window.document.querySelector('.top-bar .checkout');
    expect(checkout?.querySelector('.checkout-names')?.textContent).toContain('feature');
    expect(checkout?.querySelector('.checkout-names')?.textContent).toContain('main');
    expect(checkout?.querySelector('.checkout-range')?.textContent).toBe('1a2b3c4…5d6e7f8');
  });

  it('shows the code of a changed function from the packed sources, with a link to the editor', async () => {
    const page = await loadReaderPage(html);
    await clickBox(page, `${CART}#receipt`);
    const code = within(bodyOf(page).getByRole('region', { name: 'Code' }));
    expect(code.getByRole('link', { name: /^Open in/ }).getAttribute('href')).toBe(
      'vscode://file/home/reader/shop/src/cart.ts:8',
    );
    expect(code.getByRole('textbox').textContent).toContain('const total = taxed(prices);');
  });
});

describe('a review input of a format version that the page does not know', () => {
  it('shows a message in place of the graph that names the format version and says which side to update', async () => {
    const page = await loadReaderPage(
      await readerPageOfFile(
        'typescript/review',
        (input) => ({ ...input, formatVersion: 2 }) as unknown as ReviewInput,
      ),
    );
    const message = bodyOf(page).getByRole('alert');
    expect(message.textContent).toContain('format version 2');
    expect(message.textContent).toContain('Update the reader page.');
    expect(page.window.document.getElementById('graph')?.hidden).toBe(true);
    expect(boxesOf(page)).toEqual([]);
  });
});
