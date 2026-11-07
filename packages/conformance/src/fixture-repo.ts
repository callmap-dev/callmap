import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const GIT_ENV = {
  ...process.env,
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_AUTHOR_NAME: 'Fixture',
  GIT_AUTHOR_EMAIL: 'fixture@example.com',
  GIT_AUTHOR_DATE: '2026-01-01T00:00:00Z',
  GIT_COMMITTER_NAME: 'Fixture',
  GIT_COMMITTER_EMAIL: 'fixture@example.com',
  GIT_COMMITTER_DATE: '2026-01-01T00:00:00Z',
};

const git = (repo: string, ...args: readonly string[]): string =>
  execFileSync('git', args, { cwd: repo, encoding: 'utf8', env: GIT_ENV }).trim();

const trackedFilesOf = (repo: string): readonly string[] =>
  git(repo, 'ls-files')
    .split('\n')
    .filter((line) => line !== '');

const commitTree = (repo: string, tree: string, message: string): void => {
  for (const path of trackedFilesOf(repo)) rmSync(join(repo, path));
  cpSync(tree, repo, { recursive: true });
  git(repo, 'add', '--all');
  git(repo, 'commit', '--quiet', '--message', message);
};

const BASE_BRANCH = 'main';
const FEATURE_BRANCH = 'feature';

export const fixtureRepoAt = (repo: string, fixture: string): void => {
  mkdirSync(repo, { recursive: true });
  git(repo, 'init', '--quiet', '--initial-branch', BASE_BRANCH);
  commitTree(repo, join(fixture, 'base'), 'base');
  git(repo, 'checkout', '--quiet', '-b', FEATURE_BRANCH);
  commitTree(repo, join(fixture, 'branch'), 'branch');
};
