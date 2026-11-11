import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const RELEASE_WORKFLOW = readFileSync(
  fileURLToPath(new URL('../../.github/workflows/release.yml', import.meta.url)),
  'utf8',
);

const jobOf = (name: string): string => {
  const start = RELEASE_WORKFLOW.indexOf(`\n  ${name}:\n`);
  expect(start, name).toBeGreaterThan(-1);
  const end = RELEASE_WORKFLOW.slice(start + 1).search(/\n {2}[a-z-]+:\n/);
  return end === -1
    ? RELEASE_WORKFLOW.slice(start)
    : RELEASE_WORKFLOW.slice(start, start + 1 + end);
};

describe('the release workflow', () => {
  it('runs on a callmap-ts/v* tag, and not on a plain v* tag, because @callmap/cli had its last release', () => {
    expect(RELEASE_WORKFLOW).toContain("      - 'callmap-ts/v*'\n");
    expect(RELEASE_WORKFLOW).not.toContain("      - 'v*'\n");
    expect(RELEASE_WORKFLOW).not.toContain('--workspace @callmap/cli');
  });

  it('packs no release assets', () => {
    expect(RELEASE_WORKFLOW).not.toContain('release-assets');
  });

  it('publishes callmap-ts only on a callmap-ts/v* tag, with the OIDC token of a trusted publisher', () => {
    const job = jobOf('publish-callmap-ts');
    expect(job).toContain("if: startsWith(github.ref_name, 'callmap-ts/v')");
    expect(job).toContain('npm install --global npm@^11.5.1');
    expect(job).toContain('- run: npm publish --workspace callmap-ts');
    expect(job).not.toContain('NODE_AUTH_TOKEN');
    expect(RELEASE_WORKFLOW).toContain('id-token: write');
  });

  it('checks the tag against the version of callmap-ts, and runs its conformance suite and its pack test before it publishes', () => {
    const job = jobOf('publish-callmap-ts');
    const publish = job.indexOf('npm publish');
    for (const step of [
      `test "$GITHUB_REF_NAME" = "callmap-ts/v$(node -p "require('./callmap-ts/package.json').version")"`,
      'npm run conformance -- --language typescript node callmap-ts/src/cli.ts',
      'npm run test:pack -- callmap-ts',
    ])
      expect(job.indexOf(`- run: ${step}`), step).toBeGreaterThan(-1);
    for (const step of ['conformance', 'test:pack'])
      expect(job.indexOf(step), step).toBeLessThan(publish);
  });
});
