import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { commitFile, conformanceRepo, git } from './fixture-repo.ts';
import { tempDir } from './temp-dir.ts';

const FIELD_RUN = fileURLToPath(new URL('../packages/gates/src/field-run.ts', import.meta.url));
const CALLMAP_TS = fileURLToPath(new URL('../callmap-ts/src/cli.ts', import.meta.url));

const REVIEW_COMMAND = [process.execPath, CALLMAP_TS] as const;

const FIELD_REPOS = fileURLToPath(new URL('../docs/research/field-repos/', import.meta.url));

interface ListEntry {
  readonly url: string;
  readonly branchCommit: string;
  readonly baseCommit: string;
}

interface FieldRun {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly record: string;
  readonly leftInTemp: readonly string[];
}

const runFieldRun = (args: readonly string[], env: NodeJS.ProcessEnv = {}) => {
  const temp = tempDir('callmap-field-temp-');
  const finished = spawnSync(process.execPath, [FIELD_RUN, ...args], {
    encoding: 'utf8',
    env: { ...process.env, TMPDIR: temp, XDG_CACHE_HOME: tempDir('callmap-cache-'), ...env },
  });
  return { ...finished, leftInTemp: readdirSync(temp) };
};

const fieldRunOf = (entries: readonly ListEntry[]): FieldRun => {
  const folder = tempDir('callmap-field-run-');
  const list = join(folder, 'repos.json');
  const out = join(folder, 'field-record.md');
  writeFileSync(list, JSON.stringify(entries));
  const finished = runFieldRun([
    '--list',
    list,
    '--distribution',
    'callmap-ts',
    '--version',
    '0.1.0',
    '--out',
    out,
    ...REVIEW_COMMAND,
  ]);
  return {
    status: finished.status,
    stdout: finished.stdout,
    stderr: finished.stderr,
    record: existsSync(out) ? readFileSync(out, 'utf8') : '',
    leftInTemp: finished.leftInTemp,
  };
};

const maskedRecordOf = (record: string): string =>
  record
    .replace(/^- System: .+$/m, '- System: <system>')
    .replace(/^- Processor: .+$/m, '- Processor: <processor>')
    .replace(/TypeScript \d+\.\d+\.\d+/g, 'TypeScript <checker version>')
    .replace(/: \d+\.\d s$/gm, ': <time>');

let shop: ListEntry = { url: '', branchCommit: '', baseCommit: '' };

beforeAll(() => {
  const repo = conformanceRepo('typescript/review');
  commitFile(repo, 'seed.rb', 'puts "seed"\n');
  shop = {
    url: repo,
    branchCommit: git(repo, 'rev-parse', 'feature'),
    baseCommit: git(repo, 'rev-parse', 'main'),
  };
});

describe('the field run command', () => {
  it('writes a field record with the commits, the exit code, the notes, the 2 run times and the resolution rate of each repo', () => {
    const run = fieldRunOf([shop]);
    expect(run.stderr).toBe('');
    expect(run.status).toBe(0);
    expect(run.stdout).toBe(`ok ${shop.url}\n`);
    expect(maskedRecordOf(run.record)).toBe(
      [
        '# Field record',
        '',
        '- Distribution: `callmap-ts`',
        '- Version: `0.1.0`',
        '- Checker: TypeScript <checker version>',
        '- System: <system>',
        '- Processor: <processor>',
        '',
        `## ${shop.url}`,
        '',
        `- Branch commit: \`${shop.branchCommit}\``,
        `- Base commit: \`${shop.baseCommit}\``,
        '- Exit code: 0',
        '- First review: <time>',
        '- Cached review: <time>',
        '- Resolution rate: TypeScript <checker version>, 90.0%, 9 of 10 calls proved',
        '',
        'Notes:',
        '',
        '- callmap-ts read only the TypeScript files. Run callmap-rb review for the Ruby files.',
        '',
      ].join('\n'),
    );
  });

  it('writes a section with the exit code and the message of a repo whose review fails, runs the next repo, exits with code 1 and removes each clone', () => {
    const broken = { ...shop, baseCommit: 'no-such-commit' };
    const run = fieldRunOf([broken, shop]);
    expect(run.status).toBe(1);
    expect(run.stdout).toBe(`FAIL ${broken.url}\nok ${shop.url}\n`);
    const [, failed = '', passed = ''] = run.record.split('\n## ');
    expect(failed).toContain('- Base commit: `no-such-commit`\n- Exit code: 1\n');
    expect(failed).toMatch(/\nMessage:\n\n```\n.*no-such-commit[^]*\n```\n/);
    expect(passed).toContain('- Exit code: 0\n');
    expect(passed).toMatch(/- Cached review: \d+\.\d s\n/);
    expect(run.leftInTemp).toEqual([]);
  });

  describe.each([
    ['typescript.json', 'https://github.com/apache/echarts'],
    ['go.json', 'https://github.com/go-gitea/gitea'],
    ['ruby.json', 'https://github.com/mastodon/mastodon'],
  ])('the list file %s of the research folder', (listFile, auditRepo) => {
    it('holds 5 repos at pinned commits, with the audit repo first, in the format of the command', () => {
      const out = join(tempDir('callmap-field-run-'), 'field-record.md');
      const run = runFieldRun(
        [
          '--list',
          join(FIELD_REPOS, listFile),
          '--distribution',
          'callmap-ts',
          '--version',
          '0.1.0',
          '--out',
          out,
          'no-review-command',
        ],
        { GIT_ALLOW_PROTOCOL: 'file' },
      );
      expect(run.stderr).toBe('');
      const urls = run.stdout.split('\n').filter((line) => line !== '');
      expect(urls).toHaveLength(5);
      expect(urls[0]).toBe(`FAIL ${auditRepo}`);
      const commits = [
        ...readFileSync(out, 'utf8').matchAll(/^- (?:Branch|Base) commit: `(.*)`$/gm),
      ].map(([, commit = '']) => commit);
      expect(commits).toHaveLength(10);
      expect(commits.filter((commit) => !/^[0-9a-f]{40}$/.test(commit))).toEqual([]);
    });
  });
});
