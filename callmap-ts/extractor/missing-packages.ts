import { isBuiltin } from 'node:module';
import { dirname, join } from 'node:path';
import * as ts from 'typescript';

/**
 * The imports of each file that resolve to no file, as the compiler host saw them. A relative
 * import and a module of Node never name a package to install, so the record leaves them out. The
 * types of Node load only when the type roots reach `@types/node`, which the folder of the process
 * decides and not the repo.
 */
export interface UnresolvedImports {
  readonly add: (containingFile: string, specifier: string) => void;
  readonly of: (file: string) => readonly string[];
}

export const unresolvedImports = (): UnresolvedImports => {
  const specifiersOfFile = new Map<string, Set<string>>();
  return {
    add: (containingFile, specifier) => {
      if (ts.isExternalModuleNameRelative(specifier) || isBuiltin(specifier)) return;
      const specifiers = specifiersOfFile.get(containingFile) ?? new Set<string>();
      specifiers.add(specifier);
      specifiersOfFile.set(containingFile, specifiers);
    },
    of: (file) => [...(specifiersOfFile.get(file) ?? [])],
  };
};

const packageNameOf = (specifier: string): string => {
  const segments = specifier.split('/');
  return specifier.startsWith('@') ? segments.slice(0, 2).join('/') : (segments[0] ?? specifier);
};

const matchesPattern = (pattern: string, specifier: string): boolean => {
  const star = pattern.indexOf('*');
  if (star === -1) return pattern === specifier;
  const prefix = pattern.slice(0, star);
  const suffix = pattern.slice(star + 1);
  return (
    specifier.length >= prefix.length + suffix.length &&
    specifier.startsWith(prefix) &&
    specifier.endsWith(suffix)
  );
};

const unquoted = (name: string): string => name.slice(1, -1);

/**
 * A package whose folder is in a `node_modules` above the file is installed, also when the import
 * names a file of it that is not code, such as `bootstrap/dist/css/bootstrap.min.css`.
 */
const isInstalled = (file: string, name: string): boolean => {
  for (let folder = dirname(file); ; folder = dirname(folder)) {
    if (ts.sys.directoryExists(join(folder, 'node_modules', name))) return true;
    if (dirname(folder) === folder) return false;
  }
};

/**
 * The sorted names of the packages that the files import and that resolve to no code. A path
 * alias of the file names no package, a module that a declaration file declares by its name is
 * code that the checker found, and a package that the checkout installed is not missing.
 */
export const missingPackagesOf = (
  files: readonly string[],
  imports: UnresolvedImports,
  optionsOf: (file: string) => ts.CompilerOptions,
  checker: ts.TypeChecker,
): readonly string[] => {
  const ambientModules = checker.getAmbientModules().map(({ name }) => unquoted(name));
  const names = files.flatMap((file) => {
    const aliases = Object.keys(optionsOf(file).paths ?? {});
    return imports
      .of(file)
      .filter(
        (specifier) =>
          !aliases.some((alias) => matchesPattern(alias, specifier)) &&
          !ambientModules.some((module) => matchesPattern(module, specifier)),
      )
      .map(packageNameOf)
      .filter((name) => !isInstalled(file, name));
  });
  return [...new Set(names)].sort();
};
