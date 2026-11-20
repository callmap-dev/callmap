import { spawnSync } from 'node:child_process';
import type { SpawnSyncReturns } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { reviewInputOfPage } from '@callmap/review-input';
import { describe, expect, it } from 'vitest';
import { commitFile, featureBranchRepo, git, goRepo, rubyRepo } from '../../test/fixture-repo.ts';
import { tempDir } from '../../test/temp-dir.ts';

const CALLMAP_TS = fileURLToPath(new URL('../src/cli.ts', import.meta.url));

const GO_LINE =
  'callmap-ts read only the TypeScript files. Run callmap-go review for the Go files.';
const RUBY_LINE =
  'callmap-ts read only the TypeScript files. Run callmap-rb review for the Ruby files.';

interface Run {
  readonly finished: SpawnSyncReturns<string>;
  readonly out: string;
  readonly cacheHome: string;
}

const runCallmapTs = (repo: string, ...flags: readonly string[]): Run => {
  const out = join(tempDir('callmap-ts-out-'), 'review.html');
  const cacheHome = tempDir('callmap-ts-cache-');
  const finished = spawnSync(
    process.execPath,
    [CALLMAP_TS, 'review', repo, '--no-open', '--out', out, ...flags],
    { encoding: 'utf8', env: { ...process.env, XDG_CACHE_HOME: cacheHome } },
  );
  return { finished, out, cacheHome };
};

const languagesOf = (out: string): readonly string[] => {
  const input = reviewInputOfPage(readFileSync(out, 'utf8'));
  return [...input.base, ...input.branch].map(({ language }) => language);
};

describe('callmap-ts review', () => {
  it('writes the reader page of a TypeScript repo and prints its path', () => {
    const { finished, out } = runCallmapTs(featureBranchRepo());
    expect(finished.stderr).toBe('');
    expect(finished.status).toBe(0);
    expect(finished.stdout).toBe(`${out}\n`);
    expect(languagesOf(out)).toEqual(['typescript', 'typescript']);
  });

  it('reads only the TypeScript files of a repo with Go, and prints one line that names callmap-go', () => {
    const { finished, out } = runCallmapTs(goRepo());
    expect(finished.status).toBe(0);
    expect(finished.stderr).toBe(`${GO_LINE}\n`);
    expect(languagesOf(out)).toEqual(['typescript', 'typescript']);
  });

  it('reads only the TypeScript files of a repo with Ruby, and prints one line that names callmap-rb', () => {
    const { finished, out } = runCallmapTs(rubyRepo());
    expect(finished.status).toBe(0);
    expect(finished.stderr).toBe(`${RUBY_LINE}\n`);
    expect(languagesOf(out)).toEqual(['typescript', 'typescript']);
  });

  it('prints no line for the files of another language that the scope leaves out', () => {
    const { finished } = runCallmapTs(goRepo(), '--scope', '!**/*.go');
    expect(finished.status).toBe(0);
    expect(finished.stderr).toBe('');
  });

  it('keeps its base cache in its own folder of the cache home', () => {
    const { finished, cacheHome } = runCallmapTs(
      featureBranchRepo(),
      '--tsconfig',
      'tsconfig.json',
    );
    expect(finished.status).toBe(0);
    expect(readdirSync(cacheHome)).toEqual(['callmap-ts']);
    expect(
      readdirSync(join(cacheHome, 'callmap-ts'), { recursive: true, encoding: 'utf8' }).filter(
        (entry) => entry.endsWith('.json'),
      ),
    ).toHaveLength(1);
  });

  it('names callmap-ts in its usage line and in its messages, and takes --tsconfig', () => {
    const usage = spawnSync(process.execPath, [CALLMAP_TS, 'help'], { encoding: 'utf8' });
    expect(usage.status).toBe(1);
    expect(usage.stderr).toMatch(/^usage: callmap-ts review \[<repo>\] .*\[--tsconfig <file>\]/);
    const unknown = spawnSync(process.execPath, [CALLMAP_TS, 'review', '--nope'], {
      encoding: 'utf8',
    });
    expect(unknown.stderr).toBe('--nope is not a flag callmap-ts review knows\n');
  });
});

const importsOf = (...packages: readonly string[]): string =>
  `${packages.map((name) => `import '${name}';\n`).join('')}export const total = (): number => 1;\n`;

const repoThatImports = (base: readonly string[], branch: readonly string[]): string => {
  const repo = tempDir('callmap-review-');
  git(repo, 'init', '--quiet', '--initial-branch', 'main');
  commitFile(repo, 'total.ts', importsOf(...base));
  git(repo, 'checkout', '--quiet', '-b', 'feature');
  commitFile(repo, 'total.ts', importsOf(...branch, 'left-pad'));
  return repo;
};

const install = (repo: string, name: string): void => {
  mkdirSync(join(repo, 'node_modules', name), { recursive: true });
  writeFileSync(join(repo, 'node_modules', name, 'package.json'), JSON.stringify({ name }));
  writeFileSync(join(repo, 'node_modules', name, 'index.d.ts'), 'export {};\n');
};

describe('the warning for the missing packages', () => {
  it('prints one line with the count, the first 5 names and what to do, and exits with 0', () => {
    const repo = repoThatImports(
      [],
      ['zod', 'react', '@shop/ui/button', 'date-fns', 'ky', 'axios'],
    );
    const { finished, out } = runCallmapTs(repo);
    expect(finished.stderr).toBe(
      'The TypeScript imports of the branch name 7 packages that find no code: @shop/ui, axios, date-fns, ky, left-pad and 2 more. Each call into them is an open end, so install the dependencies and run the review again.\n',
    );
    expect(finished.status).toBe(0);
    expect(finished.stdout).toBe(`${out}\n`);
  });

  it('names the one missing package of the branch, and not the ones of the base', () => {
    const repo = repoThatImports(['zod'], []);
    expect(runCallmapTs(repo).finished.stderr).toBe(
      'The TypeScript imports of the branch name 1 package that finds no code: left-pad. Each call into it is an open end, so install the dependencies and run the review again.\n',
    );
  });

  it('prints no warning when each package is installed', () => {
    const repo = repoThatImports(['zod'], ['zod']);
    install(repo, 'zod');
    install(repo, 'left-pad');
    const { finished } = runCallmapTs(repo);
    expect(finished.stderr).toBe('');
    expect(finished.status).toBe(0);
  });
});

const WORKSPACE: Readonly<Record<string, string>> = {
  'packages/money/package.json': JSON.stringify({
    name: '@shop/money',
    type: 'module',
    exports: { '.': { types: './dist/index.d.ts', default: './dist/index.js' } },
  }),
  'packages/money/tsconfig.json': JSON.stringify({
    compilerOptions: { rootDir: 'src', outDir: 'dist' },
  }),
  'packages/money/src/index.ts':
    'export const rounded = (amount: number): number => Math.round(amount);\n',
  'apps/web/src/tax.ts':
    "import { rounded } from '@shop/money';\n\nexport const taxed = (cents: number) => rounded(cents);\n",
};

const commitAll = (repo: string, files: Readonly<Record<string, string>>): void => {
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(repo, path)), { recursive: true });
    writeFileSync(join(repo, path), text);
  }
  git(repo, 'add', '--all');
  git(repo, 'commit', '--quiet', '--message', 'write the workspace');
};

describe('a workspace package on the base', () => {
  it('resolves to its source through the node_modules that the base links to the checkout', () => {
    const repo = tempDir('callmap-review-');
    git(repo, 'init', '--quiet', '--initial-branch', 'main');
    commitAll(repo, WORKSPACE);
    git(repo, 'checkout', '--quiet', '-b', 'feature');
    commitAll(repo, { 'apps/web/src/total.ts': 'export const total = (): number => 1;\n' });
    mkdirSync(join(repo, 'node_modules/@shop'), { recursive: true });
    symlinkSync('../../packages/money', join(repo, 'node_modules/@shop/money'));
    const { finished, out } = runCallmapTs(repo);
    expect(finished.stderr).toBe('');
    const input = reviewInputOfPage(readFileSync(out, 'utf8'));
    const callIntoMoney = {
      caller: 'apps/web/src/tax.ts#taxed',
      callee: 'packages/money/src/index.ts#rounded',
      line: 3,
    };
    expect(input.base.map(({ calls, missingPackages }) => ({ calls, missingPackages }))).toEqual([
      { calls: [callIntoMoney], missingPackages: [] },
    ]);
    expect(input.branch.map(({ calls }) => calls)).toEqual([[callIntoMoney]]);
  });
});
