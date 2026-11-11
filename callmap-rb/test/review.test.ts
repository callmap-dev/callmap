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
import type { GraphDocument } from '@callmap/graph-document';
import { reviewInputOfPage } from '@callmap/review-input';
import type { ReviewInput } from '@callmap/review-input';
import { beforeAll, describe, expect, it } from 'vitest';
import { featureBranchRepo, git, goRepo, rubyRepo } from '../../test/fixture-repo.ts';
import { tempDir } from '../../test/temp-dir.ts';

const GEM_FOLDER = fileURLToPath(new URL('..', import.meta.url));
const SUITE = fileURLToPath(new URL('../../packages/conformance/src/cli.ts', import.meta.url));
const EXTRACTOR_FIXTURE = fileURLToPath(new URL('fixture', import.meta.url));
const EXTRACTOR_FIXTURE_DOCUMENT = fileURLToPath(
  new URL('fixture-graph-document.json', import.meta.url),
);

const TYPESCRIPT_LINE =
  'callmap-rb read only the Ruby files. Run callmap-ts review for the TypeScript files.';
const GO_LINE = 'callmap-rb read only the Ruby files. Run callmap-go review for the Go files.';

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

  it('gives the graph document of the Ruby extractor of @callmap/cli on every folder of its fixture, with the type flow', () => {
    const repo = extractorFixtureRepo();
    const { finished, out } = runCallmapRb(repo);
    expect(finished.status, finished.stderr).toBe(0);
    const [branch] = reviewInputOf(out).branch;
    const expected = JSON.parse(readFileSync(EXTRACTOR_FIXTURE_DOCUMENT, 'utf8')) as Omit<
      GraphDocument,
      'checker'
    >;
    if (branch === undefined) throw new Error('the review input holds no branch document');
    expect(withoutChecker(branch)).toEqual(expected);
    const typeFlowCallers = expected.calls.filter(({ caller }) =>
      ['rules/finders/', 'rules/local-variables/', 'rules/shared-instance-variables/'].some(
        (folder) => caller.startsWith(folder),
      ),
    );
    expect(typeFlowCallers.length).toBeGreaterThan(0);
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

  it('prints one message and no backtrace when it cannot write the page', () => {
    const blocker = join(tempDir('callmap-rb-out-'), 'a-file');
    writeFileSync(blocker, '');
    const finished = spawnSync(
      join(gemHome, 'bin', 'callmap-rb'),
      ['review', rubyRepo(), '--no-open', '--out', join(blocker, 'review.html')],
      {
        encoding: 'utf8',
        env: {
          HOME: process.env['HOME'],
          PATH: noNodePath,
          GEM_HOME: gemHome,
          GEM_PATH: gemHome,
          XDG_CACHE_HOME: tempDir('callmap-rb-cache-'),
        },
      },
    );
    expect(finished.status).toBe(1);
    expect(finished.stderr.trimEnd().split('\n')).toHaveLength(1);
    expect(finished.stderr).toContain(blocker);
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
    expect(finished.stdout).toBe('ok ruby/review\nok ruby/type-flow\n');
    expect(finished.status).toBe(0);
  });
});

describe('the gem callmap-rb', () => {
  it('holds the page template of the build of the same commit', async () => {
    const { pageTemplate } = await import('@callmap/reader-page');
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
      '- run: npm run build --workspace @callmap/reader-page',
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

describe('the release of callmap-rb', () => {
  const release = readFileSync(
    fileURLToPath(new URL('../../.github/workflows/release.yml', import.meta.url)),
    'utf8',
  );
  const start = release.indexOf('\n  publish-callmap-rb:\n');
  const end = release.slice(start + 1).search(/\n {2}[a-z-]+:\n/);
  const job = end === -1 ? release.slice(start) : release.slice(start, start + 1 + end);

  it('runs on a callmap-rb/v* tag, and only that job runs on it', () => {
    expect(release).toContain("      - 'callmap-rb/v*'\n");
    expect(start).toBeGreaterThan(-1);
    expect(job).toContain("if: startsWith(github.ref_name, 'callmap-rb/v')");
    expect(release.match(/startsWith\(github\.ref_name, 'callmap-rb\/v'\)/g)).toHaveLength(1);
  });

  it('checks the tag against the version of the gem, and builds, installs and runs the conformance suite before it publishes the gem with a trusted publisher', () => {
    const steps = [
      `- run: test "$GITHUB_REF_NAME" = "callmap-rb/v$(ruby -r ./callmap-rb/lib/callmap_rb/version -e 'print CallmapRb::VERSION')"`,
      '- run: npm run build --workspace @callmap/reader-page',
      '- run: gem build callmap-rb.gemspec --output "$RUNNER_TEMP/callmap-rb.gem"',
      '- run: gem install --local --no-document --install-dir "$RUNNER_TEMP/gem-home" --bindir "$RUNNER_TEMP/gem-home/bin" "$RUNNER_TEMP/callmap-rb.gem"',
      '- run: npm run conformance -- --language ruby "$RUNNER_TEMP/gem-home/bin/callmap-rb"',
      '- run: gh release create "$GITHUB_REF_NAME" --verify-tag --generate-notes',
      '- uses: rubygems/configure-rubygems-credentials@v1.0.0',
      '- run: gem push "$RUNNER_TEMP/callmap-rb.gem"',
    ];
    const positions = steps.map((step) => job.indexOf(step));
    for (const [index, step] of steps.entries()) expect(positions[index], step).toBeGreaterThan(-1);
    expect(positions).toEqual(positions.toSorted((first, second) => first - second));
    expect(job).not.toContain('GEM_HOST_API_KEY');
    expect(release).toContain('id-token: write');
  });
});
