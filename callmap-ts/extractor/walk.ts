/**
 * The one place in Callmap that reads a repo's filesystem. The core never does (ADR-0009); an
 * extractor is the process that turns a directory on disk into data.
 */

import { spawnSync } from 'node:child_process';
import type { Dirent } from 'node:fs';
import { readdirSync } from 'node:fs';
import { inScope, isSkippedDirectory } from '@callmap/scope';

/** The tag this extractor stamps on every file it claims. */
export const TYPESCRIPT = 'typescript';

/**
 * What the TypeScript extractor understands. JavaScript rides with TypeScript, because they share
 * one module resolution, so one extractor reads both (ADR-0009).
 */
const UNDERSTOOD = ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs'];

/** Whether a file name is one this extractor reads. */
export const understood = (name: string): boolean =>
  UNDERSTOOD.some((extension) => name.endsWith(extension));

/**
 * The untracked paths that git ignores, by repo-relative path. A repo that is not a git repo
 * ignores nothing. An ignored folder can hold the data of a container that another user owns, so
 * the walk must not open it. The Ruby and Go extractors have their own copies of this reader.
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
 * Every source file of the repo that the scope takes in, by repo-relative path, in path order.
 * The walk does not enter a path that git ignores, or a folder below the root that it cannot read.
 * A symbolic link is not followed, so a link out of the repo cannot pull a foreign file in and a
 * link back into it cannot walk forever.
 */
export const sourceFilesInScope = (repo: string, scope: readonly string[]): readonly string[] => {
  const ignored = ignoredPathsOf(repo);
  const found: string[] = [];

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
      else if (entry.isFile() && understood(entry.name) && inScope(path, scope)) found.push(path);
    }
  };

  walk('');
  return found.sort();
};
