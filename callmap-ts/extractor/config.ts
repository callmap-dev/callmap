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
  /** The options of the `tsconfig.json` in the folder itself, and none when it holds none. */
  readonly ofConfigIn: (folder: string) => ts.CompilerOptions | undefined;
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

/**
 * A config is read the compiler's own way, so a config that extends another inherits its aliases.
 * A config that is there and cannot be read is an error, because every alias would quietly go
 * missing and each call through one would read as an open end. That covers a config that is not
 * JSON, which reading it reports, and equally a config that is JSON and extends a base the
 * compiler cannot reach, which only parsing it reports. `allowJs` is forced on, because the
 * extractor claims JavaScript files and the resolver would not otherwise look for one.
 */
const optionsOfConfig = (path: string): ts.CompilerOptions => {
  const read = ts.readConfigFile(path, (file) => ts.sys.readFile(file));
  if (read.error !== undefined || read.config === undefined)
    throw new ExtractionError(`${path} could not be read as a tsconfig`);
  const parsed = ts.parseJsonConfigFileContent(read.config, ts.sys, dirname(path));
  const failure = parsed.errors.find((error) => error.code !== NO_INPUTS_FOUND);
  if (failure !== undefined)
    throw new ExtractionError(
      `${path} could not be read as a tsconfig: ${ts.flattenDiagnosticMessageText(failure.messageText, ' ')}`,
    );
  return { ...parsed.options, allowJs: true };
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
  const optionsOfConfigs = new Map<string, ts.CompilerOptions | undefined>();
  const ofConfigIn = (folder: string): ts.CompilerOptions | undefined => {
    if (optionsOfConfigs.has(folder)) return optionsOfConfigs.get(folder);
    const config = join(folder, NEAREST_CONFIG);
    const options = ts.sys.fileExists(config) ? optionsOfConfig(config) : undefined;
    optionsOfConfigs.set(folder, options);
    return options;
  };
  const optionsOfFolder = (folder: string): ts.CompilerOptions =>
    ofConfigIn(folder) ?? (folder === repo ? DEFAULT_OPTIONS : optionsOfFolder(dirname(folder)));
  const of = (file: string): ts.CompilerOptions =>
    optionsOfFolder(isRepoSource(repo, file) ? dirname(file) : repo);
  if (tsconfig !== undefined) {
    const options = optionsOfConfig(resolve(tsconfig));
    return { program: options, of: () => options, ofConfigIn };
  }
  for (const file of filesInScope) of(file);
  return { program: optionsOfFolder(repo), of, ofConfigIn };
};
