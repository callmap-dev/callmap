import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { featureBranchRepo } from './fixture-repo.ts';
import { tempDir } from '../../../test/temp-dir.ts';

const CLI = fileURLToPath(new URL('../src/cli.ts', import.meta.url));
const REPLACED_LINE = '@callmap/cli is replaced by callmap-ts. Run npx callmap-ts.\n';

const callmap = (args: readonly string[]) =>
  spawnSync(process.execPath, [CLI, ...args], {
    encoding: 'utf8',
    env: { ...process.env, XDG_CACHE_HOME: tempDir('callmap-cache-') },
  });

describe('the last release of @callmap/cli', () => {
  it('names callmap-ts first, and still writes the page', () => {
    const out = join(tempDir('callmap-out-'), 'review.html');
    const finished = callmap(['review', featureBranchRepo(), '--no-open', '--out', out]);
    expect(finished.status, finished.stderr).toBe(0);
    expect(finished.stderr).toBe(REPLACED_LINE);
    expect(existsSync(out)).toBe(true);
  });

  it('names callmap-ts on a run that fails too', () => {
    const finished = callmap(['review', tempDir('callmap-plain-'), '--no-open']);
    expect(finished.status).toBe(1);
    expect(finished.stderr.startsWith(REPLACED_LINE)).toBe(true);
  });
});
