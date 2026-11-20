import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import * as ts from 'typescript';
import { isSkippedDirectory } from '@callmap/scope';

/** Thrown when the extractor cannot read what it was pointed at. */
export class ExtractionError extends Error {
  override readonly name = 'ExtractionError';
}

export interface ExtractOptions {
  /** The root of the repo to read. Every path in the document is relative to it. */
  readonly repo: string;
  /** The globs that limit which files enter the document. Empty takes the whole repo. */
  readonly scope?: readonly string[];
  /** The one `tsconfig.json` for every file, in place of the nearest one above each file. */
  readonly tsconfig?: string;
}

/**
 * The compiler options of a whole program, and the options that the imports of each file resolve
 * with. A path alias lives in the options of one file, and two apps of a workspace can give the
 * same import text two targets (ADR-0041).
 */
export interface CompilerOptionsOfFiles {
  readonly program: ts.CompilerOptions;
  readonly of: (file: string) => ts.CompilerOptions;
  /** The `tsconfig.json` in the folder itself, and none when it holds none. */
  readonly ofConfigIn: (folder: string) => Config | undefined;
}

/**
 * The options of one `tsconfig.json`, and the folder that its build folder mirrors: the `rootDir`
 * that the compiler would emit with.
 */
export interface Config {
  readonly options: ts.CompilerOptions;
  readonly rootDir: string;
}

/**
 * The one complaint a config can draw that says nothing about a graph document: no input file was
 * found. The extractor walks its own scope and hands the resolver that file list, so which files
 * the config would have compiled is not a question it ever asks.
 */
const NO_INPUTS_FOUND = 18003;

const NEAREST_CONFIG = 'tsconfig.json';

const DEFAULT_OPTIONS: ts.CompilerOptions = {
  allowJs: true,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
};

const isDeclaration = (file: string): boolean => /\.d\.[cm]?ts$/.test(file);

/**
 * The `rootDir` that the compiler emits with: the one that the config sets, the folder of the
 * config for a composite project, and else the deepest folder that holds each source file of the
 * config. So a package with `outDir` and `include: ["src"]` maps `dist/` to `src/`.
 */
const rootDirOf = ({ options, fileNames }: ts.ParsedCommandLine, folder: string): string => {
  if (options.rootDir !== undefined) return options.rootDir;
  if (options.composite === true) return folder;
  const folders = fileNames.filter((file) => !isDeclaration(file)).map((file) => dirname(file));
  const [first, ...others] = folders.map((path) => resolve(path).split(sep));
  if (first === undefined) return folder;
  const common = others.reduce((prefix, parts) => {
    const end = prefix.findIndex((part, at) => parts[at] !== part);
    return end === -1 ? prefix : prefix.slice(0, end);
  }, first);
  return common.join(sep) || sep;
};

/**
 * A config is read the compiler's own way, so a config that extends another inherits its aliases.
 * A config that is there and cannot be read is an error, because every alias would quietly go
 * missing and each call through one would read as an open end. That covers a config that is not
 * JSON, which reading it reports, and equally a config that is JSON and extends a base the
 * compiler cannot reach, which only parsing it reports. `allowJs` is forced on, because the
 * extractor claims JavaScript files and the resolver would not otherwise look for one.
 */
const configOf = (path: string): Config => {
  const read = ts.readConfigFile(path, (file) => ts.sys.readFile(file));
  if (read.error !== undefined || read.config === undefined)
    throw new ExtractionError(`${path} could not be read as a tsconfig`);
  const parsed = ts.parseJsonConfigFileContent(read.config, ts.sys, dirname(path));
  const failure = parsed.errors.find((error) => error.code !== NO_INPUTS_FOUND);
  if (failure !== undefined)
    throw new ExtractionError(
      `${path} could not be read as a tsconfig: ${ts.flattenDiagnosticMessageText(failure.messageText, ' ')}`,
    );
  return {
    options: { ...parsed.options, allowJs: true },
    rootDir: rootDirOf(parsed, dirname(path)),
  };
};

export const isInside = (folder: string, path: string): boolean => {
  const inner = relative(folder, path);
  return !inner.startsWith('..') && !isAbsolute(inner);
};

const isRepoSource = (repo: string, file: string): boolean =>
  isInside(repo, file) && !relative(repo, file).split(sep).slice(0, -1).some(isSkippedDirectory);

/**
 * Each file of the repo reads the nearest `tsconfig.json` in its folder or above it, up to the
 * repo root, and a file with none above it gets the default options. A file of a library, or a
 * file outside the repo, reads the options of the repo root, so the config that a library ships
 * never applies. With `--tsconfig`, that one config applies to every file. The nearest config of
 * each file in scope is read at once, so a broken config stops the extraction even when its files
 * import nothing.
 */
export const compilerOptionsOfFiles = (
  repo: string,
  tsconfig: string | undefined,
  filesInScope: readonly string[],
): CompilerOptionsOfFiles => {
  const configs = new Map<string, Config | undefined>();
  const ofConfigIn = (folder: string): Config | undefined => {
    if (configs.has(folder)) return configs.get(folder);
    const path = join(folder, NEAREST_CONFIG);
    const config = ts.sys.fileExists(path) ? configOf(path) : undefined;
    configs.set(folder, config);
    return config;
  };
  const optionsOfFolder = (folder: string): ts.CompilerOptions =>
    ofConfigIn(folder)?.options ??
    (folder === repo ? DEFAULT_OPTIONS : optionsOfFolder(dirname(folder)));
  const of = (file: string): ts.CompilerOptions =>
    optionsOfFolder(isRepoSource(repo, file) ? dirname(file) : repo);
  if (tsconfig !== undefined) {
    const { options } = configOf(resolve(tsconfig));
    return { program: options, of: () => options, ofConfigIn };
  }
  for (const file of filesInScope) of(file);
  return { program: optionsOfFolder(repo), of, ofConfigIn };
};
