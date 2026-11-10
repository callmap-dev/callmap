import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { readArguments, usageOf } from '../src/arguments.ts';
import { runCallmap } from './reader-page.ts';
import { tempDir } from '../../../test/temp-dir.ts';

const CONTRACT = readFileSync(
  new URL('../../../docs/command-contract.md', import.meta.url),
  'utf8',
);

const messageOf = (args: readonly string[]): string => {
  try {
    readArguments(args, '/repo', 'callmap');
  } catch (error) {
    if (error instanceof Error) return error.message;
  }
  throw new Error(`callmap review accepts ${args.join(' ')}`);
};

describe('the command contract', () => {
  it('gives the command and the flags that every distribution takes', () => {
    expect(CONTRACT).toContain(
      'review [<repo>] [--base <commit>] [--scope <glob>]... [--out <file>] [--no-open] [--no-cache] [--editor <name>] [--tests]',
    );
    expect(CONTRACT).toContain('--tsconfig <file>');
  });

  it('names every flag of the usage line that the CLI prints', () => {
    const flags = usageOf('callmap').match(/--[a-z-]+/g) ?? [];
    expect(flags.length).toBeGreaterThan(0);
    for (const flag of flags) expect(CONTRACT, flag).toContain(`\`${flag}`);
  });

  it('gives each message that the CLI prints for arguments that it cannot read', () => {
    expect(CONTRACT).toContain(messageOf(['help']));
    expect(CONTRACT).toContain(messageOf(['review', '--base']).replace('--base', '<flag>'));
    expect(CONTRACT).toContain(messageOf(['review', '--editor', 'vim']));
    expect(CONTRACT).toContain(messageOf(['review', '--nope']).replace('--nope', '<argument>'));
    expect(CONTRACT).toContain(
      messageOf(['review', 'one', 'two']).replace("'two'", "'<argument>'"),
    );
  });

  it('gives the exit code and the message of a review that cannot run', () => {
    const folder = tempDir('callmap-plain-');
    const finished = runCallmap(['review', folder, '--no-open']);
    expect(finished.status).toBe(1);
    expect(CONTRACT).toContain('exits with code 1');
    expect(CONTRACT).toContain(finished.stderr.trim().replace(folder, '<folder>'));
  });

  it('says that each < in the JSON of the data block becomes \\u003c', () => {
    expect(CONTRACT).toContain('Each `<` in the JSON becomes `\\u003c`.');
  });
});
