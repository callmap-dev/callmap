import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { GraphDocument } from '@callmap/graph-document';
import type { ReviewDocuments } from '@callmap/review';
import type { SourceTexts, Sources } from '@callmap/review-input';
import { changedFilesOf, fileAt } from './git.ts';

const textsOf = (files: Iterable<string>, read: (file: string) => string): SourceTexts =>
  Object.fromEntries([...new Set(files)].sort().map((file) => [file, read(file)]));

const filesOf = (documents: readonly GraphDocument[]): ReadonlySet<string> =>
  new Set(documents.flatMap(({ files }) => files));

/** The base graph documents hold only the files in scope and in a language of the review, as ADR-0038 needs. */
export const sourcesOf = (root: string, base: string, documents: ReviewDocuments): Sources => {
  const baseFiles = filesOf(documents.base);
  return {
    branch: textsOf(filesOf(documents.branch), (file) => readFileSync(join(root, file), 'utf8')),
    base: textsOf(
      changedFilesOf(root, base).filter((file) => baseFiles.has(file)),
      (file) => fileAt(root, base, file),
    ),
  };
};
