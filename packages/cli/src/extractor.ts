import { spawn } from 'node:child_process';
import { readGraphDocument } from '@callmap/graph-document';
import type { GraphDocument } from '@callmap/graph-document';
import type { CachedExtractor } from './base-cache.ts';
import type { BasePreparation } from './git.ts';

interface FinishedExtractorProcess {
  readonly stdout: string;
  readonly stderr: string;
}

const runExtractorProcess = (
  command: string,
  args: readonly string[],
  env: Readonly<Record<string, string>> = {},
): Promise<FinishedExtractorProcess> =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, ...env },
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0)
        resolve({
          stdout: Buffer.concat(stdout).toString('utf8'),
          stderr: Buffer.concat(stderr).toString('utf8'),
        });
      else reject(new Error(Buffer.concat(stderr).toString('utf8').trim()));
    });
  });

/** The review command already put the test globs in the scope, so the extractor reads it as it is. */
const effectiveScopeArgumentsOf = (scope: readonly string[]): readonly string[] => [
  ...scope.flatMap((glob) => ['--scope', glob]),
  '--tests',
];

interface Extraction {
  readonly document: GraphDocument;
  readonly stderr: string;
}

export const extractionOf = async (
  extractor: string,
  repo: string,
  scope: readonly string[],
  args: readonly string[] = [],
  env: Readonly<Record<string, string>> = {},
): Promise<Extraction> => {
  const { stdout, stderr } = await runExtractorProcess(
    process.execPath,
    [extractor, repo, ...effectiveScopeArgumentsOf(scope), ...args],
    env,
  );
  return { document: readGraphDocument(JSON.parse(stdout)), stderr };
};

export interface Extractor extends CachedExtractor {
  readonly claimsAnyOf: (inScope: readonly string[], files: readonly string[]) => boolean;
  readonly readsInParallel: boolean;
  readonly prepareBase?: BasePreparation;
  readonly skipNote?: () => string | undefined;
  readonly notes?: () => readonly string[];
  readonly extract: (repo: string, scope: readonly string[]) => Promise<GraphDocument>;
}

/** An extractor writes each line for the reader to stderr, with this prefix. */
const notesIn = (stderr: string): readonly string[] =>
  stderr.split('\n').filter((line) => line.startsWith('callmap '));

/** An extractor process that prints its document, and the notes of every run so far. */
export const notingExtractionOf = (
  extractor: string,
  envOf: () => Readonly<Record<string, string>>,
): Pick<Extractor, 'extract' | 'notes'> => {
  const notes = new Set<string>();
  return {
    notes: () => [...notes],
    extract: async (repo, scope) => {
      const { document, stderr } = await extractionOf(extractor, repo, scope, [], envOf());
      for (const note of notesIn(stderr)) notes.add(note);
      return document;
    },
  };
};

export const once = <T>(read: () => T): (() => T) => {
  let done: { readonly value: T } | undefined;
  return () => (done ??= { value: read() }).value;
};
