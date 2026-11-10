import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { assets } from './assets.ts';
import { notingExtractionOf, once } from './extractor.ts';
import type { Extractor } from './extractor.ts';
import type { BaseWorktree } from './git.ts';
import { GO_FILES } from './languages.ts';

const goVersionOnPath = (): string | undefined => {
  const finished = spawnSync('go', ['version'], {
    encoding: 'utf8',
    env: { ...process.env, GOTOOLCHAIN: 'local', GOPROXY: 'off' },
  });
  return finished.error === undefined && finished.status === 0 ? finished.stdout : undefined;
};

/** The go line of the go.mod of the Go extractor. An older go cannot build it. */
const GO_THAT_BUILDS_THE_EXTRACTOR = [1, 26] as const;

const goOlderThanTheExtractorNeeds = (goVersion: string): string | undefined => {
  const found = /go(\d+)\.(\d+)\S*/.exec(goVersion);
  if (found === null) return undefined;
  const [major, minor] = GO_THAT_BUILDS_THE_EXTRACTOR;
  const older =
    Number(found[1]) < major || (Number(found[1]) === major && Number(found[2]) < minor);
  return older ? found[0] : undefined;
};

const goSkipNoteOf = (goVersion: string | undefined): string | undefined => {
  if (goVersion === undefined)
    return 'callmap skipped the Go files, because go is not on the PATH.';
  const older = goOlderThanTheExtractorNeeds(goVersion);
  if (older === undefined) return undefined;
  const [major, minor] = GO_THAT_BUILDS_THE_EXTRACTOR;
  return `callmap skipped the Go files, because the Go extractor needs go ${major}.${minor} or later, and the go on the PATH is ${older}.`;
};

const isTrimpath = (flag: string): boolean => {
  const name = flag.replace(/^-/, '').split('=')[0];
  return name === '-trimpath' || name === 'trimpath';
};

/** The flags that `KeptGoFlags` in callmap-go/internal/extractor/load.go keeps, so the two agree. */
const keptGoFlags = (flags: string): string =>
  flags
    .split(/\s+/)
    .filter(
      (flag) =>
        flag !== '' && !flag.startsWith('-mod=') && !flag.startsWith('--mod=') && !isTrimpath(flag),
    )
    .join(' ');

const GO_BUILD_SETTINGS = ['CGO_ENABLED', 'GOOS', 'GOARCH', 'GOEXPERIMENT', 'GOFLAGS'] as const;

/** The go env settings that choose the files of one build, as the load of the repo sees them. */
const goBuildSettings = (): readonly string[] => {
  const finished = spawnSync('go', ['env', ...GO_BUILD_SETTINGS], {
    encoding: 'utf8',
    env: { ...process.env, GOTOOLCHAIN: 'local' },
  });
  const values = finished.error === undefined ? finished.stdout.split('\n') : [];
  return GO_BUILD_SETTINGS.map((setting, index) => {
    const value = values[index] ?? '';
    return `${setting}=${setting === 'GOFLAGS' ? keptGoFlags(value) : value}`;
  });
};

/**
 * A go.work that git does not track decides how the go tool loads the modules of the branch, so the
 * base loads them the same way.
 */
const GO_WORKSPACE_FILES = ['go.work', 'go.work.sum'];

const pathInWorktree = (path: string, roots: readonly string[], worktree: string): string => {
  const root = roots.find((each) => path === each || path.startsWith(`${each}/`));
  return root === undefined ? path : `${worktree}${path.slice(root.length)}`;
};

const DIRECTIVE = /^(\s*(use|replace)\b)(.*)$/;
const GO_WORK_PATH = /(["`])(.*?)\1|([^\s"`()]+)/;

const goWorkOfWorktree = (goWork: string, root: string, worktree: string): string => {
  const roots = [root, realpathSync(root)];
  const rewriteFirstPath = (text: string): string =>
    text.replace(GO_WORK_PATH, (path, quote?: string, quoted?: string, bare?: string) =>
      quote === undefined || quoted === undefined
        ? pathInWorktree(bare ?? path, roots, worktree)
        : `${quote}${pathInWorktree(quoted, roots, worktree)}${quote}`,
    );
  const rewriteTarget = (text: string): string => {
    const arrow = text.indexOf('=>');
    return arrow === -1
      ? text
      : `${text.slice(0, arrow + 2)}${rewriteFirstPath(text.slice(arrow + 2))}`;
  };
  const rewriteEntry = (directive: string, text: string): string =>
    directive === 'use' ? rewriteFirstPath(text) : rewriteTarget(text);
  let block: string | undefined;
  return goWork
    .split('\n')
    .map((line) => {
      if (block !== undefined) {
        if (line.trim().startsWith(')')) {
          block = undefined;
          return line;
        }
        return rewriteEntry(block, line);
      }
      const [, before, directive, rest] = DIRECTIVE.exec(line) ?? [];
      if (before === undefined || directive === undefined || rest === undefined) return line;
      if (/^\s*\(\s*(\/\/.*)?$/.test(rest)) {
        block = directive;
        return line;
      }
      return `${before}${rewriteEntry(directive, rest)}`;
    })
    .join('\n');
};

const copyGoWorkspaceFiles = ({ checkout, path, untrackedEntries }: BaseWorktree): void => {
  for (const file of GO_WORKSPACE_FILES) {
    if (untrackedEntries.includes(file) && !existsSync(join(path, file))) {
      const text = readFileSync(join(checkout, file), 'utf8');
      const copy = file === 'go.work' ? goWorkOfWorktree(text, checkout, path) : text;
      writeFileSync(join(path, file), copy);
    }
  }
};

export const goExtractor = (): Extractor => {
  const goVersion = once(goVersionOnPath);
  const buildSettings = once(goBuildSettings);
  return {
    language: 'go',
    dependencyFiles: ['go.work', '**/go.sum', '**/go.work.sum'],
    get options() {
      return buildSettings();
    },
    version: () => assets.goExtractorVersion(goVersion() ?? ''),
    claimsAnyOf: GO_FILES.claimsAnyOf,
    readsInParallel: false,
    prepareBase: copyGoWorkspaceFiles,
    skipNote: () => goSkipNoteOf(goVersion()),
    ...notingExtractionOf(assets.goExtractor, () => assets.goExtractorEnv(goVersion() ?? '')),
  };
};
