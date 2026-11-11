import type { Checkout } from '@callmap/review-input';
import { describe, expect, it } from 'vitest';
import { loadReaderPage } from './reader-page.ts';
import { readerPageOfFile } from './review-input-file.ts';

const topBarOf = async (checkout: Partial<Checkout>) => {
  const html = await readerPageOfFile('typescript/review', (input) => ({
    ...input,
    checkout: { ...input.checkout, ...checkout },
  }));
  const { window } = await loadReaderPage(html);
  const top = window.document.querySelector('.top-bar .checkout');
  return {
    names: top?.querySelector('.checkout-names')?.textContent ?? '',
    range: top?.querySelector('.checkout-range')?.textContent ?? '',
  };
};

const CLEAN: Partial<Checkout> = {
  branch: 'feature',
  baseName: 'main',
  baseCommit: '1a2b3c4',
  headCommit: '5d6e7f8',
  uncommitted: false,
};

describe('the checkout in the top bar', () => {
  it('names the branch and the base, with the range from the base commit to the head commit', async () => {
    expect(await topBarOf(CLEAN)).toEqual({ names: 'feature vs main', range: '1a2b3c4…5d6e7f8' });
  });

  it('names the base as the review input names it', async () => {
    expect((await topBarOf({ ...CLEAN, baseName: 'origin/main' })).names).toBe(
      'feature vs origin/main',
    );
  });

  it('shows a detached HEAD in place of the branch name', async () => {
    expect((await topBarOf({ ...CLEAN, branch: undefined })).names).toBe('detached HEAD vs main');
  });
});

describe('the uncommitted mark in the top bar', () => {
  it('marks a review input with uncommitted changes', async () => {
    expect((await topBarOf({ ...CLEAN, uncommitted: true })).range).toBe(
      '1a2b3c4…5d6e7f8 + uncommitted changes',
    );
  });

  it('leaves a clean review input unmarked', async () => {
    expect((await topBarOf(CLEAN)).range).toBe('1a2b3c4…5d6e7f8');
  });
});
