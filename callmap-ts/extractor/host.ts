import * as ts from 'typescript';
import type { CompilerOptionsOfFiles } from './config.ts';
import type { UnresolvedImports } from './missing-packages.ts';
import { workspacePackagesOf } from './workspace-package.ts';

/**
 * A compiler host that resolves the imports of each file with the options of that file, so one
 * program holds every file and a call can cross from one app into another. An import of a
 * workspace package resolves to the source of that package. Each import that resolves to no file
 * goes into the record of unresolved imports.
 */
export const compilerHostOf = (
  repo: string,
  options: CompilerOptionsOfFiles,
  unresolved: UnresolvedImports,
): ts.CompilerHost => {
  const host = ts.createCompilerHost(options.program);
  const workspacePackages = workspacePackagesOf(repo, options, host);
  const caches = new Map<ts.CompilerOptions, ts.ModuleResolutionCache>();
  const cacheOf = (fileOptions: ts.CompilerOptions): ts.ModuleResolutionCache => {
    const known = caches.get(fileOptions);
    if (known !== undefined) return known;
    const cache = ts.createModuleResolutionCache(
      host.getCurrentDirectory(),
      (name) => host.getCanonicalFileName(name),
      fileOptions,
    );
    caches.set(fileOptions, cache);
    return cache;
  };
  host.resolveModuleNameLiterals = (literals, containingFile, redirectedReference, _, file) => {
    const fileOptions = options.of(containingFile);
    return literals.map((literal) => {
      const resolution = workspacePackages.toSource(
        ts.resolveModuleName(
          literal.text,
          containingFile,
          fileOptions,
          workspacePackages.host,
          cacheOf(fileOptions),
          redirectedReference,
          ts.getModeForUsageLocation(file, literal, fileOptions),
        ),
      );
      if (resolution.resolvedModule === undefined) unresolved.add(containingFile, literal.text);
      return resolution;
    });
  };
  return host;
};
