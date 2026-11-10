import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readGraphDocument } from '@callmap/graph-document';
import type { GraphDocument } from '@callmap/graph-document';

/**
 * The Ruby extractor of callmap-rb as its tests run it: the Ruby rules in lib/callmap_rb/extractor/,
 * in a ruby process of their own, with the gem source on the load path and no gem install.
 */
const LIB = fileURLToPath(new URL('../lib', import.meta.url));

const rubyOutputOf = (program: string, ...args: readonly string[]): string => {
  const finished = spawnSync(
    'ruby',
    ['-I', LIB, '-r', 'json', '-r', 'callmap_rb/extractor/extract', '-e', program, ...args],
    { encoding: 'utf8', maxBuffer: 1024 * 1024 * 1024 },
  );
  if (finished.error !== undefined) throw finished.error;
  if (finished.status !== 0) throw new Error(finished.stderr.trim());
  return finished.stdout;
};

export interface ExtractOptions {
  /** The root of the repo to read. Every path in the document is relative to it. */
  readonly repo: string;
  /** The globs that limit which files enter the document. Empty takes the whole repo. */
  readonly scope?: readonly string[];
}

/** The graph document of the Ruby rules, read through the contract of the core. */
export const extractRuby = ({ repo, scope = [] }: ExtractOptions): GraphDocument =>
  readGraphDocument(
    JSON.parse(
      rubyOutputOf(
        'print JSON.generate(CallmapRb::Extractor.read_ruby(ARGV[0], JSON.parse(ARGV[1])).document)',
        resolve(repo),
        JSON.stringify(scope),
      ),
    ),
  );

/** The Ruby files that the walk of the Ruby rules takes, in the order of the walk. */
export const rubyFilesOf = (repo: string): readonly string[] =>
  JSON.parse(
    rubyOutputOf(
      'print JSON.generate(CallmapRb::Extractor::Walk.ruby_tree_of(ARGV[0]).files)',
      resolve(repo),
    ),
  ) as readonly string[];
