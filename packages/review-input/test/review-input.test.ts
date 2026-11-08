import { describe, expect, it } from 'vitest';
import {
  dataBlockOf,
  packedSourcesOf,
  packedReviewInputOf,
  pageOfTemplate,
  REVIEW_INPUT_FORMAT_VERSION,
  REVIEW_INPUT_MARKER,
  TEMPLATE_DATA_BLOCK,
  reviewInputOfPage,
  unpackedReviewInputOf,
  unpackedSourcesOf,
  UnknownFormatVersionError,
} from '../src/index.ts';
import type { ReviewInput, Sources, UnpackedReviewInput } from '../src/index.ts';
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

  it('fails on a page that holds no data block', () => {
    expect(() => reviewInputOfPage('<!doctype html><body></body>')).toThrow(
      'the page holds no data block',
    );
  });
});

describe('the page template', () => {
  const TEMPLATE = `<!doctype html>\n<body>\n<script type="application/json" id="reader-page-data">${REVIEW_INPUT_MARKER}</script>\n<script>\nrun()\n</script>\n</body>\n`;

  it('marks the place for the review input inside the data block', () => {
    expect(REVIEW_INPUT_MARKER).toBe('{{CALLMAP_REVIEW_INPUT}}');
    expect(TEMPLATE_DATA_BLOCK).toBe(
      '<script type="application/json" id="reader-page-data">{{CALLMAP_REVIEW_INPUT}}</script>',
    );
  });

  it('gives the page with the escaped review input at the marker and no other change', async () => {
    const input: ReviewInput = {
      ...(await inputOf()),
      editor: { name: 'vscode', repoRoot: '/a</script>b' },
    };
    const page = pageOfTemplate(TEMPLATE, input);
    const [before = '', after = ''] = TEMPLATE.split(REVIEW_INPUT_MARKER);
    expect(page.startsWith(`${before}{"formatVersion":1,`)).toBe(true);
    expect(page.endsWith(`}${after}`)).toBe(true);
    expect(page).toContain('"repoRoot":"/a\\u003c/script>b"');
    expect(reviewInputOfPage(page)).toEqual(input);
  });

  it('puts the review input only at the marker of the data block, also when the page script holds the marker', async () => {
    const input = await inputOf();
    const template = TEMPLATE.replace('run()', `run('${REVIEW_INPUT_MARKER}')`);
    const page = pageOfTemplate(template, input);
    expect(page).toContain(`<script>\nrun('${REVIEW_INPUT_MARKER}')\n</script>`);
    expect(reviewInputOfPage(page)).toEqual(input);
  });

  it('fails on a template with no data block', async () => {
    const input = await inputOf();
    expect(() =>
      pageOfTemplate(`<!doctype html><body>${REVIEW_INPUT_MARKER}</body>`, input),
    ).toThrow(`the page template holds the data block ${TEMPLATE_DATA_BLOCK} 0 times, not once`);
  });

  it('fails on a template with 2 data blocks', async () => {
    const input = await inputOf();
    expect(() => pageOfTemplate(`${TEMPLATE}${TEMPLATE_DATA_BLOCK}`, input)).toThrow(
      `the page template holds the data block ${TEMPLATE_DATA_BLOCK} 2 times, not once`,
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

  it('fail with a clear message when they do not unpack to the sources of both sides', async () => {
    const packedOf = async (value: unknown): Promise<string> => packedSourcesOf(value as Sources);
    await expect(unpackedSourcesOf(await packedOf([]))).rejects.toThrow(
      'The packed sources are malformed: "branch" is not an object of source texts.',
    );
    await expect(unpackedSourcesOf(await packedOf({ branch: {}, base: 'a' }))).rejects.toThrow(
      'The packed sources are malformed: "base" is not an object of source texts.',
    );
  });
});

describe('the review input with its sources unpacked', () => {
  it('packs to the review input, and unpacks back to the same value', async () => {
    const input = await inputOf();
    const { packedSources: _packed, ...rest } = input;
    const unpacked: UnpackedReviewInput = { ...rest, sources: SOURCES };
    expect(await unpackedReviewInputOf(input)).toEqual(unpacked);
    expect(await packedReviewInputOf(unpacked)).toEqual(input);
  });
});

describe('a review input whose top-level shape is wrong', () => {
  const pageWith = async (key: string, value: unknown): Promise<string> =>
    pageOf(dataBlockOf({ ...(await inputOf()), [key]: value }));

  it.each([
    ['base', undefined, '"base" is not a list of graph documents'],
    ['branch', {}, '"branch" is not a list of graph documents'],
    ['packedSources', { branch: {}, base: {} }, '"packedSources" is not a text'],
    ['checkout', 'main', '"checkout" is not an object'],
    ['editor', null, '"editor" is not an object'],
  ])('fails with a message that names the field %s', async (key, value, problem) => {
    const page = await pageWith(key, value);
    expect(() => reviewInputOfPage(page)).toThrow(`The review input is malformed: ${problem}.`);
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
