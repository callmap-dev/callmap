#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { arch, cpus, release, tmpdir, type } from 'node:os';
import { join } from 'node:path';
import { reviewInputOfPage } from '@callmap/review-input';
import { resolutionRatesOf } from '@callmap/review';
import type { GraphDocument } from '@callmap/graph-document';
import { checkerOf } from './checker.ts';
import { fieldRecordOf } from './field-record.ts';
import type { FieldRepo, RepoOutcome } from './field-record.ts';

const USAGE =
  'usage: field-run --list <list file> --distribution <distribution> --version <version> --out <field record> <review command>...';

const VALUE_FLAGS = ['--list', '--distribution', '--version', '--out'];

interface FieldRunSettings {
  readonly list: string;
  readonly distribution: string;
  readonly version: string;
  readonly out: string;
  readonly reviewCommand: readonly string[];
}

const settingsOf = (args: readonly string[]): FieldRunSettings => {
  const values = new Map<string, string>();
  let index = 0;
  for (; index < args.length && args[index]?.startsWith('--') === true; index += 1) {
    const flag = args[index] ?? '';
    if (flag === '--') {
      index += 1;
      break;
    }
    if (!VALUE_FLAGS.includes(flag))
      throw new Error(`${flag} is not a flag of the field run command\n${USAGE}`);
    const value = args[index + 1];
    if (value === undefined || value.startsWith('--'))
      throw new Error(`${flag} needs a value after it`);
    values.set(flag, value);
    index += 1;
  }
  const required = (flag: string): string => {
    const value = values.get(flag);
    if (value === undefined) throw new Error(`The field run command needs ${flag}.\n${USAGE}`);
    return value;
  };
  const reviewCommand = args.slice(index);
  if (reviewCommand.length === 0) throw new Error(USAGE);
  return {
    list: required('--list'),
    distribution: required('--distribution'),
    version: required('--version'),
    out: required('--out'),
    reviewCommand,
  };
};

const LIST_KEYS = ['url', 'branchCommit', 'baseCommit'] as const;

const fieldRepoOf = (entry: unknown, index: number): FieldRepo => {
  const fields =
    typeof entry === 'object' && entry !== null ? (entry as Record<string, unknown>) : {};
  const missing = LIST_KEYS.filter((key) => typeof fields[key] !== 'string' || fields[key] === '');
  if (missing.length > 0)
    throw new Error(
      `The entry ${String(index + 1)} of the list file needs the text fields ${LIST_KEYS.join(', ')}. It has no ${missing.join(', ')}.`,
    );
  return {
    url: String(fields['url']),
    branchCommit: String(fields['branchCommit']),
    baseCommit: String(fields['baseCommit']),
  };
};

const fieldReposOf = (listFile: string): readonly FieldRepo[] => {
  const list: unknown = JSON.parse(readFileSync(listFile, 'utf8'));
  if (!Array.isArray(list) || list.length === 0)
    throw new Error(`The list file ${listFile} must hold a JSON array of at least one repo.`);
  return list.map(fieldRepoOf);
};

interface FinishedRun {
  readonly exitCode: string;
  readonly stderr: string;
  readonly milliseconds: number;
}

const MAX_OUTPUT_BYTES = 1024 * 1024 * 1024;

const timedRun = (program: string, args: readonly string[]): FinishedRun => {
  const start = performance.now();
  const finished = spawnSync(program, args, { encoding: 'utf8', maxBuffer: MAX_OUTPUT_BYTES });
  const milliseconds = performance.now() - start;
  if (finished.error !== undefined)
    return { exitCode: 'none', stderr: finished.error.message, milliseconds };
  const exitCode =
    finished.status === null ? `the signal ${String(finished.signal)}` : String(finished.status);
  return { exitCode, stderr: finished.stderr, milliseconds };
};

interface RepoResult {
  readonly outcome: RepoOutcome;
  readonly documents: readonly GraphDocument[];
}

const failedResult = (repo: FieldRepo, run: FinishedRun, message: string): RepoResult => ({
  outcome: { verdict: 'FAIL', repo, exitCode: run.exitCode, message: message.trimEnd() },
  documents: [],
});

const passed = (run: FinishedRun): boolean => run.exitCode === '0';

const reviewedRepo = (
  repo: FieldRepo,
  reviewCommand: readonly string[],
  work: string,
): RepoResult => {
  const clone = join(work, 'repo');
  const out = join(work, 'review.html');
  const cloned = timedRun('git', ['clone', '--quiet', '--no-checkout', repo.url, clone]);
  if (!passed(cloned)) return failedResult(repo, cloned, `git clone failed: ${cloned.stderr}`);
  const checkedOut = timedRun('git', [
    '-C',
    clone,
    '-c',
    'advice.detachedHead=false',
    'checkout',
    '--quiet',
    repo.branchCommit,
  ]);
  if (!passed(checkedOut))
    return failedResult(repo, checkedOut, `git checkout failed: ${checkedOut.stderr}`);

  const [program = '', ...programArgs] = reviewCommand;
  const reviewArgs = [...programArgs, 'review', clone, '--base', repo.baseCommit, '--out', out];
  const first = timedRun(program, [...reviewArgs, '--no-open', '--no-cache']);
  if (!passed(first)) return failedResult(repo, first, first.stderr);
  let branch: readonly GraphDocument[];
  try {
    branch = reviewInputOfPage(readFileSync(out, 'utf8')).branch;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return failedResult(repo, first, `The field run could not read the reader page: ${reason}`);
  }
  const warm = timedRun(program, [...reviewArgs, '--no-open']);
  if (!passed(warm)) return failedResult(repo, warm, warm.stderr);
  const cached = timedRun(program, [...reviewArgs, '--no-open']);
  if (!passed(cached)) return failedResult(repo, cached, cached.stderr);
  return {
    outcome: {
      verdict: 'ok',
      repo,
      notes: first.stderr.split('\n').filter((line) => line !== ''),
      firstReviewMilliseconds: first.milliseconds,
      cachedReviewMilliseconds: cached.milliseconds,
      resolutionRates: resolutionRatesOf(branch),
    },
    documents: branch,
  };
};

const resultInCleanFolder = (repo: FieldRepo, reviewCommand: readonly string[]): RepoResult => {
  const work = mkdtempSync(join(tmpdir(), 'callmap-field-run-'));
  try {
    return reviewedRepo(repo, reviewCommand, work);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
};

const processorOf = (): string => {
  const cores = cpus();
  return `${String(cores.length)} cores, ${cores[0]?.model.trim() ?? 'unknown model'}`;
};

const runField = (settings: FieldRunSettings): void => {
  const results: RepoResult[] = [];
  for (const repo of fieldReposOf(settings.list)) {
    const result = resultInCleanFolder(repo, settings.reviewCommand);
    process.stdout.write(`${result.outcome.verdict} ${repo.url}\n`);
    results.push(result);
  }
  const head = {
    distribution: settings.distribution,
    version: settings.version,
    checker: checkerOf(results.flatMap(({ documents }) => documents)),
    system: `${type()} ${release()}, ${arch()}`,
    processor: processorOf(),
  };
  writeFileSync(
    settings.out,
    fieldRecordOf(
      head,
      results.map(({ outcome }) => outcome),
    ),
  );
  if (results.some(({ outcome }) => outcome.verdict === 'FAIL')) process.exitCode = 1;
};

try {
  runField(settingsOf(process.argv.slice(2)));
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
