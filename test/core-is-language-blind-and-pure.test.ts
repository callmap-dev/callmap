/**
 * A guard over the whole core, not over one module: the core packages read data an extractor
 * already emitted and nothing else. If a package ever needs a filesystem, it stops being core and
 * belongs behind the extractor contract (ADR-0009).
 *
 * The extractor of a distribution is the other side of that contract, so the guard reads it the
 * other way round: it is the one that reads a repo and the one that names a language. The guard
 * reads the TypeScript code of callmap-ts. The extractors of callmap-go and callmap-rb are Go and
 * Ruby, and their own tests hold them.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = join(import.meta.dirname, '..');
const PACKAGES_DIR = join(REPO_ROOT, 'packages');
const CALLMAP_TS = join(REPO_ROOT, 'callmap-ts');

/** The package of the reader page: a page script for the browser, and the build that bundles it. */
const PAGE_PACKAGES: readonly string[] = ['reader-page'];

const isPage = (name: string): boolean => PAGE_PACKAGES.includes(name);

/** A package that runs a distribution on fixture repos and reads its page. It is not core. */
const SUITE_PACKAGES: readonly string[] = ['conformance'];

const isSuite = (name: string): boolean => SUITE_PACKAGES.includes(name);

const FORBIDDEN_IMPORTS = new Set([
  'fs',
  'fs/promises',
  'node:fs',
  'node:fs/promises',
  'node:path',
  'child_process',
  'node:child_process',
  'node:http',
  'node:https',
  'node:net',
  'typescript',
]);

const sourceFilesOf = (directory: string): readonly string[] =>
  readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return sourceFilesOf(path);
    return path.endsWith('.ts') || path.endsWith('.tsx') ? [path] : [];
  });

/**
 * Every module specifier a file names, however it names it: a static import, a re-export, or a
 * dynamic `import(...)`, quoted either way. A guard that only reads one spelling reads as stronger
 * than it is.
 */
const importsOf = (text: string): readonly string[] =>
  [...text.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)].map(
    ([, specifier]) => specifier ?? '',
  );

const packageNames = readdirSync(PACKAGES_DIR)
  .filter((entry) => statSync(join(PACKAGES_DIR, entry)).isDirectory())
  .sort();

const corePackages = packageNames.filter((name) => !isPage(name) && !isSuite(name));
const pagePackages = packageNames.filter(isPage);
const suitePackages = packageNames.filter(isSuite);

const importsUnder = (directory: string): ReadonlySet<string> =>
  new Set(sourceFilesOf(directory).flatMap((path) => importsOf(readFileSync(path, 'utf8'))));

const importsIn = (name: string): ReadonlySet<string> =>
  importsUnder(join(PACKAGES_DIR, name, 'src'));

const namesALanguage = (path: string): boolean =>
  /'(typescript|javascript|go|ruby)'/.test(readFileSync(path, 'utf8'));

const isNodeBuiltin = (specifier: string): boolean =>
  specifier.startsWith('node:') || builtinModules.includes(specifier.split('/')[0] ?? '');

describe('the core', () => {
  it('holds every core package the reader keeps', () => {
    expect(corePackages).toEqual([
      'editor-link',
      'graph-document',
      'review',
      'review-input',
      'scope',
    ]);
  });

  it('reads a specifier however it is spelled, so the guard cannot be side-stepped', () => {
    const spellings = [
      "import { readFileSync } from 'node:fs';",
      'import { readFileSync } from "node:fs";',
      "export { readFileSync } from 'node:fs';",
      "const fs = await import('node:fs');",
      'const fs = await import("node:fs");',
    ];
    for (const spelling of spellings) {
      expect(importsOf(spelling), spelling).toContain('node:fs');
    }
  });

  it.each(corePackages)('%s reads no source code and no filesystem', (name) => {
    const sources = sourceFilesOf(join(PACKAGES_DIR, name, 'src'));
    expect(sources.length).toBeGreaterThan(0);
    const offenders = sources.flatMap((path) =>
      importsOf(readFileSync(path, 'utf8'))
        .filter((specifier) => FORBIDDEN_IMPORTS.has(specifier))
        .map((specifier) => `${path} imports ${specifier}`),
    );
    expect(offenders).toEqual([]);
  });

  it.each(corePackages)('%s names no language, because the core is language-blind', (name) => {
    const offenders = sourceFilesOf(join(PACKAGES_DIR, name, 'src')).filter(namesALanguage);
    expect(offenders).toEqual([]);
  });
});

describe('the reader page', () => {
  it('has a package of its own', () => {
    expect(pagePackages).toEqual(PAGE_PACKAGES);
  });

  it('keeps the page script off every Node built-in, because it runs in the browser', () => {
    const offenders = [...importsUnder(join(PACKAGES_DIR, 'reader-page', 'page'))].filter(
      isNodeBuiltin,
    );
    expect(offenders).toEqual([]);
  });

  it('names no language in the page script, because the page is language-blind', () => {
    const offenders = sourceFilesOf(join(PACKAGES_DIR, 'reader-page', 'page')).filter(
      namesALanguage,
    );
    expect(offenders).toEqual([]);
  });
});

describe('the extractor of callmap-ts', () => {
  const extractor = join(CALLMAP_TS, 'extractor');

  it('is the side of the contract that reads a repo', () => {
    expect(importsUnder(extractor)).toContain('node:fs');
  });

  it('names the language it claims, so the core never has to', () => {
    expect(sourceFilesOf(extractor).filter(namesALanguage).length).toBeGreaterThan(0);
  });
});

describe('the command of callmap-ts that runs it', () => {
  const command = join(CALLMAP_TS, 'src');

  it('runs the extractor as a process of its own', () => {
    expect(importsUnder(command)).toContain('node:child_process');
  });

  it('reads source text for the code panel but parses none, because it imports no parser and no extractor', () => {
    expect(importsUnder(command)).toContain('node:fs');
    const offenders = [...importsUnder(command)].filter(
      (specifier) => specifier === 'typescript' || specifier.includes('/extractor/'),
    );
    expect(offenders).toEqual([]);
  });
});

describe('the conformance suite that checks it', () => {
  it('runs the review command of a distribution as a process of its own', () => {
    expect(suitePackages).toEqual(SUITE_PACKAGES);
    expect(importsIn('conformance')).toContain('node:child_process');
  });
});
