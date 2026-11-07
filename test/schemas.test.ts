import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readGraphDocument } from '@callmap/graph-document';
import type { GraphDocument } from '@callmap/graph-document';
import type { ReviewInput } from '@callmap/review-input';
import { graphDocumentProblemsOf, reviewInputProblemsOf } from './schemas.ts';

const GRAPH_DOCUMENT: GraphDocument = {
  language: 'typescript',
  checker: { name: 'TypeScript', version: '6.0.3' },
  scope: ['src/**'],
  files: ['src/shop.ts'],
  functions: [
    {
      id: 'src/shop.ts#total',
      name: 'total',
      file: 'src/shop.ts',
      firstLine: 1,
      lastLine: 3,
      sourceHash: 't1',
    },
    {
      id: 'src/shop.ts#price',
      name: 'price',
      file: 'src/shop.ts',
      firstLine: 5,
      lastLine: 5,
      sourceHash: 'p1',
    },
  ],
  calls: [
    { caller: 'src/shop.ts#total', callee: 'src/shop.ts#price', line: 2 },
    { caller: 'src/shop.ts#total', callee: 'src/shop.ts#price', line: 3, group: 'g1' },
  ],
  openEnds: [{ caller: 'src/shop.ts#total', line: 2, expression: 'cart.sum()', reason: 'untyped' }],
};

const withField = (key: string, value: unknown): unknown => ({ ...GRAPH_DOCUMENT, [key]: value });

describe('the JSON Schema of the graph document', () => {
  it('accepts a graph document with the files, the functions, the calls, the open ends, the scope and the checker', () => {
    expect(graphDocumentProblemsOf(GRAPH_DOCUMENT)).toEqual([]);
  });

  it.each([
    ['no checker', withField('checker', undefined)],
    ['a checker with no version', withField('checker', { name: 'TypeScript' })],
    ['a scope glob that is empty', withField('scope', [''])],
    ['a field that the contract does not allow', withField('review', [])],
    [
      'an open end with an unknown reason',
      withField('openEnds', [
        { caller: 'src/shop.ts#total', line: 2, expression: 'x()', reason: 'magic' },
      ]),
    ],
    [
      'a call on line 0',
      withField('calls', [{ caller: 'src/shop.ts#total', callee: 'src/shop.ts#price', line: 0 }]),
    ],
    [
      'a function with a line that is not whole',
      withField('functions', [{ ...GRAPH_DOCUMENT.functions[0], firstLine: 1.5 }]),
    ],
  ])('rejects a graph document with %s', (_what, document) => {
    expect(graphDocumentProblemsOf(document)).not.toEqual([]);
  });

  it.each([
    '/src/shop.ts',
    'C:/src/shop.ts',
    'src\\shop.ts',
    'src/../shop.ts',
    './src/shop.ts',
    'src//shop.ts',
    'src/shop.ts/',
    'C:shop.ts',
    '..',
    '',
  ])('rejects the file path %j, as the reader of the graph document does', (path) => {
    const document = { ...GRAPH_DOCUMENT, files: [path], functions: [], calls: [], openEnds: [] };
    expect(() => readGraphDocument(document)).toThrow();
    expect(graphDocumentProblemsOf(document)).not.toEqual([]);
  });

  it.each(['src/shop.ts', 'a', '.github/ci.ts', '..rc/x.ts', 'C/x.ts', 'Cart.ts', 'é/ü.ts'])(
    'accepts the file path %j, as the reader of the graph document does',
    (path) => {
      const document = { ...GRAPH_DOCUMENT, files: [path], functions: [], calls: [], openEnds: [] };
      expect(readGraphDocument(document).files).toEqual([path]);
      expect(graphDocumentProblemsOf(document)).toEqual([]);
    },
  );
});

const REVIEW_INPUT = JSON.parse(
  readFileSync(
    join(import.meta.dirname, '../packages/cli/fixture-review-input/review-input.json'),
    'utf8',
  ),
) as ReviewInput;

const reviewInputWith = (key: string, value: unknown): unknown => ({
  ...REVIEW_INPUT,
  [key]: value,
});

describe('the JSON Schema of the review input', () => {
  it('accepts the review input that a page builds from with no git and no extractor', () => {
    expect(reviewInputProblemsOf(REVIEW_INPUT)).toEqual([]);
  });

  it('accepts a review input with no branch name, as on a detached HEAD', () => {
    const { branch: _branch, ...checkout } = REVIEW_INPUT.checkout;
    expect(reviewInputProblemsOf(reviewInputWith('checkout', checkout))).toEqual([]);
  });

  it.each([
    ['no format version', reviewInputWith('formatVersion', undefined)],
    ['format version 2', reviewInputWith('formatVersion', 2)],
    ['a Diff limit', reviewInputWith('diffLimit', 40)],
    ['a review', reviewInputWith('review', {})],
    [
      'a base graph document with no checker',
      reviewInputWith('base', [{ ...GRAPH_DOCUMENT, checker: undefined }]),
    ],
    ['a branch side that is not a list', reviewInputWith('branch', GRAPH_DOCUMENT)],
    ['sources that are not packed', reviewInputWith('packedSources', { branch: {}, base: {} })],
    ['sources that are not base64', reviewInputWith('packedSources', 'not base64!')],
    [
      'no head commit',
      reviewInputWith('checkout', { ...REVIEW_INPUT.checkout, headCommit: undefined }),
    ],
    [
      'no uncommitted mark',
      reviewInputWith('checkout', { ...REVIEW_INPUT.checkout, uncommitted: undefined }),
    ],
    [
      'an editor that Callmap does not know',
      reviewInputWith('editor', { ...REVIEW_INPUT.editor, name: 'notepad' }),
    ],
    ['no repo root', reviewInputWith('editor', { name: 'vscode' })],
  ])('rejects a review input with %s', (_what, input) => {
    expect(reviewInputProblemsOf(input)).not.toEqual([]);
  });
});
