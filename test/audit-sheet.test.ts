import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dataBlockOf, packedReviewInputOf } from '@callmap/review-input';
import type { ReviewInput, UnpackedReviewInput } from '@callmap/review-input';
import { beforeAll, describe, expect, it } from 'vitest';
import { reviewHtmlOf } from '../callmap-ts/test/callmap-ts-run.ts';
import { commitFile, conformanceRepo } from './fixture-repo.ts';
import { tempDir } from './temp-dir.ts';

const AUDIT = fileURLToPath(new URL('../packages/gates/src/audit.ts', import.meta.url));
const CART = fileURLToPath(
  new URL(
    '../packages/conformance/fixture-repos/typescript/review/branch/src/cart.ts',
    import.meta.url,
  ),
);
const RUBY_EXPECTED = fileURLToPath(
  new URL(
    '../packages/conformance/fixture-repos/ruby/review/expected-review-input.json',
    import.meta.url,
  ),
);

const COMMENT_LINES = [
  '',
  '// label(name) keeps the name in capitals.',
  '/* receipt(prices) gives the text of a receipt,',
  ' * and taxed(prices) adds the tax.',
  ' */',
  '',
].join('\n');

const TYPESCRIPT_CANDIDATES = [
  'src/alerts.ts:4',
  'src/alerts.ts:5',
  'src/alerts.ts:7',
  'src/alerts.ts:8',
  'src/cart.ts:3',
  'src/cart.ts:4',
  'src/cart.ts:6',
  'src/cart.ts:8',
  'src/cart.ts:9',
  'src/cart.ts:10',
  'src/cart.ts:13',
  'src/checkout.ts:3',
  'src/money.ts:1',
  'src/money.ts:3',
  'src/notify.ts:2',
  'src/notify.ts:6',
  'src/notify.ts:12',
  'src/report.ts:1',
  'src/report.ts:3',
  'src/tax/rate.ts:1',
];

const RUBY_CANDIDATES = [
  'app/models/concerns/billable.rb:1',
  'app/models/concerns/billable.rb:2',
  'app/models/concerns/billable.rb:3',
  'app/models/order.rb:1',
  'app/models/order.rb:2',
  'app/models/order.rb:4',
  'app/models/order.rb:5',
  'app/models/order.rb:8',
  'app/models/order.rb:9',
  'app/models/order.rb:12',
  'app/models/order.rb:16',
  'app/models/refund.rb:1',
  'app/models/refund.rb:2',
  'app/models/refund.rb:4',
  'app/models/refund.rb:5',
  'app/models/refund.rb:8',
  'app/models/refund.rb:9',
  'app/models/refund.rb:13',
  'app/models/refund.rb:14',
  'app/services/checkout.rb:1',
  'app/services/checkout.rb:2',
  'app/services/checkout.rb:3',
  'app/services/checkout.rb:6',
  'app/services/checkout.rb:7',
];

const HEAD_FLAGS = [
  '--repo',
  'callmap-dev/shop',
  '--distribution',
  'callmap-ts',
  '--version',
  '0.1.0',
] as const;

const runAudit = (...args: readonly string[]) =>
  spawnSync(process.execPath, [AUDIT, ...args], { encoding: 'utf8' });

interface Audit {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly sheet: string;
}

const auditOf = (page: string, ...flags: readonly string[]): Audit => {
  const out = join(tempDir('callmap-audit-'), 'audit-sheet.md');
  const finished = runAudit(page, ...HEAD_FLAGS, '--out', out, ...flags);
  const sheet = finished.status === 0 ? readFileSync(out, 'utf8') : '';
  return { status: finished.status, stdout: finished.stdout, stderr: finished.stderr, sheet };
};

const sheetOf = (page: string, ...flags: readonly string[]): string => {
  const audit = auditOf(page, ...flags);
  if (audit.status !== 0) throw new Error(audit.stderr);
  return audit.sheet;
};

const sectionsOf = (sheet: string): ReadonlyMap<string, string> =>
  new Map(
    sheet
      .split('\n## ')
      .slice(1)
      .map((section) => [section.slice(0, section.indexOf('\n')), section] as const),
  );

const sectionAt = (sheet: string, location: string): string => {
  const section = sectionsOf(sheet).get(location);
  if (section === undefined) throw new Error(`the sheet holds no section for ${location}`);
  return section;
};

const pageOf = (input: ReviewInput): string => {
  const page = join(tempDir('callmap-page-'), 'review.html');
  writeFileSync(page, `<!doctype html>\n<body>${dataBlockOf(input)}</body>\n`);
  return page;
};

let typescriptPage = '';

beforeAll(() => {
  const repo = conformanceRepo('typescript/review');
  commitFile(
    repo,
    'src/cart.ts',
    `${readFileSync(join(repo, 'src/cart.ts'), 'utf8')}${COMMENT_LINES}`,
  );
  typescriptPage = join(tempDir('callmap-page-'), 'review.html');
  writeFileSync(typescriptPage, reviewHtmlOf(repo, '--no-cache'));
}, 120_000);

const ALL_TYPESCRIPT_LINES = ['--seed', '1', '--count', String(TYPESCRIPT_CANDIDATES.length)];

describe('the audit command', () => {
  it('writes an audit sheet whose head names the repo, the commit, the distribution, its version, the checker, the seed and the count', () => {
    const audit = auditOf(typescriptPage, '--seed', '7', '--count', '5');
    expect(audit.stderr).toBe('');
    expect(audit.status).toBe(0);
    const head = audit.sheet.slice(0, audit.sheet.indexOf('\n## '));
    expect(head).toMatch(/^# Audit sheet\n/);
    expect(head).toContain('- Repo: `callmap-dev/shop`\n');
    expect(head).toMatch(/- Commit: `[0-9a-f]{7,40}`\n/);
    expect(head).toContain('- Distribution: `callmap-ts`\n');
    expect(head).toContain('- Version: `0.1.0`\n');
    expect(head).toMatch(/- Checker: TypeScript \d+\.\d+\.\d+\n/);
    expect(head).toContain('- Seed: 7\n');
    expect(head).toContain('- Count: 5\n');
    expect(sectionsOf(audit.sheet).size).toBe(5);
  });

  it('gives a byte-identical sheet for the same page and the same seed, and another sample for another seed', () => {
    const first = sheetOf(typescriptPage, '--seed', '42', '--count', '5');
    expect(sheetOf(typescriptPage, '--seed', '42', '--count', '5')).toBe(first);
    const other = sheetOf(typescriptPage, '--seed', '43', '--count', '5');
    expect([...sectionsOf(other).keys()]).not.toEqual([...sectionsOf(first).keys()]);
  });

  it('samples only the lines that hold an opening parenthesis, and no blank line and no comment line', () => {
    const sheet = sheetOf(typescriptPage, ...ALL_TYPESCRIPT_LINES);
    expect([...sectionsOf(sheet).keys()]).toEqual(TYPESCRIPT_CANDIDATES);
  });

  it('shows the source text of each sampled line and leaves its verdict empty', () => {
    const section = sectionAt(sheetOf(typescriptPage, ...ALL_TYPESCRIPT_LINES), 'src/cart.ts:4');
    const sourceText = readFileSync(CART, 'utf8').split('\n')[3] ?? '';
    expect(section).toContain(`\n\`\`\`\n${sourceText}\n\`\`\`\n`);
    expect(section).toMatch(/\nVerdict:\n*$/);
  });

  it('lists the callee of each call on the line', () => {
    const section = sectionAt(sheetOf(typescriptPage, ...ALL_TYPESCRIPT_LINES), 'src/cart.ts:4');
    expect(section).toContain('- Call: `src/money.ts#round`\n');
    expect(section).not.toContain('holds nothing');
  });

  it('lists each implementation of a one-of group on the line', () => {
    const section = sectionAt(sheetOf(typescriptPage, ...ALL_TYPESCRIPT_LINES), 'src/alerts.ts:5');
    expect(section).toContain(
      [
        '- Call: `src/money.ts#format`',
        '- One-of group:',
        '  - `src/notify.ts#Mail.send`',
        '  - `src/notify.ts#Sms.send`',
      ].join('\n'),
    );
  });

  it('lists the open-end reason of each open end on the line', () => {
    const section = sectionAt(sheetOf(typescriptPage, ...ALL_TYPESCRIPT_LINES), 'src/alerts.ts:8');
    expect(section).toContain('- Open end: `JSON.parse(raw).notify`, open-end reason `untyped`\n');
  });

  it('says that the graph document holds nothing on a line with only a library call', () => {
    const section = sectionAt(sheetOf(typescriptPage, ...ALL_TYPESCRIPT_LINES), 'src/cart.ts:13');
    expect(section).toContain('The graph document holds nothing on this line.\n');
  });

  it('samples 200 lines by default, and fails when the files in scope hold fewer lines that can hold a call', () => {
    const audit = auditOf(typescriptPage, '--seed', '1');
    expect(audit.stderr).toBe(
      `The files in scope hold ${String(TYPESCRIPT_CANDIDATES.length)} lines that can hold a call, fewer than the count 200.\n`,
    );
    expect(audit.status).toBe(1);
  });

  it('fails with the message that names the side to update on a page of an unknown format version', async () => {
    const input = JSON.parse(readFileSync(RUBY_EXPECTED, 'utf8')) as UnpackedReviewInput;
    const page = pageOf({
      ...(await packedReviewInputOf(input)),
      formatVersion: 2,
    } as unknown as ReviewInput);
    const audit = auditOf(page, '--seed', '1', '--count', '1');
    expect(audit.stderr).toBe(
      'The review input has format version 2, and this reader page reads only format version 1. Update the reader page.\n',
    );
    expect(audit.status).toBe(1);
  });

  it('samples each Ruby line with an identifier, because a Ruby call needs no parenthesis', async () => {
    const input = JSON.parse(readFileSync(RUBY_EXPECTED, 'utf8')) as UnpackedReviewInput;
    const page = pageOf(await packedReviewInputOf(input));
    const sheet = sheetOf(page, '--seed', '1', '--count', String(RUBY_CANDIDATES.length));
    expect([...sectionsOf(sheet).keys()]).toEqual(RUBY_CANDIDATES);
    expect(sectionAt(sheet, 'app/models/concerns/billable.rb:3')).toContain(
      [
        '- One-of group:',
        '  - `app/models/order.rb#Order#total`',
        '  - `app/models/refund.rb#Refund#total`',
      ].join('\n'),
    );
  });
});
