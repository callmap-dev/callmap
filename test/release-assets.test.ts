import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { tempDir } from './temp-dir.ts';

const REPO_ROOT = join(import.meta.dirname, '..');
const RELEASE_ASSETS = join(REPO_ROOT, 'scripts', 'release-assets.ts');
const REPLAYED_REVIEW = join(REPO_ROOT, 'packages', 'conformance', 'test', 'replayed-review.ts');
const FIXTURE_REPOS = join(REPO_ROOT, 'packages', 'conformance', 'fixture-repos');
const RELEASE_WORKFLOW = join(REPO_ROOT, '.github', 'workflows', 'release.yml');
const GO_EXPECTED = join(FIXTURE_REPOS, 'go', 'review', 'expected-review-input.json');

const passingGoReview = [
  '--language',
  'go',
  process.execPath,
  REPLAYED_REVIEW,
  GO_EXPECTED,
] as const;

const failingReview = [
  process.execPath,
  REPLAYED_REVIEW,
  join(FIXTURE_REPOS, 'ruby', 'review', 'expected-review-input.json'),
] as const;

const filesUnder = (folder: string): readonly (readonly [string, string])[] =>
  readdirSync(folder, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name))
    .map((path) => [relative(folder, path), readFileSync(path, 'utf8')] as const)
    .sort(([first], [second]) => first.localeCompare(second));

const releaseAssets = (...args: readonly string[]) =>
  spawnSync(process.execPath, [RELEASE_ASSETS, ...args], { encoding: 'utf8' });

describe('the release assets', () => {
  it('are one archive with the version in its name and a checksum file', () => {
    const out = tempDir('callmap-release-');
    const finished = releaseAssets('v0.2.0', out, ...passingGoReview);
    expect(finished.stderr).toBe('');
    expect(finished.status).toBe(0);
    expect(readdirSync(out).sort()).toEqual([
      'callmap-core-assets-0.2.0.tar.gz',
      'callmap-core-assets-0.2.0.tar.gz.sha256',
    ]);
    const sha256 = createHash('sha256')
      .update(readFileSync(join(out, 'callmap-core-assets-0.2.0.tar.gz')))
      .digest('hex');
    expect(readFileSync(join(out, 'callmap-core-assets-0.2.0.tar.gz.sha256'), 'utf8')).toBe(
      `${sha256}  callmap-core-assets-0.2.0.tar.gz\n`,
    );
  });

  it('hold the page template, the schemas, the test globs and the fixture repos with their expected review inputs', () => {
    const out = tempDir('callmap-release-');
    expect(releaseAssets('v0.2.0', out, ...passingGoReview).status).toBe(0);
    const unpacked = tempDir('callmap-unpacked-');
    execFileSync('tar', ['-xzf', join(out, 'callmap-core-assets-0.2.0.tar.gz'), '-C', unpacked]);
    const assets = join(unpacked, 'callmap-core-assets-0.2.0');

    expect(readdirSync(unpacked)).toEqual(['callmap-core-assets-0.2.0']);
    expect(readdirSync(assets).sort()).toEqual([
      'fixture-repos',
      'graph-document.schema.json',
      'page-template.html',
      'review-input.schema.json',
      'test-globs.json',
    ]);
    for (const [name, source] of [
      ['page-template.html', 'packages/cli/dist/page-template.html'],
      ['graph-document.schema.json', 'packages/graph-document/graph-document.schema.json'],
      ['review-input.schema.json', 'packages/review-input/review-input.schema.json'],
      ['test-globs.json', 'packages/scope/test-globs.json'],
    ] as const)
      expect(readFileSync(join(assets, name)), name).toEqual(readFileSync(join(REPO_ROOT, source)));
    expect(filesUnder(join(assets, 'fixture-repos'))).toEqual(filesUnder(FIXTURE_REPOS));
    expect(filesUnder(join(assets, 'fixture-repos'))).toContainEqual([
      'go/review/expected-review-input.json',
      readFileSync(GO_EXPECTED, 'utf8'),
    ]);
  });

  it('are not written when the conformance suite fails', () => {
    const out = tempDir('callmap-release-');
    const finished = releaseAssets('v0.2.0', out, '--language', 'go', ...failingReview);
    expect(finished.stdout.split('\n')[0]).toBe('FAIL go/review');
    expect(finished.stderr).toBe('The conformance suite failed, so the release has no assets.\n');
    expect(finished.status).toBe(1);
    expect(readdirSync(out)).toEqual([]);
  });

  it('need a release tag with a version', () => {
    const out = tempDir('callmap-release-');
    const finished = releaseAssets('main', out, ...passingGoReview);
    expect(finished.stderr).toBe('main is not a release tag such as v1.2.0\n');
    expect(finished.status).toBe(1);
    expect(readdirSync(out)).toEqual([]);
  });
});

describe('the release job of a v* tag', () => {
  const workflow = readFileSync(RELEASE_WORKFLOW, 'utf8');
  const stepAt = (run: string): number => {
    const index = workflow.indexOf(`- run: ${run}`);
    expect(index, run).toBeGreaterThan(-1);
    return index;
  };

  it('builds the assets from the tagged commit with the conformance suite of the callmap command', () => {
    const { scripts } = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8')) as {
      readonly scripts: Readonly<Record<string, string>>;
    };
    expect(scripts['release-assets']).toBe('node scripts/release-assets.ts');
    expect(workflow).toContain("tags: ['v*']");
    expect(stepAt('npm ci')).toBeLessThan(
      stepAt(
        'npm run release-assets -- "$GITHUB_REF_NAME" release-assets node packages/cli/src/cli.ts',
      ),
    );
  });

  it('attaches the archive and its checksum file to the GitHub release before it publishes to npm', () => {
    const attach = stepAt(
      'gh release create "$GITHUB_REF_NAME" --verify-tag --generate-notes release-assets/*',
    );
    expect(stepAt('npm run release-assets -- "$GITHUB_REF_NAME"')).toBeLessThan(attach);
    expect(attach).toBeLessThan(stepAt('npm publish'));
    expect(workflow).toContain('contents: write');
  });
});

describe('the README', () => {
  const readme = readFileSync(join(REPO_ROOT, 'README.md'), 'utf8');
  const releaseAssetsSection = readme.slice(
    readme.indexOf('## Release assets'),
    readme.indexOf('\n## ', readme.indexOf('## Release assets') + 1),
  );

  it.each([
    'callmap-core-assets-<version>.tar.gz',
    'callmap-core-assets-<version>.tar.gz.sha256',
    'page-template.html',
    'graph-document.schema.json',
    'review-input.schema.json',
    'test-globs.json',
    'fixture-repos/',
    'sha256sum -c',
    '--fixtures',
  ])('names %s in the section on the release assets', (text) => {
    expect(releaseAssetsSection).toContain(text);
  });
});
