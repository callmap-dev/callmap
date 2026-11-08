import { spawnSync } from 'node:child_process';
import { cpSync, globSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { tempDir } from '../../../test/temp-dir.ts';

const SUITE = fileURLToPath(new URL('../src/cli.ts', import.meta.url));
const CALLMAP = fileURLToPath(new URL('../../cli/src/cli.ts', import.meta.url));
const REPLAYED_REVIEW = fileURLToPath(new URL('./replayed-review.ts', import.meta.url));
const FIXTURE_REPOS = fileURLToPath(new URL('../fixture-repos', import.meta.url));
const CI_WORKFLOW = fileURLToPath(new URL('../../../.github/workflows/ci.yml', import.meta.url));
const GO_EXPECTED = join(FIXTURE_REPOS, 'go/review/expected-review-input.json');

type Json = null | boolean | number | string | readonly Json[] | { readonly [key: string]: Json };
type JsonObject = { readonly [key: string]: Json };

const runSuite = (...args: readonly string[]) =>
  spawnSync(process.execPath, [SUITE, ...args], { encoding: 'utf8' });

const jsonOf = (text: string): Json => JSON.parse(text) as Json;

const replayedReviewOf = (input: Json): readonly string[] => {
  const replayed = join(tempDir('callmap-replayed-'), 'review-input.json');
  writeFileSync(replayed, JSON.stringify(input));
  return [process.execPath, REPLAYED_REVIEW, replayed];
};

const objectAt = (value: Json | undefined): JsonObject => {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error(`${JSON.stringify(value)} is not an object`);
  return value as JsonObject;
};

const expectedGoInput = (): JsonObject => objectAt(jsonOf(readFileSync(GO_EXPECTED, 'utf8')));

const withKeysReversed = (value: Json): Json => {
  if (Array.isArray(value)) return value.map(withKeysReversed);
  if (typeof value !== 'object' || value === null) return value;
  return Object.fromEntries(
    Object.entries(value)
      .reverse()
      .map(([key, entry]) => [key, withKeysReversed(entry)]),
  );
};

const keysInSortedOrder = (value: Json): boolean => {
  if (Array.isArray(value)) return value.every(keysInSortedOrder);
  if (typeof value !== 'object' || value === null) return true;
  const keys = Object.keys(value);
  return (
    keys.join('\n') === [...keys].sort().join('\n') && Object.values(value).every(keysInSortedOrder)
  );
};

const goDocumentWith = (document: Json | undefined, checkerVersion: string): JsonObject => {
  const graph = objectAt(document);
  return { ...graph, checker: { ...objectAt(graph['checker']), version: checkerVersion } };
};

describe('the conformance suite', () => {
  it('passes the current callmap command on every fixture repo', () => {
    const finished = runSuite(process.execPath, CALLMAP);
    expect(finished.stderr).toBe('');
    expect(finished.stdout.split('\n')).toEqual([
      'ok go/review',
      'ok ruby/review',
      'ok typescript/levels',
      'ok typescript/review',
      '',
    ]);
    expect(finished.status).toBe(0);
  }, 300_000);

  it('masks the commit hashes, the repo root and the checker version before the compare', () => {
    const expected = expectedGoInput();
    const fromAnotherMachine = {
      ...expected,
      base: [goDocumentWith((expected['base'] as readonly Json[])[0], '1.26.4')],
      branch: [goDocumentWith((expected['branch'] as readonly Json[])[0], '1.27.0')],
      checkout: { ...objectAt(expected['checkout']), baseCommit: 'a1b2c3d', headCommit: 'e4f5a6b' },
      editor: { ...objectAt(expected['editor']), repoRoot: '/home/reader/shop' },
    };
    const finished = runSuite('--language', 'go', ...replayedReviewOf(fromAnotherMachine));
    expect(finished.stdout).toBe('ok go/review\n');
    expect(finished.status).toBe(0);
  });

  it('compares the review input as JSON values, so the key order is not part of the contract', () => {
    const finished = runSuite(
      '--language',
      'go',
      ...replayedReviewOf(withKeysReversed(expectedGoInput())),
    );
    expect(finished.stdout).toBe('ok go/review\n');
    expect(finished.status).toBe(0);
  });

  it('shows a difference as a JSON diff of the review input after the masks', () => {
    const renamed = readFileSync(GO_EXPECTED, 'utf8').replace(
      '"name": "Receipt"',
      '"name": "Invoice"',
    );
    const finished = runSuite('--language', 'go', ...replayedReviewOf(jsonOf(renamed)));
    expect(finished.stdout).toContain(
      [
        'FAIL go/review',
        '--- expected',
        '+++ actual',
        '@@ line 148 of the expected file @@',
        '            "firstLine": 13,',
        '            "id": "checkout/checkout.go#Receipt",',
        '            "lastLine": 15,',
        '-           "name": "Receipt",',
        '+           "name": "Invoice",',
        '            "sourceHash": "1271c9d6fdb3a048619a33bfc3528bf6740f530afa0071292d592a0208623b52"',
        '          },',
        '          {',
      ].join('\n'),
    );
    expect(finished.status).toBe(1);
  });

  it('runs only the fixture repos of the language that --language names', () => {
    const finished = runSuite('--language', 'ruby', ...replayedReviewOf(expectedGoInput()));
    expect(finished.stdout.split('\n')[0]).toBe('FAIL ruby/review');
    expect(finished.stdout).not.toContain('go/review');
  });

  it('writes the expected file with its keys in sorted order on --update', () => {
    const fixtures = tempDir('callmap-fixtures-');
    cpSync(join(FIXTURE_REPOS, 'go'), join(fixtures, 'go'), { recursive: true });
    const expectedFile = join(fixtures, 'go/review/expected-review-input.json');
    writeFileSync(expectedFile, '{}\n');
    const replayed = replayedReviewOf(withKeysReversed(expectedGoInput()));

    const updated = runSuite('--fixtures', fixtures, '--update', ...replayed);
    expect(updated.stdout).toBe('updated go/review\n');
    expect(readFileSync(expectedFile, 'utf8')).toBe(readFileSync(GO_EXPECTED, 'utf8'));
    expect(runSuite('--fixtures', fixtures, ...replayed).stdout).toBe('ok go/review\n');
  });

  it('prints the usage line when no review command follows the flags', () => {
    const finished = runSuite('--language', 'go');
    expect(finished.stderr).toBe(
      'usage: conformance [--fixtures <folder>] [--language <language>] [--update] <review command>...\n',
    );
    expect(finished.status).toBe(1);
  });
});

describe('the expected files', () => {
  const expectedFiles = globSync('*/*/expected-review-input.json', { cwd: FIXTURE_REPOS }).sort();

  it('cover each fixture repo of each language', () => {
    expect(expectedFiles).toEqual([
      'go/review/expected-review-input.json',
      'ruby/review/expected-review-input.json',
      'typescript/levels/expected-review-input.json',
      'typescript/review/expected-review-input.json',
    ]);
  });

  it.each(expectedFiles)('%s keeps its keys in sorted order', (file) => {
    expect(keysInSortedOrder(jsonOf(readFileSync(join(FIXTURE_REPOS, file), 'utf8')))).toBe(true);
  });
});

describe('the CI of this repo', () => {
  it('runs the conformance suite against the current callmap command', () => {
    expect(readFileSync(CI_WORKFLOW, 'utf8')).toContain(
      'npm run conformance -- node packages/cli/src/cli.ts',
    );
  });
});
