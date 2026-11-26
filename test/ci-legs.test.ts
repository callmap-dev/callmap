import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const CI_WORKFLOW = readFileSync(
  fileURLToPath(new URL('../.github/workflows/ci.yml', import.meta.url)),
  'utf8',
);

const jobOf = (name: string): string => {
  const start = CI_WORKFLOW.indexOf(`\n  ${name}:\n`);
  expect(start, name).toBeGreaterThan(-1);
  const end = CI_WORKFLOW.slice(start + 1).search(/\n {2}[a-z-]+:\n/);
  return end === -1 ? CI_WORKFLOW.slice(start) : CI_WORKFLOW.slice(start, start + 1 + end);
};

const jobNames = (): readonly string[] =>
  [...CI_WORKFLOW.matchAll(/\n {2}([a-z-]+):\n/g)].map((match) => match[1] ?? '');

// The 3 legs of each distribution, as the matrix of its job gives them. The floor is the version of
// the runtime that the manifest of the distribution declares.
const DISTRIBUTIONS = [
  {
    job: 'callmap-ts',
    runtime: 'Node',
    key: 'node',
    current: '22.x',
    floor: '22.18.0',
    tests: '- run: npm test -- callmap-ts/test',
    conformance: '- run: npm run conformance -- --language typescript node callmap-ts/src/cli.ts',
  },
  {
    job: 'callmap-go',
    runtime: 'Go',
    key: 'go',
    current: '1.26.x',
    floor: '1.26.0',
    tests: '- run: npm test -- callmap-go/test',
    conformance: '- run: npm run conformance -- --language go "$(go env GOPATH)/bin/callmap-go"',
  },
  {
    job: 'callmap-rb',
    runtime: 'Ruby',
    key: 'ruby',
    current: "'3.4'",
    floor: "'3.1'",
    tests: '- run: npm test -- callmap-rb/test',
    conformance:
      '- run: npm run conformance -- --language ruby "$RUNNER_TEMP/gem-home/bin/callmap-rb"',
  },
] as const;

describe('the CI of each distribution', () => {
  for (const distribution of DISTRIBUTIONS) {
    describe(distribution.job, () => {
      const job = (): string => jobOf(distribution.job);

      it('runs on Linux and on macOS with the current runtime, and on Linux with the runtime floor', () => {
        expect(job()).toContain('    runs-on: ${{ matrix.os }}\n');
        expect(job()).toContain('      fail-fast: false\n');
        for (const leg of [
          `          - { os: ubuntu-latest, platform: Linux, ${distribution.key}: ${distribution.current} }\n`,
          `          - { os: macos-latest, platform: macOS, ${distribution.key}: ${distribution.current} }\n`,
          `          - { os: ubuntu-latest, platform: Linux, ${distribution.key}: ${distribution.floor} }\n`,
        ])
          expect(job(), leg).toContain(leg);
        expect(job().match(/\n {10}- \{ os: /g)).toHaveLength(3);
      });

      it('names each leg with the distribution, the platform and the runtime version', () => {
        expect(job()).toContain(
          `    name: ${distribution.job} on \${{ matrix.platform }}, ${distribution.runtime} \${{ matrix.${distribution.key} }}\n`,
        );
      });

      it('runs the tests of the distribution, and then its conformance suite', () => {
        const tests = job().indexOf(distribution.tests);
        const conformance = job().indexOf(distribution.conformance);
        expect(tests, distribution.tests).toBeGreaterThan(-1);
        expect(conformance, distribution.conformance).toBeGreaterThan(tests);
        expect(job()).not.toContain('npm run lint');
      });
    });
  }
});

describe('the lint and the tests of the core and of the page', () => {
  it('run on Linux only', () => {
    const job = jobOf('lint-and-test');
    expect(job).toContain('    runs-on: ubuntu-latest\n');
    expect(job).toContain('- run: npm run lint');
    expect(job).not.toContain('matrix');
    const others = jobNames().filter((name) => name !== 'lint-and-test');
    for (const name of others) expect(jobOf(name), name).not.toContain('npm run lint');
  });

  it('leave the tests of the distributions to the jobs of the distributions', () => {
    const job = jobOf('lint-and-test');
    for (const distribution of DISTRIBUTIONS)
      expect(job).toContain(`--exclude '${distribution.job}/**'`);
  });
});
