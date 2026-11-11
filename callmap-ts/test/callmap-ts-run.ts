import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { reviewInputOfPage } from '@callmap/review-input';
import type { ReviewInput } from '@callmap/review-input';
import { graphDocumentProblemsOf, reviewInputProblemsOf } from '../../test/schemas.ts';
import { tempDir } from '../../test/temp-dir.ts';

const CLI = fileURLToPath(new URL('../src/cli.ts', import.meta.url));

export interface Opener {
  readonly bin: string;
  readonly marker: string;
}

export const fakeOpener = (): Opener => {
  const bin = tempDir('callmap-opener-');
  const marker = join(bin, 'opened');
  for (const name of ['xdg-open', 'open']) {
    const path = join(bin, name);
    writeFileSync(path, `#!/bin/sh\nprintf '%s' "$1" > '${marker}'\n`);
    chmodSync(path, 0o755);
  }
  return { bin, marker };
};

const requireNoProblems = (what: string, problems: readonly string[]): void => {
  if (problems.length > 0)
    throw new Error(`${what} does not match its JSON Schema: ${problems.join(', ')}`);
};

const cachedGraphDocumentsIn = (cacheHome: string): readonly string[] => {
  const folder = join(cacheHome, 'callmap-ts');
  if (!existsSync(folder)) return [];
  return readdirSync(folder, { recursive: true, encoding: 'utf8' })
    .filter((entry) => entry.endsWith('.json'))
    .map((entry) => join(folder, entry));
};

const requireOutputsMatchSchemas = (page: string, cacheHome: string): void => {
  for (const entry of cachedGraphDocumentsIn(cacheHome))
    requireNoProblems(
      `the cached graph document ${entry}`,
      graphDocumentProblemsOf(JSON.parse(readFileSync(entry, 'utf8'))),
    );
  requireNoProblems(
    `the review input of ${page}`,
    reviewInputProblemsOf(reviewInputOfPage(readFileSync(page, 'utf8'))),
  );
};

/** Run callmap-ts from its source, and check that the page and the cache entries match their JSON Schemas. */
export const runCallmapTs = (
  args: readonly string[],
  opener?: Opener,
  cacheHome: string = tempDir('callmap-cache-'),
  env: NodeJS.ProcessEnv = {},
) => {
  const finished = spawnSync(process.execPath, [CLI, ...args], {
    encoding: 'utf8',
    env: {
      ...process.env,
      XDG_CACHE_HOME: cacheHome,
      ...(opener === undefined
        ? {}
        : { PATH: `${opener.bin}${delimiter}${process.env['PATH'] ?? ''}` }),
      ...env,
    },
  });
  if (args[0] === 'review' && finished.status === 0)
    requireOutputsMatchSchemas(finished.stdout.trim(), cacheHome);
  return finished;
};

export const reviewHtmlOf = (repo: string, ...flags: readonly string[]): string => {
  const out = join(tempDir('callmap-out-'), 'review.html');
  const finished = runCallmapTs(['review', repo, '--no-open', '--out', out, ...flags]);
  if (finished.status !== 0) throw new Error(finished.stderr);
  return readFileSync(out, 'utf8');
};

export const reviewInputOf = (repo: string, ...flags: readonly string[]): ReviewInput =>
  reviewInputOfPage(reviewHtmlOf(repo, ...flags));
