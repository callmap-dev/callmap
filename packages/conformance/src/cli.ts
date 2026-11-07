#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import { runSuite } from './suite.ts';
import type { SuiteSettings } from './suite.ts';

const USAGE =
  'usage: conformance [--fixtures <folder>] [--language <language>] [--update] <review command>...';

const FIXTURE_REPOS = fileURLToPath(new URL('../fixture-repos', import.meta.url));

const valueAfter = (args: readonly string[], index: number): string => {
  const value = args[index + 1];
  if (value === undefined || value.startsWith('--'))
    throw new Error(`${args[index] ?? ''} needs a value after it`);
  return value;
};

const settingsOf = (args: readonly string[]): SuiteSettings => {
  let fixtures = FIXTURE_REPOS;
  let language: string | undefined;
  let update = false;
  let index = 0;
  for (; index < args.length && args[index]?.startsWith('--') === true; index += 1) {
    const flag = args[index];
    if (flag === '--') {
      index += 1;
      break;
    }
    if (flag === '--update') update = true;
    else if (flag === '--fixtures') fixtures = valueAfter(args, index++);
    else if (flag === '--language') language = valueAfter(args, index++);
    else throw new Error(`${flag ?? ''} is not a flag of the conformance suite\n${USAGE}`);
  }
  const reviewCommand = args.slice(index);
  if (reviewCommand.length === 0) throw new Error(USAGE);
  return { reviewCommand, fixtures, language, update };
};

try {
  const outcomes = await runSuite(settingsOf(process.argv.slice(2)));
  for (const { fixture, verdict, detail } of outcomes)
    process.stdout.write(`${verdict} ${fixture}\n${detail === '' ? '' : `${detail}\n`}`);
  if (outcomes.some(({ verdict }) => verdict === 'FAIL')) process.exitCode = 1;
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
