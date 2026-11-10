import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { TEMPLATE_DATA_BLOCK } from '@callmap/review-input';
import { describe, expect, it } from 'vitest';

const MODULE = fileURLToPath(new URL('..', import.meta.url));
const TEST_GLOBS = fileURLToPath(new URL('../../packages/scope/test-globs.json', import.meta.url));
const TEST_GLOBS_COPY = fileURLToPath(
  new URL('../internal/scope/test-globs.json', import.meta.url),
);
const PAGE_TEMPLATE_COPY = fileURLToPath(new URL('../page-template.html', import.meta.url));

const trackedFiles = (): readonly string[] =>
  execFileSync('git', ['ls-files', '--', '.'], { cwd: MODULE, encoding: 'utf8' }).split('\n');

describe('the copies that callmap-go embeds', () => {
  it('hold the test globs of the core byte for byte', () => {
    expect(readFileSync(TEST_GLOBS_COPY, 'utf8')).toBe(readFileSync(TEST_GLOBS, 'utf8'));
  });

  it('are committed, because go install builds from the files of the module only', () => {
    expect(trackedFiles()).toEqual(
      expect.arrayContaining(['internal/scope/test-globs.json', 'page-template.html']),
    );
  });

  it('hold a page template with the data block once', () => {
    expect(readFileSync(PAGE_TEMPLATE_COPY, 'utf8').split(TEMPLATE_DATA_BLOCK)).toHaveLength(2);
  });
});
