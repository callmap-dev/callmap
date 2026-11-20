import { join, relative, sep } from 'node:path';
import * as ts from 'typescript';
import { isInside } from './config.ts';
import type { CompilerOptionsOfFiles } from './config.ts';

/**
 * A workspace package is a link in `node_modules` whose real path is in the repo and not in a
 * `node_modules` folder (ADR-0041). Its import resolves to its source: a file of its build folder
 * maps to the source file through the `outDir` and the `rootDir` of its own `tsconfig.json`, as
 * TypeScript project references do, and that holds when the build folder exists too.
 */
export interface WorkspacePackages {
  /**
   * Takes a build file of a workspace package as there when its source file is there, and keeps
   * the link path of that build file, so that the resolved file still names its package.
   */
  readonly host: ts.ModuleResolutionHost;
  readonly toSource: (
    resolution: ts.ResolvedModuleWithFailedLookupLocations,
  ) => ts.ResolvedModuleWithFailedLookupLocations;
}

const NODE_MODULES = 'node_modules';

const { Ts, Tsx, Js, Jsx, Mts, Mjs, Cts, Cjs } = ts.Extension;

const SOURCE_EXTENSIONS_OF_BUILD: readonly (readonly [string, readonly ts.Extension[]])[] = [
  ['.d.ts', [Ts, Tsx, Js, Jsx]],
  ['.d.mts', [Mts, Mjs]],
  ['.d.cts', [Cts, Cjs]],
  [Js, [Ts, Tsx, Js, Jsx]],
  [Jsx, [Tsx, Jsx]],
  [Mjs, [Mts, Mjs]],
  [Cjs, [Cts, Cjs]],
  [Ts, [Ts]],
  [Tsx, [Tsx]],
  [Mts, [Mts]],
  [Cts, [Cts]],
];

interface SourceFile {
  readonly path: string;
  readonly extension: ts.Extension;
}

const sourceCandidatesOf = (path: string): readonly SourceFile[] => {
  const match = SOURCE_EXTENSIONS_OF_BUILD.find(([build]) => path.endsWith(build));
  if (match === undefined) return [];
  const [build, extensions] = match;
  const stem = path.slice(0, -build.length);
  return extensions.map((extension) => ({ path: `${stem}${extension}`, extension }));
};

interface PackageLink {
  readonly folder: string;
  readonly inner: readonly string[];
}

const packageLinkOf = (path: string): PackageLink | undefined => {
  const parts = path.split(sep);
  const at = parts.lastIndexOf(NODE_MODULES);
  if (at === -1) return undefined;
  const end = at + (parts[at + 1]?.startsWith('@') === true ? 3 : 2);
  if (parts.length < end) return undefined;
  return { folder: parts.slice(0, end).join(sep), inner: parts.slice(end) };
};

export const workspacePackagesOf = (
  repo: string,
  options: CompilerOptionsOfFiles,
  host: ts.ModuleResolutionHost,
): WorkspacePackages => {
  const realpath = (path: string): string => host.realpath?.(path) ?? path;
  const directoryExists = (path: string): boolean =>
    host.directoryExists?.(path) ?? ts.sys.directoryExists(path);
  const workspaceFolders = new Map<string, string | undefined>();
  const workspaceFolderOf = (link: string): string | undefined => {
    if (workspaceFolders.has(link)) return workspaceFolders.get(link);
    const real = realpath(link);
    const folder =
      isInside(repo, real) && !relative(repo, real).split(sep).includes(NODE_MODULES)
        ? real
        : undefined;
    workspaceFolders.set(link, folder);
    return folder;
  };

  const sourcePathOf = (path: string): string | undefined => {
    const link = packageLinkOf(path);
    if (link === undefined) return undefined;
    const folder = workspaceFolderOf(link.folder);
    if (folder === undefined) return undefined;
    const config = options.ofConfigIn(folder);
    if (config?.outDir === undefined) return undefined;
    const built = join(folder, ...link.inner);
    if (!isInside(config.outDir, built)) return undefined;
    return join(config.rootDir ?? folder, relative(config.outDir, built));
  };

  const sourceFileOf = (path: string): SourceFile | undefined => {
    const source = sourcePathOf(path);
    return source === undefined
      ? undefined
      : sourceCandidatesOf(source).find((candidate) => host.fileExists(candidate.path));
  };

  const sourceFolderOf = (path: string): string | undefined => {
    const source = sourcePathOf(path);
    return source !== undefined && directoryExists(source) ? source : undefined;
  };

  return {
    host: {
      ...host,
      fileExists: (path) => host.fileExists(path) || sourceFileOf(path) !== undefined,
      directoryExists: (path) => directoryExists(path) || sourceFolderOf(path) !== undefined,
      realpath: (path) => (sourceFileOf(path) === undefined ? realpath(path) : path),
    },
    toSource: (resolution) => {
      const resolved = resolution.resolvedModule;
      if (resolved === undefined) return resolution;
      const source = sourceFileOf(resolved.resolvedFileName);
      if (source === undefined) return resolution;
      return {
        ...resolution,
        resolvedModule: {
          ...resolved,
          resolvedFileName: source.path,
          extension: source.extension,
          isExternalLibraryImport: false,
          resolvedUsingTsExtension: false,
        },
      };
    },
  };
};
