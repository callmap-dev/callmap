import { describe, expect, it } from 'vitest';
import {
  dataBlockOf,
  packedSourcesOf,
  pageWithReviewInput,
  REVIEW_INPUT_FORMAT_VERSION,
  reviewInputOfPage,
  unpackedSourcesOf,
  UnknownFormatVersionError,
} from '../src/index.ts';
import type { ReviewInput, Sources } from '../src/index.ts';
import type { GraphDocument } from '@callmap/graph-document';

const documentOf = (functions: readonly string[]): GraphDocument => ({
  language: 'typescript',
  checker: { name: 'TypeScript', version: '6.0.3' },
  scope: [],
  files: ['src/a.ts'],
  functions: functions.map((name, index) => ({
    id: `src/a.ts#${name}`,
    name,
    file: 'src/a.ts',
    firstLine: index + 1,
    lastLine: index + 1,
    sourceHash: name,
  })),
  calls: [],
  openEnds: [],
});

const SOURCES: Sources = {
  branch: { 'src/a.ts': 'const run = () => "</script><b>";\nconst stop = () => 1;\n' },
  base: { 'src/a.ts': 'const run = () => 0;\n' },
};

const inputOf = async (sources: Sources = SOURCES): Promise<ReviewInput> => ({
  formatVersion: REVIEW_INPUT_FORMAT_VERSION,
  base: [documentOf(['run'])],
  branch: [documentOf(['run', 'stop'])],
  packedSources: await packedSourcesOf(sources),
  checkout: {
    branch: 'feature',
    baseName: 'main',
    baseCommit: 'abc1234',
    headCommit: 'def5678',
    uncommitted: false,
  },
  editor: { name: 'vscode', repoRoot: '/home/me/shop' },
});

const pageOf = (block: string): string =>
  `<!doctype html>\n<body>\n<main id="graph"></main>\n${block}\n<script>\nrun()\n</script>\n</body>\n`;

describe('the review input', () => {
  it('starts at format version 1', () => {
    expect(REVIEW_INPUT_FORMAT_VERSION).toBe(1);
  });

  it('reads back from a page the review input that the data block holds', async () => {
    const input = await inputOf();
    expect(reviewInputOfPage(pageOf(dataBlockOf(input)))).toEqual(input);
  });

  it('writes the data block as one script element of JSON, on one line', async () => {
    const block = dataBlockOf(await inputOf());
    expect(block).toMatch(
      /^<script type="application\/json" id="reader-page-data">[^\n]*<\/script>$/,
    );
  });

  it('writes each < of the JSON as \\u003c, so that no text can close the data block', async () => {
    const input: ReviewInput = {
      ...(await inputOf()),
      editor: { name: 'vscode', repoRoot: '/a</script>b' },
    };
    const block = dataBlockOf(input);
    expect(block.slice('<script'.length, -'</script>'.length)).not.toContain('<');
    expect(block).toContain('/a\\u003c/script>b');
    expect(reviewInputOfPage(pageOf(block)).editor.repoRoot).toBe('/a</script>b');
  });

  it('puts a new review input in the place of the data block of a page', async () => {
    const input = await inputOf();
    const changed = { ...input, checkout: { ...input.checkout, branch: 'other' } };
    const page = pageWithReviewInput(pageOf(dataBlockOf(input)), changed);
    expect(reviewInputOfPage(page)).toEqual(changed);
    expect(page).toContain('<script>\nrun()\n</script>');
  });

  it('fails on a page that holds no data block', () => {
    expect(() => reviewInputOfPage('<!doctype html><body></body>')).toThrow(
      'the page holds no data block',
    );
  });
});

describe('the packed sources', () => {
  it('unpack to the source texts that were packed', async () => {
    expect(await unpackedSourcesOf(await packedSourcesOf(SOURCES))).toEqual(SOURCES);
  });

  it('hold no plain source text, because gzip and base64 pack them', async () => {
    const packed = await packedSourcesOf(SOURCES);
    expect(packed).toMatch(/^[A-Za-z0-9+/]+=*$/);
    expect(packed).not.toContain('run');
  });

  it('pack a large text', async () => {
    const large: Sources = { branch: { 'src/big.ts': 'x'.repeat(300_000) + 'ä😀' }, base: {} };
    expect(await unpackedSourcesOf(await packedSourcesOf(large))).toEqual(large);
  });

  it('give the same text for the same sources', async () => {
    expect(await packedSourcesOf(SOURCES)).toBe(await packedSourcesOf(SOURCES));
  });
});

describe('a review input of a format version that the page does not know', () => {
  const withFormatVersion = async (formatVersion: unknown): Promise<string> =>
    pageOf(dataBlockOf(await inputOf())).replace(
      `"formatVersion":${String(REVIEW_INPUT_FORMAT_VERSION)}`,
      `"formatVersion":${JSON.stringify(formatVersion)}`,
    );

  const errorOf = async (formatVersion: unknown): Promise<UnknownFormatVersionError> => {
    try {
      reviewInputOfPage(await withFormatVersion(formatVersion));
    } catch (error) {
      if (error instanceof UnknownFormatVersionError) return error;
      throw error;
    }
    throw new Error(`the page read format version ${String(formatVersion)}`);
  };

  it('fails with a message that names the newer format version and says to update the page', async () => {
    const error = await errorOf(2);
    expect(error.formatVersion).toBe(2);
    expect(error.message).toBe(
      'The review input has format version 2, and this reader page reads only format version 1. Update the reader page.',
    );
  });

  it('fails with a message that names the older format version and says to update the distribution', async () => {
    expect((await errorOf(0)).message).toBe(
      'The review input has format version 0, and this reader page reads only format version 1. Update the distribution that wrote the review input.',
    );
  });

  it('fails on a review input with no format version, and says to update the distribution', async () => {
    expect((await errorOf('one')).message).toBe(
      'The review input has format version "one", and this reader page reads only format version 1. Update the distribution that wrote the review input.',
    );
  });
});
