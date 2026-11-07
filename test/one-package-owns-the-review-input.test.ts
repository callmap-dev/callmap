import { globSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = join(import.meta.dirname, '..');
const OWNER = 'packages/review-input/';

const codeFiles = (...patterns: readonly string[]): readonly string[] =>
  patterns.flatMap((pattern) => globSync(pattern, { cwd: REPO_ROOT })).sort();

const textOf = (path: string): string => readFileSync(join(REPO_ROOT, path), 'utf8');

const callsOf = (path: string, name: string): number =>
  [...textOf(path).matchAll(new RegExp(`\\b${name}\\(`, 'g'))].length;

describe('the review input package', () => {
  it('is the one place that names the data block, packs the sources or escapes the JSON', () => {
    const offenders = codeFiles('packages/*/{src,page,test,test-browser,test-pack}/**/*.ts')
      .filter((path) => !path.startsWith(OWNER))
      .filter((path) =>
        /reader-page-data|CompressionStream|zlib|replaceAll\('<'/.test(textOf(path)),
      );
    expect(offenders).toEqual([]);
  });
});

describe('the review', () => {
  it('is not computed by the command, because the page computes it from the review input', () => {
    const offenders = codeFiles('packages/cli/src/**/*.ts').filter(
      (path) => callsOf(path, 'reviewOf') > 0,
    );
    expect(offenders).toEqual([]);
  });

  it('is computed by the page with one call to reviewOf', () => {
    const calls = codeFiles('packages/cli/page/**/*.ts').flatMap((path) =>
      Array.from({ length: callsOf(path, 'reviewOf') }, () => path),
    );
    expect(calls).toEqual(['packages/cli/page/data.ts']);
  });
});
