import { existsSync, realpathSync } from 'node:fs';
import { basename, isAbsolute, join, relative, resolve } from 'node:path';
import { assets } from './assets.ts';
import { extractionOf } from './extractor.ts';
import type { Extractor } from './extractor.ts';
import type { BaseWorktree } from './git.ts';
import { TYPESCRIPT_FILES } from './languages.ts';

const tsconfigOf = (root: string, tsconfig: string | undefined): string | undefined => {
  if (tsconfig === undefined) return undefined;
  const absolute = resolve(root, tsconfig);
  const path = existsSync(absolute) ? realpathSync(absolute) : absolute;
  const inRepo = relative(root, path);
  return inRepo.startsWith('..') || isAbsolute(inRepo) ? path : inRepo;
};

const isPackageFolder = (entry: string): boolean => basename(entry) === 'node_modules';

const linkPackageFolders = ({ untrackedEntries, link }: BaseWorktree): void => {
  for (const entry of untrackedEntries.filter(isPackageFolder)) link(entry);
};

export const typescriptExtractor = (root: string, typedTsconfig: string | undefined): Extractor => {
  const tsconfig = tsconfigOf(root, typedTsconfig);
  return {
    language: 'typescript',
    dependencyFiles: [
      'package-lock.json',
      'npm-shrinkwrap.json',
      'yarn.lock',
      'pnpm-lock.yaml',
      'bun.lock',
      'bun.lockb',
    ],
    options: tsconfig === undefined ? [] : [tsconfig],
    version: () => assets.typescriptExtractorVersion(),
    claimsAnyOf: TYPESCRIPT_FILES.claimsAnyOf,
    prepareBase: linkPackageFolders,
    extract: async (repo, scope) =>
      (
        await extractionOf(
          assets.typescriptExtractor,
          repo,
          scope,
          tsconfig === undefined
            ? []
            : ['--tsconfig', isAbsolute(tsconfig) ? tsconfig : join(repo, tsconfig)],
        )
      ).document,
  };
};
