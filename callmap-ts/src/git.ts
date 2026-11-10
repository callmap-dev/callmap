import { execFileSync } from 'node:child_process';
import {
  existsSync,
  lstatSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  unlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

export class GitError extends Error {
  override readonly name = 'GitError';
}

const gitOutput = (cwd: string, ...args: readonly string[]): string =>
  execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 1 << 30,
  });

const git = (cwd: string, ...args: readonly string[]): string => gitOutput(cwd, ...args).trim();

const gitOr = (message: string, cwd: string, ...args: readonly string[]): string => {
  try {
    return git(cwd, ...args);
  } catch {
    throw new GitError(message);
  }
};

const succeeds = (cwd: string, ...args: readonly string[]): boolean => {
  try {
    git(cwd, ...args);
    return true;
  } catch {
    return false;
  }
};

export const repoRootOf = (path: string): string =>
  gitOr(`${path} is not inside a git repo`, path, 'rev-parse', '--show-toplevel');

export const commonDirOf = (root: string): string =>
  realpathSync(git(root, 'rev-parse', '--path-format=absolute', '--git-common-dir'));

const REMOTE_HEAD = /^refs\/remotes\/(.+)\/HEAD$/;

const remoteHeadsOf = (root: string): readonly string[] => {
  const remotes = git(root, 'for-each-ref', '--format=%(refname)', 'refs/remotes/')
    .split('\n')
    .flatMap((ref) => REMOTE_HEAD.exec(ref)?.slice(1, 2) ?? []);
  return [
    ...remotes.filter((remote) => remote === 'origin'),
    ...remotes.filter((remote) => remote !== 'origin'),
  ]
    .map((remote) => `refs/remotes/${remote}/HEAD`)
    .filter((head) => succeeds(root, 'symbolic-ref', '--quiet', head));
};

export const defaultBranchOf = (root: string): string => {
  const [remoteHead] = remoteHeadsOf(root);
  if (remoteHead !== undefined) return git(root, 'symbolic-ref', '--quiet', '--short', remoteHead);
  const local = ['main', 'master'].find((branch) =>
    succeeds(root, 'rev-parse', '--verify', '--quiet', `refs/heads/${branch}`),
  );
  if (local === undefined) {
    throw new GitError(
      `${root} has no remote head, no main and no master to find a base on. Name one with --base.`,
    );
  }
  return local;
};

export const mergeBaseOf = (root: string, branch: string): string =>
  gitOr(`HEAD shares no commit with ${branch} in ${root}`, root, 'merge-base', 'HEAD', branch);

export const commitOf = (root: string, revision: string): string =>
  gitOr(
    `the base '${revision}' is not a commit in ${root}`,
    root,
    'rev-parse',
    '--verify',
    '--quiet',
    `${revision}^{commit}`,
  );

export const branchNameOf = (root: string): string | undefined =>
  succeeds(root, 'symbolic-ref', '--quiet', 'HEAD')
    ? git(root, 'symbolic-ref', '--quiet', '--short', 'HEAD')
    : undefined;

// git grows the length of --short with the object count, so 2 clones of the same commits can differ.
const SHORT_COMMIT_LENGTH = 7;

export const shortCommitOf = (root: string, commit: string): string =>
  git(root, 'rev-parse', `--short=${String(SHORT_COMMIT_LENGTH)}`, commit);

const pathsOf = (listing: string): readonly string[] =>
  listing.split('\0').filter((path) => path !== '');

export const workingTreeFilesOf = (root: string): readonly string[] =>
  pathsOf(gitOutput(root, 'ls-files', '--cached', '--others', '--exclude-standard', '-z'));

const STATUS_CODE_LENGTH = 'XY '.length;

export const uncommittedFilesOf = (root: string): readonly string[] =>
  pathsOf(
    gitOutput(
      root,
      '--no-optional-locks',
      'status',
      '--porcelain=v1',
      '-z',
      '--no-renames',
      '--untracked-files=all',
    ),
  ).map((entry) => entry.slice(STATUS_CODE_LENGTH));

export const changedFilesOf = (root: string, commit: string): readonly string[] =>
  pathsOf(gitOutput(root, 'diff', '--name-only', '--no-renames', '-z', commit));

export const filesAtCommit = (root: string, commit: string): readonly string[] =>
  pathsOf(gitOutput(root, 'ls-tree', '-r', '--name-only', '-z', commit));

export const fileAt = (root: string, commit: string, file: string): string =>
  gitOutput(root, 'show', `${commit}:${file}`);

const untrackedEntriesOf = (root: string): readonly string[] =>
  git(root, 'ls-files', '--others', '--directory', '-z')
    .split('\0')
    .map((entry) => entry.replace(/\/$/, ''));

/**
 * A Bazel repo can track a link into bazel-bin for each generated file, so the base reads the
 * generated files through the Bazel output links of the branch.
 */
const isBazelOutputLink = (root: string, entry: string): boolean =>
  /^bazel-[^/]+$/.test(entry) && lstatSync(join(root, entry)).isSymbolicLink();

export interface BaseWorktree {
  readonly untrackedEntries: readonly string[];
  readonly link: (entry: string) => void;
}

export type BasePreparation = (worktree: BaseWorktree) => void;

const noPreparation: BasePreparation = () => undefined;

export const inWorktreeAt = async <T>(
  root: string,
  commit: string,
  read: (path: string) => Promise<T>,
  prepare: BasePreparation = noPreparation,
): Promise<T> => {
  const parent = mkdtempSync(join(tmpdir(), 'callmap-base-'));
  const path = join(parent, 'base');
  git(root, 'worktree', 'add', '--detach', '--quiet', path, commit);
  const links: string[] = [];
  const link = (entry: string): void => {
    const linked = join(path, entry);
    if (!existsSync(dirname(linked)) || existsSync(linked)) return;
    symlinkSync(join(root, entry), linked, 'junction');
    links.push(linked);
  };
  try {
    const untrackedEntries = untrackedEntriesOf(root);
    for (const entry of untrackedEntries.filter((each) => isBazelOutputLink(root, each)))
      link(entry);
    prepare({ untrackedEntries, link });
    return await read(path);
  } finally {
    for (const linked of links) unlinkSync(linked);
    git(root, 'worktree', 'remove', '--force', path);
    rmSync(parent, { recursive: true, force: true });
  }
};
