#!/usr/bin/env node
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const USAGE = 'usage: release-assets <tag> <out folder> <conformance argument>...';

const REPO_ROOT = join(import.meta.dirname, '..');
const CONFORMANCE = join(REPO_ROOT, 'packages', 'conformance', 'src', 'cli.ts');
const RELEASE_TAG = /^v(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/;

const ASSETS: readonly (readonly [name: string, source: string])[] = [
  ['page-template.html', 'packages/cli/dist/page-template.html'],
  ['graph-document.schema.json', 'packages/graph-document/graph-document.schema.json'],
  ['review-input.schema.json', 'packages/review-input/review-input.schema.json'],
  ['test-globs.json', 'packages/scope/test-globs.json'],
  ['fixture-repos', 'packages/conformance/fixture-repos'],
];

interface Release {
  readonly version: string;
  readonly out: string;
  readonly conformanceArgs: readonly string[];
}

const releaseOf = (args: readonly string[]): Release => {
  const [tag, out, ...conformanceArgs] = args;
  if (tag === undefined || out === undefined || conformanceArgs.length === 0)
    throw new Error(USAGE);
  const version = RELEASE_TAG.exec(tag)?.[1];
  if (version === undefined) throw new Error(`${tag} is not a release tag such as v1.2.0`);
  return { version, out, conformanceArgs };
};

const stageAssets = (folder: string): void => {
  for (const [name, source] of ASSETS) {
    const path = join(REPO_ROOT, source);
    if (!existsSync(path)) throw new Error(`${source} does not exist. Run npm run build first.`);
    cpSync(path, join(folder, name), { recursive: true });
  }
};

const passConformance = (fixtureRepos: string, conformanceArgs: readonly string[]): void => {
  const finished = spawnSync(
    process.execPath,
    [CONFORMANCE, '--fixtures', fixtureRepos, ...conformanceArgs],
    { stdio: 'inherit' },
  );
  if (finished.status !== 0)
    throw new Error('The conformance suite failed, so the release has no assets.');
};

const writeArchive = ({ version, out, conformanceArgs }: Release): void => {
  const name = `callmap-core-assets-${version}`;
  const staging = mkdtempSync(join(tmpdir(), 'callmap-release-assets-'));
  try {
    stageAssets(join(staging, name));
    passConformance(join(staging, name, 'fixture-repos'), conformanceArgs);
    mkdirSync(out, { recursive: true });
    const archive = `${name}.tar.gz`;
    execFileSync('tar', ['-czf', join(out, archive), '-C', staging, name]);
    const sha256 = createHash('sha256')
      .update(readFileSync(join(out, archive)))
      .digest('hex');
    writeFileSync(join(out, `${archive}.sha256`), `${sha256}  ${archive}\n`);
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
};

try {
  writeArchive(releaseOf(process.argv.slice(2)));
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
