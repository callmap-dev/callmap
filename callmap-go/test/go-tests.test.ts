import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const MODULE = join(import.meta.dirname, '..');

describe('the Go tests of callmap-go', () => {
  it('pass with the local go and the vendored modules', () => {
    const finished = spawnSync('go', ['test', './...'], {
      cwd: MODULE,
      encoding: 'utf8',
      env: {
        ...process.env,
        GOTOOLCHAIN: 'local',
        GOPROXY: 'off',
        GOFLAGS: '-mod=vendor',
        GOWORK: 'off',
      },
    });
    expect(finished.error).toBeUndefined();
    expect(finished.status, `${finished.stdout}${finished.stderr}`).toBe(0);
  });
});
