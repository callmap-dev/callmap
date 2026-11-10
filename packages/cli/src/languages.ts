export interface LanguageFiles {
  readonly name: string;
  readonly distribution: string;
  readonly claimsAnyOf: (inScope: readonly string[], files: readonly string[]) => boolean;
}

const TYPESCRIPT_FILE = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;

export const TYPESCRIPT_FILES: LanguageFiles = {
  name: 'TypeScript',
  distribution: 'callmap-ts',
  claimsAnyOf: (inScope) => inScope.some((path) => TYPESCRIPT_FILE.test(path)),
};

const directoryOf = (path: string): string => path.split('/').slice(0, -1).join('/');

const isGoMod = (path: string): boolean => path === 'go.mod' || path.endsWith('/go.mod');

/** The directories that `skipped` in packages/extractor-go/go/walk.go names, so the two agree. */
const goSkipsDirectory = (name: string): boolean =>
  name === 'vendor' ||
  name === 'testdata' ||
  name === 'node_modules' ||
  name.startsWith('.') ||
  name.startsWith('_');

const goWalkReads = (path: string, moduleDirs: ReadonlySet<string>): boolean => {
  if (!path.endsWith('.go')) return false;
  const dirs = path.split('/').slice(0, -1);
  if (dirs.some(goSkipsDirectory)) return false;
  return (
    dirs.some((_, index) => moduleDirs.has(dirs.slice(0, index + 1).join('/'))) ||
    moduleDirs.has('')
  );
};

export const GO_FILES: LanguageFiles = {
  name: 'Go',
  distribution: 'callmap-go',
  claimsAnyOf: (inScope, files) => {
    const moduleDirs = new Set(files.filter(isGoMod).map(directoryOf));
    return inScope.some((path) => goWalkReads(path, moduleDirs));
  },
};

export const RUBY_FILES: LanguageFiles = {
  name: 'Ruby',
  distribution: 'callmap-rb',
  claimsAnyOf: (inScope) => inScope.some((path) => path.endsWith('.rb')),
};

export const LANGUAGE_FILES: readonly LanguageFiles[] = [TYPESCRIPT_FILES, GO_FILES, RUBY_FILES];
