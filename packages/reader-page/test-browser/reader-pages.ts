import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import type { Browser, Page } from 'playwright-core';
import { afterAll, beforeAll } from 'vitest';
import { tempDir } from '../../../test/temp-dir.ts';
import { readerPageOfFile } from '../test/review-input-file.ts';
import type { ReviewInputFile } from '../test/review-input-file.ts';
import { chromiumExecutable } from './chromium.ts';

export interface PageLook {
  readonly viewport: { readonly width: number; readonly height: number };
  readonly colorScheme: 'light' | 'dark';
}

const pageFileOf = async (input: ReviewInputFile): Promise<string> => {
  const file = join(tempDir('callmap-browser-'), 'review.html');
  writeFileSync(file, await readerPageOfFile(input));
  return pathToFileURL(file).href;
};

export const settled = async (page: Page): Promise<void> => {
  await page.waitForFunction(
    () =>
      document.getElementById('graph')?.getAttribute('aria-busy') === 'false' &&
      document.querySelector('[aria-busy="true"]') === null,
  );
};

export const readerPagesOf = <Fixture extends string>(
  inputs: Readonly<Record<Fixture, ReviewInputFile>>,
): ((fixture: Fixture, look: PageLook) => Promise<Page>) => {
  const pageFiles = new Map<Fixture, string>();
  let browser: Browser | undefined;

  beforeAll(async () => {
    const executablePath = chromiumExecutable();
    for (const [fixture, input] of Object.entries(inputs) as [Fixture, ReviewInputFile][])
      pageFiles.set(fixture, await pageFileOf(input));
    browser = await chromium.launch({ executablePath });
  }, 120_000);

  afterAll(async () => {
    await browser?.close();
  });

  return async (fixture, look) => {
    if (browser === undefined) throw new Error('the browser did not start');
    const page = await browser.newPage(look);
    await page.goto(pageFiles.get(fixture) ?? '');
    await settled(page);
    return page;
  };
};
