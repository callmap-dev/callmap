import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SUITE = fileURLToPath(new URL('../../packages/conformance/src/cli.ts', import.meta.url));
const CALLMAP_TS = fileURLToPath(new URL('../src/cli.ts', import.meta.url));
const CI_WORKFLOW = fileURLToPath(new URL('../../.github/workflows/ci.yml', import.meta.url));

describe('callmap-ts in the conformance suite', () => {
  it('passes every TypeScript fixture repo', () => {
    const finished = spawnSync(
      process.execPath,
      [SUITE, '--language', 'typescript', process.execPath, CALLMAP_TS],
      { encoding: 'utf8' },
    );
    expect(finished.stderr).toBe('');
    expect(finished.stdout.split('\n')).toEqual([
      'ok typescript/levels',
      'ok typescript/review',
      '',
    ]);
    expect(finished.status).toBe(0);
  }, 300_000);

  it('runs in the CI of this repo on the fixture repos of the same commit', () => {
    expect(readFileSync(CI_WORKFLOW, 'utf8')).toContain(
      'npm run conformance -- --language typescript node callmap-ts/src/cli.ts',
    );
  });
});
