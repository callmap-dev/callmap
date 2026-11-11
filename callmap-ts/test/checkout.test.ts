import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { commitFile, featureBranchRepo, git } from '../../test/fixture-repo.ts';
import { reviewInputOf } from './callmap-ts-run.ts';

const checkoutOf = (repo: string, ...flags: readonly string[]) =>
  reviewInputOf(repo, ...flags).checkout;

const shortOf = (repo: string, revision: string): string =>
  git(repo, 'rev-parse', '--short=7', revision);

const cleanRangeOf = (repo: string) => ({
  baseCommit: shortOf(repo, 'feature~1'),
  headCommit: shortOf(repo, 'HEAD'),
});

describe('the checkout of the review input', () => {
  it('names the branch and the default branch, with the range from the merge base to HEAD', () => {
    const repo = featureBranchRepo();
    git(repo, 'checkout', '--quiet', 'main');
    commitFile(repo, 'README.md', 'after the branch point\n');
    git(repo, 'checkout', '--quiet', 'feature');
    expect(checkoutOf(repo)).toEqual({
      branch: 'feature',
      baseName: 'main',
      ...cleanRangeOf(repo),
      uncommitted: false,
    });
  });

  it('names the default branch as git names it on the remote', () => {
    const repo = featureBranchRepo();
    git(repo, 'update-ref', 'refs/remotes/origin/main', 'main');
    git(repo, 'symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/main');
    expect(checkoutOf(repo).baseName).toBe('origin/main');
  });

  it('names no branch on a detached HEAD', () => {
    const repo = featureBranchRepo();
    git(repo, 'checkout', '--quiet', '--detach', 'HEAD');
    expect(checkoutOf(repo).branch).toBeUndefined();
  });

  it('names the base as the reader typed it, and starts the range at that commit', () => {
    const repo = featureBranchRepo();
    commitFile(
      repo,
      'src/money.ts',
      'export const half = (amount: number): number => amount / 2;\n',
    );
    expect(checkoutOf(repo, '--base', 'HEAD~1')).toMatchObject({
      baseName: 'HEAD~1',
      baseCommit: shortOf(repo, 'HEAD~1'),
      headCommit: shortOf(repo, 'HEAD'),
    });
  });
});

describe('the uncommitted mark of the review input', () => {
  const SCOPE = ['--scope', 'src/**'];

  it.each([
    [
      'an unstaged change',
      (repo: string) => {
        appendFileSync(join(repo, 'src/cart.ts'), '\nexport const unstaged = (): number => 1;\n');
      },
    ],
    [
      'a staged change',
      (repo: string) => {
        appendFileSync(join(repo, 'src/money.ts'), '\nexport const staged = (): number => 1;\n');
        git(repo, 'add', 'src/money.ts');
      },
    ],
    [
      'an untracked file',
      (repo: string) => {
        mkdirSync(join(repo, 'src/new'));
        writeFileSync(join(repo, 'src/new/fresh.ts'), 'export const fresh = (): number => 1;\n');
      },
    ],
  ])('marks %s to a file in the scope', (_, change) => {
    const repo = featureBranchRepo();
    change(repo);
    expect(checkoutOf(repo, ...SCOPE)).toMatchObject({ ...cleanRangeOf(repo), uncommitted: true });
  });

  it('leaves a clean tree unmarked', () => {
    const repo = featureBranchRepo();
    expect(checkoutOf(repo, ...SCOPE)).toMatchObject({ ...cleanRangeOf(repo), uncommitted: false });
  });

  it('leaves a change to a file outside the scope unmarked', () => {
    const repo = featureBranchRepo();
    appendFileSync(join(repo, 'tsconfig.json'), '\n');
    writeFileSync(join(repo, 'notes.txt'), 'not in the scope\n');
    expect(checkoutOf(repo, ...SCOPE)).toMatchObject({ ...cleanRangeOf(repo), uncommitted: false });
  });
});
