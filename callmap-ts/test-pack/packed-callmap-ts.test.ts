import { execFileSync, spawnSync } from 'node:child_process';
import type { SpawnSyncReturns } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pageOfTemplate, reviewInputOfPage } from '@callmap/review-input';
import { beforeAll, describe, expect, it } from 'vitest';
import { featureBranchRepo, goRepo, rubyRepo } from '../../packages/cli/test/fixture-repo.ts';
import { reviewInputOfFile } from '../../packages/cli/test/review-input-file.ts';
import { readerPageOf } from '../../packages/cli/src/reader-page.ts';
import { tempDir } from '../../test/temp-dir.ts';

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));

interface Tarball {
  readonly path: string;
  readonly files: readonly string[];
}

interface PackReport {
  readonly filename: string;
  readonly files: readonly { readonly path: string }[];
}

interface Manifest {
  readonly dependencies?: Readonly<Record<string, string>>;
}

const npm = (cwd: string, ...args: readonly string[]): string =>
  execFileSync('npm', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });

const packedCallmapTs = (): Tarball => {
  const folder = tempDir('callmap-ts-pack-');
  const [report] = JSON.parse(
    npm(REPO_ROOT, 'pack', '--json', '--workspace', 'callmap-ts', '--pack-destination', folder),
  ) as readonly PackReport[];
  if (report === undefined) throw new Error('npm pack wrote no tarball');
  return { path: join(folder, report.filename), files: report.files.map(({ path }) => path) };
};

const manifestAt = (path: string): Manifest => JSON.parse(readFileSync(path, 'utf8')) as Manifest;

const PACKAGE_FILE = /^(package\.json|README\.md|LICENSE|dist\/[^/]+\.(js|html|sha256|txt))$/;

let tarball: Tarball;

const installedRepo = (repo = featureBranchRepo()): string => {
  npm(repo, 'install', '--prefix', repo, '--no-save', '--no-audit', '--no-fund', tarball.path);
  return repo;
};

const installedFile = (repo: string, file: string): string =>
  readFileSync(join(repo, 'node_modules', 'callmap-ts', file), 'utf8');

// The release job points NPM_CONFIG_USERCONFIG at the .npmrc of setup-node, and npm warns
// about its always-auth key on stderr. An empty user config keeps that warning out of stderr.
const emptyUserConfig = (): string => {
  const npmrc = join(tempDir('callmap-ts-npmrc-'), '.npmrc');
  writeFileSync(npmrc, '');
  return npmrc;
};

const npxCallmapTs = (repo: string, out: string): SpawnSyncReturns<string> =>
  spawnSync(
    'npx',
    ['--yes', '--package', tarball.path, '--', 'callmap-ts', 'review', '--no-open', '--out', out],
    {
      cwd: repo,
      encoding: 'utf8',
      env: {
        ...process.env,
        XDG_CACHE_HOME: tempDir('callmap-ts-cache-'),
        NPM_CONFIG_USERCONFIG: emptyUserConfig(),
      },
    },
  );

const branchFunctionsOf = (out: string): readonly string[] =>
  reviewInputOfPage(readFileSync(out, 'utf8')).branch.flatMap(({ functions }) =>
    functions.map(({ id }) => id),
  );

beforeAll(() => {
  tarball = packedCallmapTs();
});

describe('the packed callmap-ts', () => {
  it('holds only the manifest, the README, the LICENSE and the built files', () => {
    expect(tarball.files.filter((path) => !PACKAGE_FILE.test(path))).toEqual([]);
    expect(tarball.files).toEqual(
      expect.arrayContaining([
        'package.json',
        'README.md',
        'LICENSE',
        'dist/cli.js',
        'dist/extract-typescript.js',
        'dist/extractor-source.sha256',
        'dist/page-template.html',
        'dist/THIRD-PARTY-NOTICES.txt',
      ]),
    );
  });

  it('holds no Go source and no Ruby script', () => {
    const repo = installedRepo();
    expect(tarball.files.filter((path) => /\.(go|rb)$|go\.(mod|sum)$/.test(path))).toEqual([]);
    for (const file of tarball.files.filter((path) => path.endsWith('.js')))
      expect(installedFile(repo, file), file).not.toMatch(/extract-go|callmap-extract-go|read\.rb/);
  });

  it('pins typescript at the version of @callmap/cli, and bundles everything else', () => {
    const cliPin = manifestAt(join(REPO_ROOT, 'packages', 'cli', 'package.json')).dependencies;
    const repo = installedRepo();
    expect(
      manifestAt(join(repo, 'node_modules', 'callmap-ts', 'package.json')).dependencies,
    ).toEqual({ typescript: cliPin?.['typescript'] });
    const notices = installedFile(repo, 'dist/THIRD-PARTY-NOTICES.txt');
    expect(notices).toMatch(/^elkjs \d+\.\d+\.\d+\nLicense: EPL-2\.0 OR GPL-3\.0-or-later\n/m);
    expect(notices).not.toMatch(/^(@callmap\/|typescript |golang\.org)/m);
  });

  it('holds the page template of the same commit, so its page is byte-identical to the page from the clone', async () => {
    const template = installedFile(installedRepo(), 'dist/page-template.html');
    const input = await reviewInputOfFile('typescript/review');
    expect(pageOfTemplate(template, input)).toBe(await readerPageOf(input));
  });

  it('runs with npx in a TypeScript repo with no clone of Callmap, and writes the reader page of the review', () => {
    const repo = featureBranchRepo();
    const out = join(tempDir('callmap-ts-out-'), 'review.html');
    const finished = npxCallmapTs(repo, out);
    expect(finished.stderr).toBe('');
    expect(finished.status).toBe(0);
    expect(finished.stdout.trim()).toBe(out);
    expect(branchFunctionsOf(out)).toEqual(
      expect.arrayContaining(['src/alerts.ts#relay', 'src/alerts.ts#alert']),
    );
  });

  it('reads only the TypeScript files of a repo with Go and Ruby, and prints one line for each other language', () => {
    for (const [repo, line] of [
      [goRepo(), 'Run callmap-go review for the Go files.'],
      [rubyRepo(), 'Run callmap-rb review for the Ruby files.'],
    ] as const) {
      const out = join(tempDir('callmap-ts-out-'), 'review.html');
      const finished = npxCallmapTs(repo, out);
      expect(finished.status).toBe(0);
      expect(finished.stderr).toBe(`callmap-ts read only the TypeScript files. ${line}\n`);
      expect(
        reviewInputOfPage(readFileSync(out, 'utf8')).branch.map(({ language }) => language),
      ).toEqual(['typescript']);
    }
  });
});
