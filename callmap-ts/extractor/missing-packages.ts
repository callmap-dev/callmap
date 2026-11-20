import { isBuiltin } from 'node:module';
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
 * The sorted names of the packages that the files import and that resolve to no code. A path
 * alias of the file names no package, and a module that a declaration file declares by its name is
 * code that the checker found.
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
      .map(packageNameOf);
  });
  return [...new Set(names)].sort();
};
