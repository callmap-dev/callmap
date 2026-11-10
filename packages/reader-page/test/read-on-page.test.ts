import { fireEvent, within } from '@testing-library/dom';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  boxElementOf,
  boxesOf,
  callsOf,
  clickBox,
  frameAround,
  loadReaderPage,
  settled,
} from './reader-page.ts';
import type { LoadedPage } from './reader-page.ts';
import { readerPageOfFile, REPO_ROOT } from './review-input-file.ts';

const CART = 'src/cart.ts';
const MONEY = 'src/money.ts';
const REPORT = 'src/report.ts';

let html = '';

beforeAll(async () => {
  html = await readerPageOfFile('typescript/review');
});

const codePanelOf = ({ window }: LoadedPage) =>
  within(within(window.document.body).getByRole('region', { name: 'Code' }));

const callNamesOf = (page: LoadedPage): readonly string[] =>
  callsOf(page)
    .map(({ from, to }) => `${from} -> ${to}`)
    .sort();

describe('the next hop', () => {
  it('adds the callers and the callees of a neighbour after a click on it', async () => {
    const page = await loadReaderPage(html);
    expect(boxElementOf(page, `${MONEY}#round`)).toBeUndefined();
    await clickBox(page, `${MONEY}#format`);
    expect(boxElementOf(page, `${MONEY}#round`)).toBeDefined();
    expect(boxElementOf(page, `${MONEY}#round`)?.classList.contains('neighbour')).toBe(false);
    expect(frameAround(page, `${MONEY}#round`)).toBe(MONEY);
    expect(callNamesOf(page)).toContain(`${MONEY}#format -> ${MONEY}#round`);
  });

  it('draws each call between the functions it shows once, however many times it opens', async () => {
    const page = await loadReaderPage(html);
    await clickBox(page, `${MONEY}#format`);
    await clickBox(page, `${CART}#subtotal`);
    await clickBox(page, `${MONEY}#format`);
    const calls = callNamesOf(page);
    expect(calls).toEqual([...new Set(calls)]);
    expect(calls.filter((call) => call.endsWith(`${MONEY}#round`))).toEqual([
      `${CART}#subtotal -> ${MONEY}#round`,
      `${MONEY}#format -> ${MONEY}#round`,
    ]);
  });

  it('places no two boxes on the same spot after it opens', async () => {
    const page = await loadReaderPage(html);
    await clickBox(page, `${MONEY}#format`);
    const spots = boxesOf(page).map(({ x, y }) => `${String(x)},${String(y)}`);
    expect(new Set(spots).size).toBe(spots.length);
  });
});

const search = ({ window }: LoadedPage, text: string) => {
  const body = within(window.document.body);
  fireEvent.input(body.getByRole('searchbox', { name: 'Find a function' }), {
    target: { value: text },
  });
  return within(body.getByRole('region', { name: 'Search' }));
};

describe('the search', () => {
  it('finds a function by a part of its name, with no regard to case', async () => {
    const results = search(await loadReaderPage(html), 'REP');
    expect(results.getAllByRole('button').map((result) => result.textContent)).toEqual([
      `report ${REPORT}`,
    ]);
  });

  it('opens a function the branch did not change with its one hop, and shows its code', async () => {
    const page = await loadReaderPage(html);
    expect(boxElementOf(page, `${REPORT}#report`)).toBeUndefined();
    fireEvent.click(search(page, 'report').getByRole('button', { name: `report ${REPORT}` }));
    await settled(page);
    expect(frameAround(page, `${REPORT}#report`)).toBe(REPORT);
    expect(callNamesOf(page)).toContain(`${REPORT}#report -> ${REPORT}#heading`);
    expect(codePanelOf(page).getByRole('heading', { name: 'report' })).toBeDefined();
    expect(page.window.document.querySelector('.code-place')?.textContent).toBe(
      `${REPORT}:3 Open in VS Code`,
    );
  });

  it('lists nothing for an empty search', async () => {
    expect(search(await loadReaderPage(html), '').queryAllByRole('button')).toEqual([]);
  });
});

describe('the editor link', () => {
  const linkOf = async (page: LoadedPage, id: string, name: string) => {
    await clickBox(page, id);
    return codePanelOf(page).getByRole('link', { name }).getAttribute('href');
  };

  it('opens the file of a function at its first line in VS Code, in the repo root of the review input', async () => {
    expect(await linkOf(await loadReaderPage(html), `${CART}#receipt`, 'Open in VS Code')).toBe(
      `vscode://file${REPO_ROOT}/${CART}:8`,
    );
  });

  it('opens the file of a function at its first line in a JetBrains editor, which counts from 0', async () => {
    const page = await loadReaderPage(
      await readerPageOfFile('typescript/review', (input) => ({
        ...input,
        editor: { ...input.editor, name: 'jetbrains' },
      })),
    );
    expect(await linkOf(page, `${CART}#receipt`, 'Open in JetBrains')).toBe(
      `jetbrains://idea/navigate/reference?project=shop&path=${CART}:7`,
    );
  });

  it('gives a removed function no editor link, because the branch no longer holds it', async () => {
    const page = await loadReaderPage(html);
    await clickBox(page, `${CART}#legacyTotal`);
    expect(codePanelOf(page).queryByRole('link')).toBeNull();
  });
});

describe('the colours of the page', () => {
  const tokensIn = (block: string): readonly string[] =>
    [...block.matchAll(/(--[a-z-]+)\s*:/g)].map(([, token]) => token ?? '').sort();

  it('gives every colour a value for the light mode and one for the dark mode', () => {
    const light = /<style>\s*:root\s*\{([^}]*)\}/.exec(html)?.[1] ?? '';
    const dark =
      /@media \(prefers-color-scheme: dark\)\s*\{\s*:root\s*\{([^}]*)\}/.exec(html)?.[1] ?? '';
    expect(tokensIn(light)).toEqual(
      expect.arrayContaining(['--focus', '--selected', '--fade', '--edge', '--canvas']),
    );
    expect(tokensIn(light)).not.toContain('--changed-line');
    expect(tokensIn(dark)).toEqual(tokensIn(light).filter((token) => !token.startsWith('--font-')));
    expect(html).toMatch(/color-scheme:\s*light dark/);
  });
});
