import { execFileSync, spawnSync } from 'node:child_process';
import type { SpawnSyncReturns } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { reviewInputOfPage } from '@callmap/review-input';
import type { ReviewInput } from '@callmap/review-input';
import { beforeAll, describe, expect, it } from 'vitest';
import { featureBranchRepo, goRepo, rubyRepo } from '../../test/fixture-repo.ts';
import { tempDir } from '../../test/temp-dir.ts';

const MODULE = fileURLToPath(new URL('..', import.meta.url));
const SUITE = fileURLToPath(new URL('../../packages/conformance/src/cli.ts', import.meta.url));

const TYPESCRIPT_LINE =
  'callmap-go read only the Go files. Run callmap-ts review for the TypeScript files.';
const RUBY_LINE = 'callmap-go read only the Go files. Run callmap-rb review for the Ruby files.';

const OFFLINE_GO = {
  GOTOOLCHAIN: 'local',
  GOPROXY: 'off',
  GOFLAGS: '',
  GOWORK: 'off',
};

let callmapGo = '';
let goModCache = '';
let goCache = '';

const goVersion = (): string =>
  execFileSync('go', ['env', 'GOVERSION'], {
    encoding: 'utf8',
    env: { ...process.env, GOTOOLCHAIN: 'local' },
  })
    .trim()
    .replace(/^go/, '');

beforeAll(() => {
  const bin = tempDir('callmap-go-bin-');
  goModCache = tempDir('callmap-go-modcache-');
  goCache = tempDir('callmap-go-gocache-');
  execFileSync('go', ['install', '.'], {
    cwd: MODULE,
    encoding: 'utf8',
    env: { ...process.env, ...OFFLINE_GO, GOBIN: bin, GOMODCACHE: goModCache },
  });
  callmapGo = join(bin, 'callmap-go');
});

interface Run {
  readonly finished: SpawnSyncReturns<string>;
  readonly out: string;
  readonly cacheHome: string;
  readonly temp: string;
}

const runCallmapGo = (
  repo: string,
  { cacheHome = tempDir('callmap-go-cache-'), flags = [] as readonly string[] } = {},
): Run => {
  const out = join(tempDir('callmap-go-out-'), 'review.html');
  const temp = tempDir('callmap-go-temp-');
  const finished = spawnSync(callmapGo, ['review', repo, '--no-open', '--out', out, ...flags], {
    encoding: 'utf8',
    env: {
      ...process.env,
      XDG_CACHE_HOME: cacheHome,
      TMPDIR: temp,
      GOPROXY: 'https://proxy.invalid',
      GOFLAGS: '-mod=mod',
      GOMODCACHE: goModCache,
      GOCACHE: goCache,
    },
  });
  return { finished, out, cacheHome, temp };
};

const reviewInputOf = (out: string): ReviewInput => reviewInputOfPage(readFileSync(out, 'utf8'));

const cacheEntriesIn = (cacheHome: string): readonly string[] =>
  readdirSync(cacheHome, { recursive: true, encoding: 'utf8' }).filter((entry) =>
    entry.endsWith('.json'),
  );

describe('callmap-go review, from a go install of the checkout', () => {
  it('writes the reader page of a Go repo with no network, and prints its path', () => {
    const { finished, out } = runCallmapGo(goRepo());
    expect(finished.status, finished.stderr).toBe(0);
    expect(finished.stdout).toBe(`${out}\n`);
    const input = reviewInputOf(out);
    expect([...input.base, ...input.branch].map(({ language }) => language)).toEqual(['go', 'go']);
    expect(input.branch[0]?.calls).toEqual(
      expect.arrayContaining([
        { caller: 'checkout/checkout.go#Total', callee: 'money/money.go#Round', line: 10 },
      ]),
    );
  });

  it('names the Go version that built callmap-go as the checker', () => {
    const { out } = runCallmapGo(goRepo());
    const input = reviewInputOf(out);
    expect([...input.base, ...input.branch].map(({ checker }) => checker)).toEqual([
      { name: 'Go', version: goVersion() },
      { name: 'Go', version: goVersion() },
    ]);
  });

  it('reads the Go files in its own process, so it builds no extractor and leaves nothing in the temp folder', () => {
    const { finished, cacheHome, temp } = runCallmapGo(goRepo());
    expect(finished.status, finished.stderr).toBe(0);
    expect(readdirSync(temp)).toEqual([]);
    expect(readdirSync(cacheHome)).toEqual(['callmap-go']);
    expect(cacheEntriesIn(cacheHome)).toHaveLength(1);
  });

  it('reads only the Go files of a repo with TypeScript, and prints one line that names callmap-ts', () => {
    const { finished } = runCallmapGo(goRepo());
    expect(finished.stderr).toBe(`${TYPESCRIPT_LINE}\n`);
  });

  it('reads no file of a repo with no Go, and prints one line for each other language', () => {
    const typescript = runCallmapGo(featureBranchRepo());
    expect(typescript.finished.status, typescript.finished.stderr).toBe(0);
    expect(typescript.finished.stderr).toBe(`${TYPESCRIPT_LINE}\n`);
    expect(reviewInputOf(typescript.out)).toMatchObject({ base: [], branch: [] });
    const ruby = runCallmapGo(rubyRepo());
    expect(ruby.finished.stderr).toBe(`${TYPESCRIPT_LINE}\n${RUBY_LINE}\n`);
  });

  it('prints no line for the files of another language that the scope leaves out', () => {
    const { finished } = runCallmapGo(goRepo(), { flags: ['--scope', '!**/*.ts'] });
    expect(finished.status, finished.stderr).toBe(0);
    expect(finished.stderr).toBe('');
  });

  it('reads the base from its cache on a second review of the same base', () => {
    const repo = goRepo();
    const cacheHome = tempDir('callmap-go-cache-');
    const first = runCallmapGo(repo, { cacheHome });
    const [entry = ''] = cacheEntriesIn(cacheHome);
    writeFileSync(
      join(cacheHome, entry),
      readFileSync(join(cacheHome, entry), 'utf8').replace(
        '"name":"Total"',
        '"name":"FromTheCache"',
      ),
    );
    const second = runCallmapGo(repo, { cacheHome });
    expect(second.finished.status, second.finished.stderr).toBe(0);
    expect(reviewInputOf(first.out).base[0]?.functions[0]?.name).not.toBe('FromTheCache');
    expect(reviewInputOf(second.out).base[0]?.functions[0]?.name).toBe('FromTheCache');
    const third = runCallmapGo(repo, { cacheHome, flags: ['--no-cache'] });
    expect(reviewInputOf(third.out).base[0]?.functions[0]?.name).not.toBe('FromTheCache');
  });

  it('names callmap-go in its usage line and in its messages, and takes no --tsconfig', () => {
    const usage = spawnSync(callmapGo, ['help'], { encoding: 'utf8' });
    expect(usage.status).toBe(1);
    expect(usage.stderr).toBe(
      'usage: callmap-go review [<repo>] [--base <commit>] [--scope <glob>]... [--out <file>] [--no-open] [--no-cache] [--editor vscode|jetbrains] [--tests]\n',
    );
    const tsconfig = spawnSync(callmapGo, ['review', '--tsconfig', 'tsconfig.json'], {
      encoding: 'utf8',
    });
    expect(tsconfig.status).toBe(1);
    expect(tsconfig.stderr).toBe('--tsconfig is not a flag callmap-go review knows\n');
  });

  it('passes every Go fixture repo of the conformance suite', () => {
    const finished = spawnSync(process.execPath, [SUITE, '--language', 'go', callmapGo], {
      encoding: 'utf8',
    });
    expect(finished.stderr).toBe('');
    expect(finished.stdout).toBe('ok go/review\n');
    expect(finished.status).toBe(0);
  });
});
