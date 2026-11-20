import * as ts from 'typescript';
import type { CompilerOptionsOfFiles } from './config.ts';
import { workspacePackagesOf } from './workspace-package.ts';

/**
 * A compiler host that resolves the imports of each file with the options of that file, so one
 * program holds every file and a call can cross from one app into another. An import of a
 * workspace package resolves to the source of that package.
 */
export const compilerHostOf = (repo: string, options: CompilerOptionsOfFiles): ts.CompilerHost => {
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
    return literals.map((literal) =>
      workspacePackages.toSource(
        ts.resolveModuleName(
          literal.text,
          containingFile,
          fileOptions,
          workspacePackages.host,
          cacheOf(fileOptions),
          redirectedReference,
          ts.getModeForUsageLocation(file, literal, fileOptions),
        ),
      ),
    );
  };
  return host;
};
