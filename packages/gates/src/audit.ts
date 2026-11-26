#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import type { GraphDocument } from '@callmap/graph-document';
import { reviewInputOfPage, unpackedSourcesOf } from '@callmap/review-input';
import { auditSheetOf } from './audit-sheet.ts';
import { candidateLinesOf, inFileAndLineOrder } from './candidate-lines.ts';
import { MAX_SEED, seededSampleOf } from './seeded-sample.ts';

const USAGE =
  'usage: audit <reader page> --seed <seed> --repo <repo> --distribution <distribution> --version <version> --out <audit sheet> [--count <count>]';

const DEFAULT_COUNT = 200;

interface AuditSettings {
  readonly page: string;
  readonly seed: number;
  readonly count: number;
  readonly repo: string;
  readonly distribution: string;
  readonly version: string;
  readonly out: string;
}

const VALUE_FLAGS = ['--seed', '--count', '--repo', '--distribution', '--version', '--out'];

const flagValuesOf = (args: readonly string[]) => {
  const values = new Map<string, string>();
  const positionals: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index] ?? '';
    if (!arg.startsWith('--')) {
      positionals.push(arg);
      continue;
    }
    if (!VALUE_FLAGS.includes(arg))
      throw new Error(`${arg} is not a flag of the audit command\n${USAGE}`);
    const value = args[index + 1];
    if (value === undefined || value.startsWith('--'))
      throw new Error(`${arg} needs a value after it`);
    values.set(arg, value);
    index += 1;
  }
  return { values, positionals };
};

const requiredValue = (values: ReadonlyMap<string, string>, flag: string): string => {
  const value = values.get(flag);
  if (value === undefined) throw new Error(`The audit command needs ${flag}.\n${USAGE}`);
  return value;
};

const wholeNumberOf = (flag: string, text: string, least: number, most: number): number => {
  const value = Number(text);
  if (!/^\d+$/.test(text) || value < least || value > most)
    throw new Error(
      `${flag} takes a whole number from ${String(least)} to ${String(most)}, not ${text}.`,
    );
  return value;
};

const settingsOf = (args: readonly string[]): AuditSettings => {
  const { values, positionals } = flagValuesOf(args);
  const [page, ...extra] = positionals;
  if (page === undefined || extra.length > 0) throw new Error(USAGE);
  return {
    page,
    seed: wholeNumberOf('--seed', requiredValue(values, '--seed'), 0, MAX_SEED),
    count: wholeNumberOf(
      '--count',
      values.get('--count') ?? String(DEFAULT_COUNT),
      1,
      Number.MAX_SAFE_INTEGER,
    ),
    repo: requiredValue(values, '--repo'),
    distribution: requiredValue(values, '--distribution'),
    version: requiredValue(values, '--version'),
    out: requiredValue(values, '--out'),
  };
};

const checkerOf = (documents: readonly GraphDocument[]): string =>
  [...new Set(documents.map(({ checker }) => `${checker.name} ${checker.version}`))].join(', ');

const writeAuditSheet = async (settings: AuditSettings): Promise<void> => {
  const input = reviewInputOfPage(readFileSync(settings.page, 'utf8'));
  const sources = await unpackedSourcesOf(input.packedSources);
  const candidates = candidateLinesOf(sources.branch, input.branch);
  if (candidates.length < settings.count)
    throw new Error(
      `The files in scope hold ${String(candidates.length)} lines that can hold a call, fewer than the count ${String(settings.count)}.`,
    );
  const sample = inFileAndLineOrder(seededSampleOf(candidates, settings.count, settings.seed));
  const head = {
    repo: settings.repo,
    commit: input.checkout.headCommit,
    distribution: settings.distribution,
    version: settings.version,
    checker: checkerOf(input.branch),
    seed: settings.seed,
    count: settings.count,
  };
  writeFileSync(settings.out, auditSheetOf(head, sample, input.branch));
  process.stdout.write(`${settings.out}\n`);
};

try {
  await writeAuditSheet(settingsOf(process.argv.slice(2)));
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
