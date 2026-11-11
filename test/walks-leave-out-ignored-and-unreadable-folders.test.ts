import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { sourceFilesInScope } from '../callmap-ts/extractor/walk.ts';
import { rubyFilesOf } from '../callmap-rb/test/ruby-extractor.ts';
import { tempDir } from './temp-dir.ts';

const repoWith = (files: readonly string[]): string => {
  const repo = tempDir('callmap-walk-');
  for (const path of files) {
    mkdirSync(dirname(join(repo, path)), { recursive: true });
    writeFileSync(join(repo, path), '');
  }
  return repo;
};

const git = (repo: string, ...args: readonly string[]): void => {
  execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], {
    cwd: repo,
    stdio: 'ignore',
  });
};

const ignoring = (repo: string, patterns: string): string => {
  writeFileSync(join(repo, '.gitignore'), patterns);
  git(repo, 'init', '-q');
  return repo;
};

const locked: string[] = [];

afterEach(() => {
  for (const folder of locked.splice(0)) chmodSync(folder, 0o755);
});

const WALKS = [
  {
    walk: 'the TypeScript walk',
    extension: 'ts',
    filesOf: (repo: string) => sourceFilesInScope(repo, []),
  },
  { walk: 'the Ruby walk', extension: 'rb', filesOf: rubyFilesOf },
];

describe.each(WALKS)('$walk', ({ extension, filesOf }) => {
  const a = `src/a.${extension}`;
  const b = `var/data/b.${extension}`;

  it('takes the files of every folder when the repo is not a git repo', () => {
    const repo = repoWith([a, b]);
    writeFileSync(join(repo, '.gitignore'), 'var/\n');
    expect(filesOf(repo)).toEqual([a, b]);
  });

  it('does not enter a folder that git ignores', () => {
    const repo = ignoring(repoWith([a, b]), 'var/\n');
    expect(filesOf(repo)).toEqual([a]);
  });

  it('leaves out a file that git ignores', () => {
    const generated = `src/a.gen.${extension}`;
    const repo = ignoring(repoWith([a, generated]), `*.gen.${extension}\n`);
    expect(filesOf(repo)).toEqual([a]);
  });

  it('takes a file that git tracks inside a folder that git ignores', () => {
    const kept = `gen/kept.${extension}`;
    const repo = ignoring(repoWith([kept, `gen/dropped.${extension}`]), 'gen/\n');
    git(repo, 'add', '-f', kept);
    git(repo, 'commit', '-q', '-m', 'kept');
    expect(filesOf(repo)).toEqual([kept]);
  });

  it('does not enter a folder that it cannot read', () => {
    const repo = repoWith([a, b]);
    const folder = join(repo, 'var');
    chmodSync(folder, 0o000);
    locked.push(folder);
    expect(filesOf(repo)).toEqual([a]);
  });
});
