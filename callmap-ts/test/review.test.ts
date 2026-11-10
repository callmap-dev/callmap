import { spawnSync } from 'node:child_process';
import type { SpawnSyncReturns } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { reviewInputOfPage } from '@callmap/review-input';
import { describe, expect, it } from 'vitest';
import { featureBranchRepo, goRepo, rubyRepo } from '../../packages/cli/test/fixture-repo.ts';
import { tempDir } from '../../test/temp-dir.ts';

const CALLMAP_TS = fileURLToPath(new URL('../src/cli.ts', import.meta.url));

const GO_LINE =
  'callmap-ts read only the TypeScript files. Run callmap-go review for the Go files.';
const RUBY_LINE =
  'callmap-ts read only the TypeScript files. Run callmap-rb review for the Ruby files.';

interface Run {
  readonly finished: SpawnSyncReturns<string>;
  readonly out: string;
  readonly cacheHome: string;
}

const runCallmapTs = (repo: string, ...flags: readonly string[]): Run => {
  const out = join(tempDir('callmap-ts-out-'), 'review.html');
  const cacheHome = tempDir('callmap-ts-cache-');
  const finished = spawnSync(
    process.execPath,
    [CALLMAP_TS, 'review', repo, '--no-open', '--out', out, ...flags],
    { encoding: 'utf8', env: { ...process.env, XDG_CACHE_HOME: cacheHome } },
  );
  return { finished, out, cacheHome };
};

const languagesOf = (out: string): readonly string[] => {
  const input = reviewInputOfPage(readFileSync(out, 'utf8'));
  return [...input.base, ...input.branch].map(({ language }) => language);
};

describe('callmap-ts review', () => {
  it('writes the reader page of a TypeScript repo and prints its path', () => {
    const { finished, out } = runCallmapTs(featureBranchRepo());
    expect(finished.stderr).toBe('');
    expect(finished.status).toBe(0);
    expect(finished.stdout).toBe(`${out}\n`);
    expect(languagesOf(out)).toEqual(['typescript', 'typescript']);
  });

  it('reads only the TypeScript files of a repo with Go, and prints one line that names callmap-go', () => {
    const { finished, out } = runCallmapTs(goRepo());
    expect(finished.status).toBe(0);
    expect(finished.stderr).toBe(`${GO_LINE}\n`);
    expect(languagesOf(out)).toEqual(['typescript', 'typescript']);
  });

  it('reads only the TypeScript files of a repo with Ruby, and prints one line that names callmap-rb', () => {
    const { finished, out } = runCallmapTs(rubyRepo());
    expect(finished.status).toBe(0);
    expect(finished.stderr).toBe(`${RUBY_LINE}\n`);
    expect(languagesOf(out)).toEqual(['typescript', 'typescript']);
  });

  it('prints no line for the files of another language that the scope leaves out', () => {
    const { finished } = runCallmapTs(goRepo(), '--scope', '!**/*.go');
    expect(finished.status).toBe(0);
    expect(finished.stderr).toBe('');
  });

  it('keeps its base cache in its own folder of the cache home', () => {
    const { finished, cacheHome } = runCallmapTs(
      featureBranchRepo(),
      '--tsconfig',
      'tsconfig.json',
    );
    expect(finished.status).toBe(0);
    expect(readdirSync(cacheHome)).toEqual(['callmap-ts']);
    expect(
      readdirSync(join(cacheHome, 'callmap-ts'), { recursive: true, encoding: 'utf8' }).filter(
        (entry) => entry.endsWith('.json'),
      ),
    ).toHaveLength(1);
  });

  it('names callmap-ts in its usage line and in its messages, and takes --tsconfig', () => {
    const usage = spawnSync(process.execPath, [CALLMAP_TS, 'help'], { encoding: 'utf8' });
    expect(usage.status).toBe(1);
    expect(usage.stderr).toMatch(/^usage: callmap-ts review \[<repo>\] .*\[--tsconfig <file>\]/);
    const unknown = spawnSync(process.execPath, [CALLMAP_TS, 'review', '--nope'], {
      encoding: 'utf8',
    });
    expect(unknown.stderr).toBe('--nope is not a flag callmap-ts review knows\n');
  });
});
