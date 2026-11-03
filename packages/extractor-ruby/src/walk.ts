/**
 * The Ruby extractor's walk of a repo's filesystem. The core never reads one (ADR-0009); an
 * extractor is the process that turns a directory on disk into data.
 */

import { spawnSync } from 'node:child_process';
import type { Dirent } from 'node:fs';
import { readdirSync } from 'node:fs';
import { isSkippedDirectory } from '@callmap/scope';

export interface RubyTree {
  readonly files: readonly string[];
  /** Each `.gemspec`, whose folder is a load unit of its own. */
  readonly gemspecs: readonly string[];
}

/**
 * The untracked paths that git ignores, by repo-relative path. A repo that is not a git repo
 * ignores nothing. An ignored folder can hold the data of a container that another user owns, so
 * the walk must not open it. The TypeScript and Go extractors have their own copies of this reader.
 */
const ignoredPathsOf = (repo: string): ReadonlySet<string> => {
  const listed = spawnSync(
    'git',
    ['ls-files', '--others', '--ignored', '--exclude-standard', '--directory', '-z'],
    { cwd: repo, encoding: 'utf8', maxBuffer: Number.POSITIVE_INFINITY },
  );
  if (listed.error !== undefined || listed.status !== 0) return new Set();
  return new Set(
    listed.stdout
      .split('\0')
      .filter((path) => path !== '')
      .map((path) => path.replace(/\/$/, '')),
  );
};

const isUnreadable = (error: unknown): boolean =>
  error instanceof Error && 'code' in error && (error.code === 'EACCES' || error.code === 'EPERM');

/**
 * Every Ruby file of the repo by repo-relative path, in path order, whatever the scope. A class
 * takes its methods from every body in its load unit, so which methods a class has is a question
 * about the whole unit, and the scope only decides which of them the document claims. The walk
 * does not enter a path that git ignores, or a folder below the root that it cannot read. A
 * symbolic link is not followed, so a link out of the repo cannot pull a foreign file in and a link
 * back into it cannot walk forever.
 */
export const rubyTreeOf = (repo: string): RubyTree => {
  const ignored = ignoredPathsOf(repo);
  const found: string[] = [];
  const gemspecs: string[] = [];

  const entriesOf = (directory: string): readonly Dirent[] => {
    try {
      return readdirSync(`${repo}/${directory}`, { withFileTypes: true });
    } catch (error) {
      if (directory !== '' && isUnreadable(error)) return [];
      throw error;
    }
  };

  const walk = (directory: string): void => {
    for (const entry of entriesOf(directory)) {
      if (isSkippedDirectory(entry.name)) continue;
      const path = directory === '' ? entry.name : `${directory}/${entry.name}`;
      if (ignored.has(path)) continue;
      if (entry.isDirectory()) walk(path);
      else if (entry.isFile() && entry.name.endsWith('.rb')) found.push(path);
      else if (entry.isFile() && entry.name.endsWith('.gemspec')) gemspecs.push(path);
    }
  };

  walk('');
  return { files: found.sort(), gemspecs: gemspecs.sort() };
};
