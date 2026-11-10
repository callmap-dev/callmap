import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const workflowOf = (name: string): string =>
  readFileSync(fileURLToPath(new URL(`../../.github/workflows/${name}`, import.meta.url)), 'utf8');

const CI_WORKFLOW = workflowOf('ci.yml');
const RELEASE_WORKFLOW = workflowOf('release.yml');

const jobOf = (workflow: string, name: string): string => {
  const start = workflow.indexOf(`\n  ${name}:\n`);
  expect(start, name).toBeGreaterThan(-1);
  const end = workflow.slice(start + 1).search(/\n {2}[a-z-]+:\n/);
  return end === -1 ? workflow.slice(start) : workflow.slice(start, start + 1 + end);
};

const GO_INSTALL = '- run: go install .\n        working-directory: callmap-go';
const CONFORMANCE = '- run: npm run conformance -- --language go "$(go env GOPATH)/bin/callmap-go"';

describe('the CI of callmap-go', () => {
  it('installs callmap-go from the checkout and runs the conformance suite for Go on the fixture repos of the same commit', () => {
    const job = jobOf(CI_WORKFLOW, 'callmap-go');
    expect(job).toContain(GO_INSTALL);
    expect(job).toContain(CONFORMANCE);
    expect(job.indexOf(GO_INSTALL)).toBeLessThan(job.indexOf(CONFORMANCE));
  });

  it('fails when the copy of the test globs differs from the file of the core', () => {
    expect(jobOf(CI_WORKFLOW, 'callmap-go')).toContain(
      '- run: cmp packages/scope/test-globs.json callmap-go/internal/scope/test-globs.json',
    );
  });
});

describe('the release of callmap-go', () => {
  it('runs on a callmap-go/v* tag', () => {
    expect(RELEASE_WORKFLOW).toContain("      - 'callmap-go/v*'\n");
    expect(jobOf(RELEASE_WORKFLOW, 'release-callmap-go')).toContain(
      "if: startsWith(github.ref_name, 'callmap-go/v')",
    );
  });

  it('builds the page template from the tagged commit, and fails before the release when the copy differs', () => {
    const job = jobOf(RELEASE_WORKFLOW, 'release-callmap-go');
    const steps = [
      '- run: npm run build --workspace @callmap/cli',
      '- run: cmp packages/cli/dist/page-template.html callmap-go/page-template.html',
      GO_INSTALL,
      CONFORMANCE,
      '- run: gh release create "$GITHUB_REF_NAME" --verify-tag --generate-notes',
    ];
    const positions = steps.map((step) => job.indexOf(step));
    for (const [index, step] of steps.entries()) expect(positions[index], step).toBeGreaterThan(-1);
    expect(positions).toEqual(positions.toSorted((first, second) => first - second));
  });

  it('leaves the other releases to their own tags', () => {
    for (const job of ['publish', 'publish-callmap-ts']) {
      expect(jobOf(RELEASE_WORKFLOW, job)).not.toContain("'callmap-go/v'");
      expect(jobOf(RELEASE_WORKFLOW, job)).not.toContain('go install');
    }
  });
});
