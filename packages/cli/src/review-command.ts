import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import type { GraphDocument } from '@callmap/graph-document';
import { packedSourcesOf, REVIEW_INPUT_FORMAT_VERSION } from '@callmap/review-input';
import type { Checkout } from '@callmap/review-input';
import { effectiveScope, inScope, isSkippedDirectory } from '@callmap/scope';
import type { ReviewInvocation } from './arguments.ts';
import { throughBaseCache } from './base-cache.ts';
import { openInBrowser } from './browser.ts';
import { cacheFolderOf } from './cache-folder.ts';
import type { Distribution } from './distribution.ts';
import type { Extractor } from './extractor.ts';
import {
  branchNameOf,
  commitOf,
  commonDirOf,
  defaultBranchOf,
  filesAtCommit,
  inWorktreeAt,
  mergeBaseOf,
  repoRootOf,
  shortCommitOf,
  uncommittedFilesOf,
  workingTreeFilesOf,
} from './git.ts';
import { LANGUAGE_FILES } from './languages.ts';
import { readerPageOf } from './reader-page.ts';
import { sourcesOf } from './sources.ts';

export class UnreadableGraphError extends Error {
  override readonly name = 'UnreadableGraphError';
}

const defaultOutOf = (root: string): string =>
  join(tmpdir(), 'callmap', `review-${basename(root)}.html`);

const readGraphDocumentOf = async (
  what: string,
  path: string,
  extractor: Extractor,
  scope: readonly string[],
): Promise<GraphDocument> => {
  try {
    return await extractor.extract(path, scope);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new UnreadableGraphError(
      `${what} could not be read: ${reason.replaceAll(`${path}/`, '')}`,
    );
  }
};

const settled = <T>(result: PromiseSettledResult<T>): T => {
  if (result.status === 'rejected') throw result.reason;
  return result.value;
};

const inSkippedDirectory = (path: string): boolean =>
  path.split('/').slice(0, -1).some(isSkippedDirectory);

const isInReviewScope = (path: string, scope: readonly string[]): boolean =>
  !inSkippedDirectory(path) && inScope(path, scope);

const otherLanguageLinesOf = (
  { command, language }: Distribution,
  inScopeFiles: readonly string[],
  files: readonly string[],
): readonly string[] =>
  language === undefined
    ? []
    : LANGUAGE_FILES.filter(
        (other) => other !== language && other.claimsAnyOf(inScopeFiles, files),
      ).map(
        (other) =>
          `${command} read only the ${language.name} files. Run ${other.distribution} review for the ${other.name} files.`,
      );

interface Base {
  readonly name: string;
  readonly commit: string;
}

const baseOf = (root: string, typed: string | undefined): Base => {
  if (typed !== undefined) return { name: typed, commit: commitOf(root, typed) };
  const name = defaultBranchOf(root);
  return { name, commit: mergeBaseOf(root, name) };
};

const checkoutOf = (root: string, base: Base, scope: readonly string[]): Checkout => ({
  branch: branchNameOf(root),
  baseName: base.name,
  baseCommit: shortCommitOf(root, base.commit),
  headCommit: shortCommitOf(root, 'HEAD'),
  uncommitted: uncommittedFilesOf(root).some((path) => isInReviewScope(path, scope)),
});

interface LanguageDocuments {
  readonly branch: GraphDocument;
  readonly base: GraphDocument;
}

export interface FinishedReview {
  readonly out: string;
  readonly notes: readonly string[];
}

export const runReview = async (
  invocation: ReviewInvocation,
  distribution: Distribution,
): Promise<FinishedReview> => {
  const root = repoRootOf(resolve(invocation.repo));
  const reviewBase = baseOf(root, invocation.base);
  const base = reviewBase.commit;
  const scope = effectiveScope(invocation.scope, invocation.tests);
  const documentsOf = async (extractor: Extractor): Promise<LanguageDocuments> => {
    const readBranch = (): Promise<GraphDocument> =>
      readGraphDocumentOf('the branch', root, extractor, scope);
    const readBase = (): Promise<GraphDocument> =>
      inWorktreeAt(
        root,
        base,
        (path) =>
          readGraphDocumentOf(`the base ${shortCommitOf(root, base)}`, path, extractor, scope),
        extractor.prepareBase,
      );
    const readCachedBase = (): Promise<GraphDocument> =>
      invocation.cache
        ? throughBaseCache(
            {
              cacheFolder: cacheFolderOf(distribution.command),
              repo: commonDirOf(root),
              checkout: root,
              commit: base,
              scope,
              extractor,
            },
            readBase,
          )
        : readBase();
    if (!extractor.readsInParallel) {
      const branch = await readBranch();
      return { branch, base: await readCachedBase() };
    }
    const [branchRead, baseRead] = await Promise.allSettled([readBranch(), readCachedBase()]);
    return { branch: settled(branchRead), base: settled(baseRead) };
  };

  const files = [...workingTreeFilesOf(root), ...filesAtCommit(root, base)];
  const inScopeFiles = files.filter((path) => isInReviewScope(path, scope));
  const picked = distribution
    .extractorsFor(root, invocation)
    .filter((extractor) => extractor.claimsAnyOf(inScopeFiles, files));
  const checked = picked.map((extractor) => ({ extractor, skipNote: extractor.skipNote?.() }));
  const read: LanguageDocuments[] = [];
  for (const { extractor } of checked.filter(({ skipNote }) => skipNote === undefined)) {
    read.push(await documentsOf(extractor));
  }
  const documents = {
    base: read.map(({ base }) => base),
    branch: read.map(({ branch }) => branch),
  };
  const html = await readerPageOf({
    formatVersion: REVIEW_INPUT_FORMAT_VERSION,
    ...documents,
    packedSources: await packedSourcesOf(sourcesOf(root, base, documents)),
    checkout: checkoutOf(root, reviewBase, scope),
    editor: { name: invocation.editor, repoRoot: root },
  });

  const out = resolve(invocation.out ?? defaultOutOf(root));
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, html);
  if (invocation.open) openInBrowser(out);
  return {
    out,
    notes: [
      ...otherLanguageLinesOf(distribution, inScopeFiles, files),
      ...checked.flatMap(({ skipNote }) => skipNote ?? []),
      ...checked.flatMap(({ extractor }) => extractor.notes?.() ?? []),
    ],
  };
};
