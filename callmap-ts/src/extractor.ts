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
): Promise<FinishedExtractorProcess> =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
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
): Promise<Extraction> => {
  const { stdout, stderr } = await runExtractorProcess(process.execPath, [
    extractor,
    repo,
    ...effectiveScopeArgumentsOf(scope),
    ...args,
  ]);
  return { document: readGraphDocument(JSON.parse(stdout)), stderr };
};

export interface Extractor extends CachedExtractor {
  readonly claimsAnyOf: (inScope: readonly string[], files: readonly string[]) => boolean;
  readonly prepareBase?: BasePreparation;
  readonly extract: (repo: string, scope: readonly string[]) => Promise<GraphDocument>;
}
