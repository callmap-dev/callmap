import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { reviewInputOfPage } from '@callmap/review-input';
import { beforeAll, describe, expect, it } from 'vitest';
import { featureBranchRepo, fixtureText, git } from '../../test/fixture-repo.ts';
import {
  boxesOf,
  callsOf,
  frameAround,
  framesOf,
  loadReaderPage,
  pageDataOf,
  sourcesOf,
} from '../../packages/reader-page/test/reader-page.ts';
import { fakeOpener, reviewHtmlOf, runCallmapTs } from './callmap-ts-run.ts';
import {
  readerPageOfFile,
  typescriptVersion,
} from '../../packages/reader-page/test/review-input-file.ts';
import { tempDir } from '../../test/temp-dir.ts';

const CART = 'src/cart.ts';
const MONEY = 'src/money.ts';
const CHECKOUT = 'src/checkout.ts';
const REPORT = 'src/report.ts';
const ALERTS = 'src/alerts.ts';
const NOTIFY = 'src/notify.ts';
const RATE = 'src/tax/rate.ts';

let repo = '';
let html = '';
let stdout = '';
let out = '';
let branchBefore = '';
let statusBefore = '';

beforeAll(() => {
  repo = featureBranchRepo();
  branchBefore = git(repo, 'rev-parse', '--abbrev-ref', 'HEAD');
  statusBefore = git(repo, 'status', '--porcelain');
  out = join(tempDir('callmap-out-'), 'review.html');
  const finished = runCallmapTs(['review', repo, '--no-open', '--out', out]);
  expect(finished.status, finished.stderr).toBe(0);
  stdout = finished.stdout;
  html = readFileSync(out, 'utf8');
});

describe('callmap-ts review on a feature branch', () => {
  it('marks each added, removed and changed function, and each neighbour', () => {
    const marks = Object.fromEntries(
      pageDataOf(html).review.functions.map(({ id, mark }) => [id, mark]),
    );
    expect(marks).toEqual({
      [`${ALERTS}#alert`]: 'changed',
      [`${ALERTS}#relay`]: 'added',
      [`${CART}#label`]: 'neighbour',
      [`${CART}#legacyTotal`]: 'removed',
      [`${CART}#receipt`]: 'changed',
      [`${CART}#subtotal`]: 'neighbour',
      [`${CART}#taxed`]: 'added',
      [`${CHECKOUT}#checkout`]: 'neighbour',
      [`${MONEY}#format`]: 'neighbour',
      [`${NOTIFY}#Mail.send`]: 'neighbour',
      [`${NOTIFY}#Sms.send`]: 'neighbour',
    });
  });

  it('does not mark a function that only moved to another line as changed', () => {
    const ids = pageDataOf(html).review.functions.map(({ id }) => id);
    expect(ids).not.toContain(`${MONEY}#round`);
  });

  it('lists each added and each removed call between the functions it shows', () => {
    expect(pageDataOf(html).review.calls).toEqual([
      { caller: `${ALERTS}#alert`, callee: `${MONEY}#format`, mark: 'added' },
      { caller: `${ALERTS}#alert`, callee: `${NOTIFY}#Mail.send`, mark: 'added' },
      { caller: `${ALERTS}#alert`, callee: `${NOTIFY}#Sms.send`, mark: 'added' },
      { caller: `${CART}#legacyTotal`, callee: `${CART}#subtotal`, mark: 'removed' },
      { caller: `${CART}#receipt`, callee: `${CART}#label`, mark: 'removed' },
      { caller: `${CART}#receipt`, callee: `${CART}#legacyTotal`, mark: 'removed' },
      { caller: `${CART}#receipt`, callee: `${CART}#taxed`, mark: 'added' },
      { caller: `${CART}#receipt`, callee: `${MONEY}#format`, mark: 'kept' },
      { caller: `${CART}#taxed`, callee: `${CART}#subtotal`, mark: 'added' },
      { caller: `${CHECKOUT}#checkout`, callee: `${CART}#receipt`, mark: 'kept' },
    ]);
  });

  it('holds the whole branch graph in the review of the data block, so the page can open more of it', () => {
    const { review } = pageDataOf(html);
    expect(review.branch.functions.map(({ id }) => id)).toContain(`${MONEY}#round`);
  });

  it('holds only the review input in the data block, with no review, no call graph and no base places', () => {
    const input = reviewInputOfPage(html);
    expect(Object.keys(input).sort()).toEqual([
      'base',
      'branch',
      'checkout',
      'editor',
      'formatVersion',
      'packedSources',
    ]);
    expect(input.formatVersion).toBe(1);
    expect(input.base.map(({ language }) => language)).toEqual(['typescript']);
    expect(input.branch.map(({ language }) => language)).toEqual(['typescript']);
  });

  it('names the TypeScript of the extractor as the checker of each graph document', () => {
    const input = reviewInputOfPage(html);
    expect([...input.base, ...input.branch].map(({ checker }) => checker)).toEqual([
      { name: 'TypeScript', version: typescriptVersion() },
      { name: 'TypeScript', version: typescriptVersion() },
    ]);
  });

  it('holds no plain file text in the data block', () => {
    const block = JSON.stringify(reviewInputOfPage(html));
    const lines = [ALERTS, CART, CHECKOUT, MONEY, NOTIFY, REPORT, RATE]
      .flatMap((file) => [
        ...fixtureText('branch', file).split('\n'),
        ...(file === ALERTS || file === CART ? fixtureText('base', file).split('\n') : []),
      ])
      .filter((line) => line.trim().length >= 20);
    expect(lines.length).toBeGreaterThan(10);
    for (const line of lines) {
      expect(block).not.toContain(line);
      expect(block).not.toContain(JSON.stringify(line).slice(1, -1));
    }
  });

  it('holds the branch text of every file in the branch graph documents, and the base text of every file that the branch changed', async () => {
    const sources = await sourcesOf(html);
    expect(sources.branch).toEqual({
      [ALERTS]: fixtureText('branch', ALERTS),
      [CART]: fixtureText('branch', CART),
      [CHECKOUT]: fixtureText('branch', CHECKOUT),
      [MONEY]: fixtureText('branch', MONEY),
      [NOTIFY]: fixtureText('branch', NOTIFY),
      [REPORT]: fixtureText('branch', REPORT),
      [RATE]: fixtureText('branch', RATE),
    });
    expect(sources.base).toEqual({
      [ALERTS]: fixtureText('base', ALERTS),
      [CART]: fixtureText('base', CART),
      [MONEY]: fixtureText('base', MONEY),
    });
  });

  it('holds the lines that each changed function had in the base, so the page can show its diff', () => {
    expect(pageDataOf(html).review.basePlaces).toEqual({
      [`${ALERTS}#alert`]: { firstLine: 3, lastLine: 3 },
      [`${CART}#receipt`]: { firstLine: 10, lastLine: 13 },
    });
  });

  it('writes the page to the path that --out names, and prints that path', () => {
    expect(stdout.trim()).toBe(out);
  });

  it('leaves the checkout and the working tree as they were', () => {
    expect(git(repo, 'rev-parse', '--abbrev-ref', 'HEAD')).toBe(branchBefore);
    expect(git(repo, 'status', '--porcelain')).toBe(statusBefore);
  });

  it('removes the temporary worktree of the base when it ends', () => {
    expect(git(repo, 'worktree', 'list', '--porcelain').match(/^worktree /gm)).toHaveLength(1);
  });
});

describe('the base sources of the review input', () => {
  const baseFilesOf = async (repo: string, ...flags: readonly string[]) =>
    Object.keys((await sourcesOf(reviewHtmlOf(repo, ...flags))).base);

  it('hold the old path of a renamed file and of a removed file, and no path that the base does not hold', async () => {
    const renamed = featureBranchRepo();
    git(renamed, 'mv', REPORT, 'src/summary.ts');
    git(renamed, 'rm', '--quiet', RATE);
    git(renamed, 'commit', '--quiet', '--message', 'rename and remove');
    expect(await baseFilesOf(renamed)).toEqual([ALERTS, CART, MONEY, REPORT, RATE]);
  });

  it('hold only the changed files in scope', async () => {
    expect(await baseFilesOf(featureBranchRepo(), '--scope', CART)).toEqual([CART]);
  });

  it('hold a changed file that is not committed yet', async () => {
    const uncommitted = featureBranchRepo();
    writeFileSync(join(uncommitted, CHECKOUT), `${fixtureText('branch', CHECKOUT)}\n`);
    expect(await baseFilesOf(uncommitted)).toEqual([ALERTS, CART, CHECKOUT, MONEY]);
  });
});

describe('the reader page', () => {
  let pageHtml = '';

  beforeAll(async () => {
    pageHtml = await readerPageOfFile('typescript/review');
  });

  it('inlines every script and style, so it makes no network request', () => {
    expect(pageHtml).not.toMatch(/<script[^>]*\ssrc=/i);
    expect(pageHtml).not.toMatch(/<link\b/i);
    expect(pageHtml).not.toMatch(/@import|url\(\s*['"]?https?:/i);
  });

  it('draws each function the review shows as a box inside the frame of its file', async () => {
    const page = await loadReaderPage(pageHtml);
    const boxes = boxesOf(page).filter(({ kind }) => kind === 'function');
    expect(
      boxes
        .map(({ id }) => id)
        .sort()
        .slice(0, 2),
    ).toEqual([`${ALERTS}#alert`, `${ALERTS}#relay`]);
    expect(boxes).toHaveLength(11);
    expect(frameAround(page, `${CART}#taxed`)).toBe(CART);
    expect(
      framesOf(page)
        .map(({ label }) => label)
        .sort(),
    ).toEqual([ALERTS, CART, CHECKOUT, MONEY, NOTIFY]);
  });

  it('draws each call as an arrow from the caller to the callee, with its mark', async () => {
    const arrows = callsOf(await loadReaderPage(pageHtml)).map(({ from, to, classes }) => ({
      caller: from,
      callee: to,
      mark: ['added', 'removed', 'kept'].find((mark) => classes.includes(mark)),
    }));
    expect(arrows).toEqual(pageDataOf(pageHtml).review.calls);
  });

  it('marks each box with its mark', async () => {
    const classesOf = new Map(
      boxesOf(await loadReaderPage(pageHtml)).map(({ id, classes }) => [id, classes]),
    );
    expect(classesOf.get(`${CART}#legacyTotal`)).toContain('removed');
    expect(classesOf.get(`${MONEY}#format`)).toContain('neighbour');
  });

  it('places every box the same way on every load, and the boxes of one file and one column in line order', async () => {
    const placed = async () => boxesOf(await loadReaderPage(pageHtml));
    const boxes = await placed();
    expect(await placed()).toEqual(boxes);
    const boxOf = (name: string) => boxes.find(({ id }) => id === `${CART}#${name}`);
    const [taxed, label] = [boxOf('taxed'), boxOf('label')];
    if (taxed === undefined || label === undefined) throw new Error('the drawing lost a box');
    expect(taxed.x + taxed.width).toBeGreaterThan(label.x);
    expect(label.x + label.width).toBeGreaterThan(taxed.x);
    expect(taxed.y).toBeLessThan(label.y);
  });
});

describe('opening the page', () => {
  it('opens the page in the browser when the run ends', async () => {
    const opener = fakeOpener();
    const target = join(tempDir('callmap-out-'), 'opened.html');
    const finished = runCallmapTs(['review', repo, '--out', target], opener);
    expect(finished.status, finished.stderr).toBe(0);
    await expect.poll(() => existsSync(opener.marker), { timeout: 5_000 }).toBe(true);
    expect(readFileSync(opener.marker, 'utf8')).toBe(target);
  });

  it('opens no browser with --no-open, and still writes the page', async () => {
    const opener = fakeOpener();
    const target = join(tempDir('callmap-out-'), 'closed.html');
    const finished = runCallmapTs(['review', repo, '--no-open', '--out', target], opener);
    expect(finished.status, finished.stderr).toBe(0);
    expect(existsSync(target)).toBe(true);
    await new Promise((settle) => setTimeout(settle, 500));
    expect(existsSync(opener.marker)).toBe(false);
  });
});
