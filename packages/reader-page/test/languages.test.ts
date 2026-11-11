import { getByRole, within } from '@testing-library/dom';
import { describe, expect, it } from 'vitest';
import { loadReaderPage } from './reader-page.ts';
import type { LoadedPage } from './reader-page.ts';
import { checkerVersionOf, readerPageOfFile } from './review-input-file.ts';
import type { ReviewInputFile } from './review-input-file.ts';

const pageOf = async (file: ReviewInputFile): Promise<LoadedPage> =>
  loadReaderPage(await readerPageOfFile(file));

const regionOf = ({ window }: LoadedPage, name: string) =>
  within(getByRole(window.document.body, 'region', { name }));

describe.each([
  { file: 'go/review', language: 'go', checker: 'Go', rate: '85.7%', openEnd: 'gen.Log line 6' },
  {
    file: 'ruby/review',
    language: 'ruby',
    checker: 'Callmap Ruby rules',
    rate: '83.3%',
    openEnd: 'Ledger.total line 5',
  },
] as const)('the page of the review input $file', ({ file, language, checker, rate, openEnd }) => {
  it('shows one resolution rate, next to the checker and its version', async () => {
    const name = `${checker} ${checkerVersionOf(language)}`;
    const rates = regionOf(await pageOf(file), 'Resolution rate');
    expect(rates.getAllByRole('group')).toHaveLength(1);
    expect(rates.getByRole('group', { name }).textContent).toContain(`${name} · ${rate}`);
  });

  it('shows the open end of a call into code that does not load with the words code not found', async () => {
    const openEnds = regionOf(await pageOf(file), 'Open ends');
    expect(openEnds.getByRole('button', { name: `${openEnd} · code not found` })).toBeDefined();
  });
});
