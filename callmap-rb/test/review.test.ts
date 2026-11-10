import { execFileSync, spawnSync } from 'node:child_process';
import type { SpawnSyncReturns } from 'node:child_process';
import {
  cpSync,
  readdirSync,
  readFileSync,
  realpathSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readRuby } from '@callmap/extractor-ruby';
import type { GraphDocument } from '@callmap/graph-document';
import { reviewInputOfPage } from '@callmap/review-input';
import type { ReviewInput } from '@callmap/review-input';
import { effectiveScope } from '@callmap/scope';
import { beforeAll, describe, expect, it } from 'vitest';
import { featureBranchRepo, git, goRepo, rubyRepo } from '../../packages/cli/test/fixture-repo.ts';
import { tempDir } from '../../test/temp-dir.ts';

const GEM_FOLDER = fileURLToPath(new URL('..', import.meta.url));
const SUITE = fileURLToPath(new URL('../../packages/conformance/src/cli.ts', import.meta.url));
const EXTRACTOR_FIXTURE = fileURLToPath(
  new URL('../../packages/extractor-ruby/fixture', import.meta.url),
);

const TYPESCRIPT_LINE =
  'callmap-rb read only the Ruby files. Run callmap-ts review for the TypeScript files.';
const GO_LINE = 'callmap-rb read only the Ruby files. Run callmap-go review for the Go files.';

/**
 * The folders of the extractor fixture whose calls are on `self`, on `super` or on a constant, or
 * call the methods that a macro makes. The other folders also hold calls on a value whose class the
 * type flow proves. callmap-rb does not port the type flow yet.
 */
const PORTED_RULE_FOLDERS: readonly string[] = [
  'rules/abstract/',
  'rules/class-methods/',
  'rules/concern-one-of/',
  'rules/concrete-override/',
  'rules/constant-aliases/',
  'rules/def-in-scope/',
  'rules/define-method/',
  'rules/extend-self/',
  'rules/function-value/',
  'rules/library-constants/',
  'rules/library-include-one-of/',
  'rules/macros/',
  'rules/method-missing/',
  'rules/module-function/',
  'rules/no-implementation/',
  'rules/prepend-extend/',
  'rules/reopened-core/',
  'rules/self-other/',
  'rules/send/',
  'rules/send-missing/',
  'rules/send-splat/',
  'rules/several-modules/',
  'rules/singleton-owner/',
  'rules/singleton-prepend/',
  'rules/super-in-module/',
  'rules/super-several-includers/',
  'rules/unparsed/',
  'rules/untyped/',
  'rules/zeitwerk-aliases/',
  'billing/',
  'gems/',
  'tools/',
];

let gemHome = '';
let gemFile = '';
let noNodePath = '';

const whichOf = (command: string): string =>
  realpathSync(execFileSync('which', [command], { encoding: 'utf8' }).trim());

beforeAll(() => {
  const built = tempDir('callmap-rb-gem-');
  execFileSync('gem', ['build', 'callmap-rb.gemspec', '--output', join(built, 'callmap-rb.gem')], {
    cwd: GEM_FOLDER,
    encoding: 'utf8',
  });
  gemFile = join(built, 'callmap-rb.gem');
  gemHome = tempDir('callmap-rb-gem-home-');
  execFileSync(
    'gem',
    [
      'install',
      '--local',
      '--no-document',
      '--install-dir',
      gemHome,
      '--bindir',
      join(gemHome, 'bin'),
      gemFile,
    ],
    { encoding: 'utf8' },
  );
  const tools = tempDir('callmap-rb-tools-');
  for (const command of ['ruby', 'git']) symlinkSync(whichOf(command), join(tools, command));
  noNodePath = [join(gemHome, 'bin'), tools].join(':');
});

interface Run {
  readonly finished: SpawnSyncReturns<string>;
  readonly out: string;
  readonly cacheHome: string;
}

const runCallmapRb = (
  repo: string,
  { cacheHome = tempDir('callmap-rb-cache-'), flags = [] as readonly string[] } = {},
): Run => {
  const out = join(tempDir('callmap-rb-out-'), 'review.html');
  const finished = spawnSync(
    join(gemHome, 'bin', 'callmap-rb'),
    ['review', repo, '--no-open', '--out', out, ...flags],
    {
      encoding: 'utf8',
      env: {
        HOME: process.env['HOME'],
        PATH: noNodePath,
        GEM_HOME: gemHome,
        GEM_PATH: gemHome,
        XDG_CACHE_HOME: cacheHome,
        TMPDIR: tempDir('callmap-rb-temp-'),
      },
    },
  );
  return { finished, out, cacheHome };
};

const reviewInputOf = (out: string): ReviewInput => reviewInputOfPage(readFileSync(out, 'utf8'));

const cacheEntriesIn = (cacheHome: string): readonly string[] =>
  readdirSync(cacheHome, { recursive: true, encoding: 'utf8' }).filter((entry) =>
    entry.endsWith('.json'),
  );

const extractorFixtureRepo = (): string => {
  const repo = tempDir('callmap-rb-extractor-fixture-');
  git(repo, 'init', '--quiet', '--initial-branch', 'main');
  git(repo, 'commit', '--quiet', '--allow-empty', '--message', 'base');
  git(repo, 'checkout', '--quiet', '-b', 'feature');
  cpSync(EXTRACTOR_FIXTURE, repo, { recursive: true });
  git(repo, 'add', '--all');
  git(repo, 'commit', '--quiet', '--message', 'branch');
  return repo;
};

const ofPortedRuleFolders = <Site extends { readonly caller: string }>(
  sites: readonly Site[],
): readonly Site[] =>
  sites.filter(({ caller }) => PORTED_RULE_FOLDERS.some((folder) => caller.startsWith(folder)));

const withoutChecker = ({ checker: _checker, ...document }: GraphDocument) => document;

describe('callmap-rb review, from a gem install with no Node on the PATH', () => {
  it('writes the reader page of a Rails repo, and prints its path', () => {
    const { finished, out } = runCallmapRb(rubyRepo());
    expect(finished.status, finished.stderr).toBe(0);
    expect(finished.stdout).toBe(`${out}\n`);
    const input = reviewInputOf(out);
    expect([...input.base, ...input.branch].map(({ language }) => language)).toEqual([
      'ruby',
      'ruby',
    ]);
    expect(input.branch[0]?.checker.name).toBe('Callmap Ruby rules');
  });

  it('gives the graph documents of the extractor of today for the direct calls, the macros, the one-of groups and the open-end reasons on its fixtures', () => {
    const repo = extractorFixtureRepo();
    const { finished, out } = runCallmapRb(repo);
    expect(finished.status, finished.stderr).toBe(0);
    const [branch] = reviewInputOf(out).branch;
    const today = readRuby({ repo, scope: effectiveScope([], false) }).document;
    if (branch === undefined) throw new Error('the review input holds no branch document');
    const { calls, openEnds, ...rest } = withoutChecker(branch);
    const { calls: todayCalls, openEnds: todayOpenEnds, ...todayRest } = withoutChecker(today);
    expect(rest).toEqual(todayRest);
    expect(ofPortedRuleFolders(calls)).toEqual(ofPortedRuleFolders(todayCalls));
    expect(ofPortedRuleFolders(openEnds)).toEqual(ofPortedRuleFolders(todayOpenEnds));
    expect(ofPortedRuleFolders(todayCalls).length).toBeGreaterThan(30);
  });

  it('prints one line for each file that Ripper cannot parse', () => {
    const repo = extractorFixtureRepo();
    const { finished } = runCallmapRb(repo, { flags: ['--scope', 'rules/unparsed/**'] });
    expect(finished.status, finished.stderr).toBe(0);
    expect(finished.stderr).toBe(
      'callmap-rb read no functions in rules/unparsed/app/models/broken.rb, because Ripper could not parse it.\n',
    );
  });

  it('reads only the Ruby files of a repo with TypeScript, and prints one line that names callmap-ts', () => {
    const { finished } = runCallmapRb(rubyRepo());
    expect(finished.stderr).toBe(`${TYPESCRIPT_LINE}\n`);
  });

  it('reads no file of a repo with no Ruby, and prints one line for each other language', () => {
    const typescript = runCallmapRb(featureBranchRepo());
    expect(typescript.finished.status, typescript.finished.stderr).toBe(0);
    expect(typescript.finished.stderr).toBe(`${TYPESCRIPT_LINE}\n`);
    expect(reviewInputOf(typescript.out)).toMatchObject({ base: [], branch: [] });
    const go = runCallmapRb(goRepo());
    expect(go.finished.stderr).toBe(`${TYPESCRIPT_LINE}\n${GO_LINE}\n`);
  });

  it('prints no line for the files of another language that the scope leaves out', () => {
    const { finished } = runCallmapRb(rubyRepo(), { flags: ['--scope', '!**/*.ts'] });
    expect(finished.status, finished.stderr).toBe(0);
    expect(finished.stderr).toBe('');
  });

  it('reads the base from its own cache folder on a second review of the same base', () => {
    const repo = rubyRepo();
    const cacheHome = tempDir('callmap-rb-cache-');
    const first = runCallmapRb(repo, { cacheHome });
    expect(readdirSync(cacheHome)).toEqual(['callmap-rb']);
    const [entry = ''] = cacheEntriesIn(cacheHome);
    writeFileSync(
      join(cacheHome, entry),
      readFileSync(join(cacheHome, entry), 'utf8').replace(
        '"name":"Order#total"',
        '"name":"FromTheCache"',
      ),
    );
    const second = runCallmapRb(repo, { cacheHome });
    expect(second.finished.status, second.finished.stderr).toBe(0);
    const names = (run: Run) =>
      reviewInputOf(run.out).base[0]?.functions.map(({ name }) => name) ?? [];
    expect(names(first)).not.toContain('FromTheCache');
    expect(names(second)).toContain('FromTheCache');
    const third = runCallmapRb(repo, { cacheHome, flags: ['--no-cache'] });
    expect(names(third)).not.toContain('FromTheCache');
  });

  it('names callmap-rb in its usage line and in its messages, and takes no --tsconfig', () => {
    const run = (...args: readonly string[]) =>
      spawnSync(join(gemHome, 'bin', 'callmap-rb'), args, {
        encoding: 'utf8',
        env: { PATH: noNodePath, GEM_HOME: gemHome, GEM_PATH: gemHome },
      });
    const usage = run('help');
    expect(usage.status).toBe(1);
    expect(usage.stderr).toBe(
      'usage: callmap-rb review [<repo>] [--base <commit>] [--scope <glob>]... [--out <file>] [--no-open] [--no-cache] [--editor vscode|jetbrains] [--tests]\n',
    );
    const tsconfig = run('review', '--tsconfig', 'tsconfig.json');
    expect(tsconfig.status).toBe(1);
    expect(tsconfig.stderr).toBe('--tsconfig is not a flag callmap-rb review knows\n');
  });

  it('passes every Ruby fixture repo of the conformance suite', () => {
    const finished = spawnSync(
      process.execPath,
      [SUITE, '--language', 'ruby', join(gemHome, 'bin', 'callmap-rb')],
      { encoding: 'utf8', env: { ...process.env, GEM_HOME: gemHome, GEM_PATH: gemHome } },
    );
    expect(finished.stderr).toBe('');
    expect(finished.stdout).toBe('ok ruby/review\n');
    expect(finished.status).toBe(0);
  });
});

describe('the gem callmap-rb', () => {
  it('holds the page template of the build of the same commit', async () => {
    const { pageTemplate } = await import('../../packages/cli/src/page-build.ts');
    const unpacked = tempDir('callmap-rb-unpacked-');
    execFileSync('gem', ['unpack', gemFile, '--target', unpacked], { encoding: 'utf8' });
    const [folder = ''] = readdirSync(unpacked);
    expect(readFileSync(join(unpacked, folder, 'page-template.html'), 'utf8')).toBe(
      await pageTemplate(),
    );
  });

  it('commits no copy of the page template, because git ignores the copy of the gem build', () => {
    const tracked = execFileSync('git', ['ls-files', '--', '.'], {
      cwd: GEM_FOLDER,
      encoding: 'utf8',
    }).split('\n');
    expect(tracked).not.toEqual(
      expect.arrayContaining([expect.stringMatching(/page-template\.html$/)]),
    );
    expect(
      execFileSync('git', ['check-ignore', '--no-index', 'page-template.html'], {
        cwd: GEM_FOLDER,
        encoding: 'utf8',
      }).trim(),
    ).toBe('page-template.html');
  });
});

describe('the CI of callmap-rb', () => {
  it('builds the gem, installs it into a temporary gem home and reviews the fixture repos', () => {
    const ci = readFileSync(
      fileURLToPath(new URL('../../.github/workflows/ci.yml', import.meta.url)),
      'utf8',
    );
    const start = ci.indexOf('\n  callmap-rb:\n');
    expect(start).toBeGreaterThan(-1);
    const job = ci.slice(start);
    const steps = [
      '- run: npm run build --workspace @callmap/cli',
      '- run: gem build callmap-rb.gemspec --output "$RUNNER_TEMP/callmap-rb.gem"',
      '- run: gem install --local --no-document --install-dir "$RUNNER_TEMP/gem-home" --bindir "$RUNNER_TEMP/gem-home/bin" "$RUNNER_TEMP/callmap-rb.gem"',
      '- run: npm run conformance -- --language ruby "$RUNNER_TEMP/gem-home/bin/callmap-rb"',
    ];
    const positions = steps.map((step) => job.indexOf(step));
    for (const [index, step] of steps.entries()) expect(positions[index], step).toBeGreaterThan(-1);
    expect(positions).toEqual(positions.toSorted((first, second) => first - second));
    expect(job).toContain('GEM_HOME: ${{ runner.temp }}/gem-home');
  });
});
