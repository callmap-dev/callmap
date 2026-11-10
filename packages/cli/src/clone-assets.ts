import { readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Assets } from './assets.ts';
import { sha256OfFiles } from './file-hash.ts';
import type { NamedFile } from './file-hash.ts';
import { typescriptVersionFor } from './package-manifest.ts';
import { pageTemplate } from './page-build.ts';

const TYPESCRIPT_EXTRACTOR = fileURLToPath(
  import.meta.resolve('@callmap/extractor-typescript/cli'),
);

const sourceFilesOf = (folder: string): readonly string[] =>
  readdirSync(folder, { recursive: true, encoding: 'utf8' })
    .filter((file) => file.endsWith('.ts'))
    .sort();

export const extractorSourceFiles = (): readonly NamedFile[] => {
  const scope = dirname(createRequire(TYPESCRIPT_EXTRACTOR).resolve('@callmap/scope'));
  return (
    [
      ['extractor', dirname(TYPESCRIPT_EXTRACTOR)],
      ['scope', scope],
    ] as const
  ).flatMap(([name, folder]) =>
    sourceFilesOf(folder).map((file) => ({ name: `${name}/${file}`, path: join(folder, file) })),
  );
};

const GO_EXTRACTOR = fileURLToPath(import.meta.resolve('@callmap/extractor-go/cli'));

export const GO_PROGRAM = join(dirname(GO_EXTRACTOR), '..', '..', '..', 'callmap-go');

const GO_EXTRACTOR_FOLDERS: readonly string[] = ['cmd/callmap-extract-go/', 'internal/', 'vendor/'];

const GO_MODULE_FILES: readonly string[] = ['go.mod', 'go.sum'];

/** The files of the callmap-go module that build the Go extractor, by their path in the module. */
export const isGoExtractorSource = (path: string): boolean =>
  !path.endsWith('_test.go') &&
  (GO_MODULE_FILES.includes(path) ||
    GO_EXTRACTOR_FOLDERS.some((folder) => path.startsWith(folder)));

export const goSourceFiles = (): readonly NamedFile[] => [
  ...sourceFilesOf(dirname(GO_EXTRACTOR)).map((file) => ({
    name: `src/${file}`,
    path: join(dirname(GO_EXTRACTOR), file),
  })),
  ...readdirSync(GO_PROGRAM, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name))
    .filter((path) => isGoExtractorSource(relative(GO_PROGRAM, path)))
    .sort()
    .map((path) => ({ name: `go/${relative(GO_PROGRAM, path)}`, path })),
];

const RUBY_EXTRACTOR = fileURLToPath(import.meta.resolve('@callmap/extractor-ruby/cli'));

export const RUBY_SCRIPTS = join(
  dirname(RUBY_EXTRACTOR),
  '..',
  '..',
  '..',
  'callmap-rb',
  'lib',
  'callmap_rb',
  'ripper',
);

export const rubySourceFiles = (): readonly NamedFile[] => {
  const scope = dirname(createRequire(RUBY_EXTRACTOR).resolve('@callmap/scope'));
  return (
    [
      ['src', dirname(RUBY_EXTRACTOR), '.ts'],
      ['ruby', RUBY_SCRIPTS, '.rb'],
      ['scope', scope, '.ts'],
    ] as const
  ).flatMap(([name, folder, extension]) =>
    readdirSync(folder, { recursive: true, encoding: 'utf8' })
      .filter((file) => file.endsWith(extension))
      .sort()
      .map((file) => ({ name: `${name}/${file}`, path: join(folder, file) })),
  );
};

export const assets: Assets = {
  typescriptExtractor: TYPESCRIPT_EXTRACTOR,
  pageTemplate,
  typescriptExtractorVersion: () =>
    sha256OfFiles(
      extractorSourceFiles(),
      `typescript ${typescriptVersionFor(TYPESCRIPT_EXTRACTOR)}\0`,
    ),
  goExtractor: GO_EXTRACTOR,
  goExtractorVersion: (goVersion) => sha256OfFiles(goSourceFiles(), `${goVersion}\0`),
  goExtractorEnv: () => ({}),
  rubyExtractor: RUBY_EXTRACTOR,
  rubyExtractorVersion: (rubyVersion) => sha256OfFiles(rubySourceFiles(), `${rubyVersion}\0`),
  rubyExtractorEnv: () => ({}),
};
