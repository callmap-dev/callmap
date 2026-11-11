/**
 * The Go extractor of callmap-go as its tests start it. The extractor is the Go package
 * internal/extractor, which loads the repo with golang.org/x/tools/go/packages and ties each call
 * with go/types (ADR-0024). The tests build cmd/callmap-extract-go, run it as a separate process,
 * and read what it wrote back through the contract of the core, so a document the core would refuse
 * fails the test.
 */

import { spawnSync } from 'node:child_process';
import type { SpawnSyncReturns } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { readGraphDocument } from '@callmap/graph-document';
import type { GraphDocument } from '@callmap/graph-document';

/** Thrown when the Go extractor cannot be built, or refuses the repo it was pointed at. */
export class GoExtractionError extends Error {
  override readonly name = 'GoExtractionError';
}

export interface GoExtractOptions {
  /** The root of the repo to read. Every path in the document is relative to it. */
  readonly repo: string;
  /** The globs that limit which files enter the document. Empty takes the whole repo. */
  readonly scope?: readonly string[];
}

const PROGRAM = join(import.meta.dirname, '..');

const EXTRACTOR_PACKAGE = './cmd/callmap-extract-go';

let built: string | undefined;

/** Remove the compiled extractor and its directory. The next call builds it again. */
export const removeGoExtractorBinary = (): void => {
  if (built === undefined) return;
  rmSync(dirname(built), { recursive: true, force: true });
  built = undefined;
  process.off('exit', removeGoExtractorBinary);
};

const isTrimpath = (flag: string): boolean => {
  const name = flag.replace(/^-/, '').split('=')[0];
  return name === '-trimpath' || name === 'trimpath';
};

/** The same filter as `KeptGoFlags` in callmap-go/internal/extractor/load.go, so the build and the load agree. */
const keptGoFlags = (flags: string): string =>
  flags
    .split(/\s+/)
    .filter(
      (flag) =>
        flag !== '' && !flag.startsWith('-mod=') && !flag.startsWith('--mod=') && !isTrimpath(flag),
    )
    .join(' ');

/** A GOFLAGS from `go env -w` is in the go env file, not in the environment. */
const effectiveGoFlags = (): string => {
  const finished = spawnSync('go', ['env', 'GOFLAGS'], {
    encoding: 'utf8',
    env: { ...process.env, GOTOOLCHAIN: 'local' },
  });
  return finished.error === undefined ? finished.stdout.trim() : '';
};

/**
 * The build reads only the vendored modules of the extractor, with the local go, so it needs no
 * network. GOWORK is off because the package can sit inside a repo with its own go.work. GOFLAGS
 * is never empty, because the go tool reads an empty GOFLAGS from the go env file instead.
 */
const buildEnv = (): NodeJS.ProcessEnv => ({
  ...process.env,
  GOFLAGS: ` ${keptGoFlags(effectiveGoFlags())}`,
  GOTOOLCHAIN: 'local',
  GOPROXY: 'off',
  GOWORK: 'off',
});

const buildFailureOf = (finished: SpawnSyncReturns<string>): string | undefined => {
  if (finished.error !== undefined)
    return `the Go toolchain could not be started: ${finished.error.message}`;
  if (finished.status !== 0) return `the Go extractor did not build: ${finished.stderr.trim()}`;
  return undefined;
};

const buildGoExtractor = (binary: string): void => {
  const failure = buildFailureOf(
    spawnSync('go', ['build', '-o', binary, EXTRACTOR_PACKAGE], {
      cwd: PROGRAM,
      encoding: 'utf8',
      env: buildEnv(),
    }),
  );
  if (failure !== undefined) throw new GoExtractionError(failure);
};

/**
 * A fresh directory per process keeps two test files that build at the same time from writing over
 * each other's binary. The process removes that directory when it exits, so a run leaves nothing
 * in the temp dir. The Go build cache makes every build after the first a relink.
 */
export const goExtractorBinary = (): string => {
  if (built !== undefined) return built;
  const folder = mkdtempSync(join(tmpdir(), 'callmap-extract-go-'));
  const binary = join(folder, 'callmap-extract-go');
  try {
    buildGoExtractor(binary);
  } catch (error) {
    rmSync(folder, { recursive: true, force: true });
    throw error;
  }
  process.once('exit', removeGoExtractorBinary);
  built = binary;
  return binary;
};

/**
 * Read a repo with the Go extractor and return the graph document it emitted. The scope is read as
 * it is given, so a caller that wants the tests left out puts the test globs in it.
 */
export const extractGo = (options: GoExtractOptions): GraphDocument => {
  const scope = options.scope ?? [];
  const args = [options.repo, ...scope.flatMap((glob) => ['--scope', glob]), '--tests'];
  const finished = spawnSync(goExtractorBinary(), args, {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 1024,
  });
  if (finished.status !== 0) throw new GoExtractionError(finished.stderr.trim());
  return readGraphDocument(JSON.parse(finished.stdout));
};
