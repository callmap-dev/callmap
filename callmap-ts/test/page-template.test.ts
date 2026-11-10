import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const CALLMAP_TS = fileURLToPath(new URL('..', import.meta.url));

const git = (...args: readonly string[]): string =>
  execFileSync('git', args, { cwd: CALLMAP_TS, encoding: 'utf8' });

describe('the page template of callmap-ts', () => {
  it('has no copy in git, because the build copies it from the build of the same commit', () => {
    expect(git('ls-files', '--', '.').split('\n')).not.toEqual(
      expect.arrayContaining([expect.stringMatching(/page-template\.html$/)]),
    );
    expect(git('check-ignore', '--no-index', 'dist/page-template.html').trim()).toBe(
      'dist/page-template.html',
    );
  });
});
