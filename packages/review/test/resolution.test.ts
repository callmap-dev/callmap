import { describe, expect, it } from 'vitest';
import type {
  Call,
  GraphDocument,
  GraphFunction,
  OpenEnd,
  OpenEndReason,
} from '@callmap/graph-document';
import { reviewOf } from '../src/index.ts';

const fn = (id: string, sourceHash = `${id}@1`): GraphFunction => {
  const [file = '', name = ''] = id.split('#');
  return { id, name, file, firstLine: 1, lastLine: 3, sourceHash };
};

const call = (caller: string, callee: string, line = 2): Call => ({ caller, callee, line });

const oneOf = (caller: string, callee: string, group: string, line = 4): Call => ({
  caller,
  callee,
  line,
  group,
});

const openEnd = (
  caller: string,
  expression: string,
  line = 5,
  reason: OpenEndReason = 'other',
): OpenEnd => ({
  caller,
  line,
  expression,
  reason,
});

const graph = (
  functions: readonly GraphFunction[],
  calls: readonly Call[] = [],
  openEnds: readonly OpenEnd[] = [],
): GraphDocument => ({
  language: 'example',
  checker: { name: 'Example', version: '1.0.0' },
  scope: [],
  files: [...new Set(functions.map(({ file }) => file))],
  functions,
  calls,
  openEnds,
});

const A = 'src/a.ts#a';
const B = 'src/a.ts#b';
const C = 'src/c.ts#c';
const D = 'src/d.ts#d';

const EXAMPLE = { language: 'example', checker: { name: 'Example', version: '1.0.0' } };

const inLanguage = (
  language: string,
  checker: GraphDocument['checker'],
  document: GraphDocument,
): GraphDocument => ({ ...document, language, checker });

const ratesOf = (branch: readonly GraphDocument[], base: readonly GraphDocument[] = []) =>
  reviewOf({ base, branch }).resolutionRates;

describe('the resolution rates of a review', () => {
  it('divides the calls of the branch graph by those calls plus its open ends', () => {
    const branch = graph(
      [fn(A), fn(B), fn(C)],
      [call(A, B), call(A, C), call(B, C)],
      [openEnd(A, 'bcrypt.hash')],
    );
    expect(ratesOf([branch])).toEqual([{ ...EXAMPLE, resolved: 3, open: 1, rate: 0.75 }]);
  });

  it('counts a one-of group as one resolved call', () => {
    const branch = graph(
      [fn(A), fn(B), fn(C)],
      [call(A, B), oneOf(A, B, 'g'), oneOf(A, C, 'g')],
      [openEnd(B, 'hook')],
    );
    expect(ratesOf([branch])).toEqual([{ ...EXAMPLE, resolved: 2, open: 1, rate: 2 / 3 }]);
  });

  it('reads the rate from the branch graph, not the base graph', () => {
    const base = graph([fn(A), fn(B)], [], [openEnd(A, 'x'), openEnd(B, 'y')]);
    const branch = graph([fn(A), fn(B)], [call(A, B)]);
    expect(ratesOf([branch], [base])).toEqual([{ ...EXAMPLE, resolved: 1, open: 0, rate: 1 }]);
  });

  it('gives a rate of one to a graph with no call to resolve, because nothing is unproven', () => {
    expect(ratesOf([graph([fn(A)])])).toEqual([{ ...EXAMPLE, resolved: 0, open: 0, rate: 1 }]);
  });

  it('gives one rate and one checker for each graph document of the branch, by language', () => {
    const second = inLanguage(
      'second',
      { name: 'Second', version: '2.1.0' },
      graph([fn(C), fn(D)], [oneOf(C, D, 'g'), oneOf(C, D, 'g', 6)], [openEnd(D, 'hook')]),
    );
    const first = inLanguage(
      'first',
      { name: 'First', version: '1.4.2' },
      graph([fn(A), fn(B)], [call(A, B)]),
    );
    expect(ratesOf([second, first])).toEqual([
      {
        language: 'first',
        checker: { name: 'First', version: '1.4.2' },
        resolved: 1,
        open: 0,
        rate: 1,
      },
      {
        language: 'second',
        checker: { name: 'Second', version: '2.1.0' },
        resolved: 1,
        open: 1,
        rate: 0.5,
      },
    ]);
  });
});

describe('the open ends of a review', () => {
  it('lists the open ends of each function the review shows, from the graph that holds it', () => {
    const base = graph(
      [fn(A, 'old'), fn(B), fn(D)],
      [],
      [openEnd(B, 'legacy.run', 3, 'missing-module')],
    );
    const branch = graph(
      [fn(A, 'new'), fn(C), fn(D)],
      [],
      [openEnd(A, 'JSON.parse(raw).notify', 7, 'untyped'), openEnd(D, 'hook', 9)],
    );
    expect(reviewOf({ base: [base], branch: [branch] }).openEnds).toEqual([
      { caller: A, line: 7, expression: 'JSON.parse(raw).notify', reason: 'untyped' },
      { caller: B, line: 3, expression: 'legacy.run', reason: 'missing-module' },
    ]);
  });
});

describe('the one-of groups of a review', () => {
  it('lists each one-of group of a function the review shows, with its call site and callees', () => {
    const base = graph([fn(B), fn(C), fn(D)]);
    const branch = graph(
      [fn(A), fn(B), fn(C), fn(D)],
      [oneOf(A, B, 'src/a.ts:4:3'), oneOf(A, C, 'src/a.ts:4:3'), oneOf(D, B, 'src/d.ts:2:1')],
    );
    expect(reviewOf({ base: [base], branch: [branch] }).oneOfGroups).toEqual([
      { id: 'src/a.ts:4:3', caller: A, line: 4, callees: [B, C] },
    ]);
  });

  it('marks the calls of a one-of group as calls the branch added, like any other call', () => {
    const base = graph([fn(B), fn(C)]);
    const branch = graph([fn(A), fn(B), fn(C)], [oneOf(A, B, 'g'), oneOf(A, C, 'g')]);
    expect(reviewOf({ base: [base], branch: [branch] }).calls).toEqual([
      { caller: A, callee: B, mark: 'added' },
      { caller: A, callee: C, mark: 'added' },
    ]);
  });
});

describe('the open ends of each caller', () => {
  it('takes the open ends of a function the review shows from the review, and of any other function from the branch graph', () => {
    const base = graph([fn(A, 'old'), fn(B), fn(D)], [], [openEnd(B, 'legacy.run', 3)]);
    const branch = graph(
      [fn(A, 'new'), fn(D)],
      [],
      [openEnd(D, 'hook', 9), openEnd(A, 'z', 7), openEnd(D, 'later', 3), openEnd(A, 'y', 7)],
    );
    expect(reviewOf({ base: [base], branch: [branch] }).openEndsByCaller).toEqual({
      [A]: [openEnd(A, 'y', 7), openEnd(A, 'z', 7)],
      [B]: [openEnd(B, 'legacy.run', 3)],
      [D]: [openEnd(D, 'hook', 9), openEnd(D, 'later', 3)],
    });
  });
});

describe('the one-of labels', () => {
  it('labels each call of a one-of group with the size of its group, from the graph that holds its caller', () => {
    const E = 'src/e.ts#e';
    const F = 'src/f.ts#f';
    const base = graph([fn(B), fn(C), fn(D), fn(E), fn(F)], [oneOf(F, B, 'g3'), oneOf(F, C, 'g3')]);
    const branch = graph(
      [fn(A), fn(B), fn(C), fn(D), fn(E)],
      [
        oneOf(A, B, 'g1'),
        oneOf(A, C, 'g1'),
        oneOf(D, B, 'g2'),
        oneOf(D, C, 'g2'),
        oneOf(D, E, 'g2'),
        call(D, E),
      ],
    );
    expect(reviewOf({ base: [base], branch: [branch] }).oneOfLabels).toEqual([
      { caller: A, callee: B, label: 'one of 2' },
      { caller: A, callee: C, label: 'one of 2' },
      { caller: F, callee: B, label: 'one of 2' },
      { caller: F, callee: C, label: 'one of 2' },
      { caller: D, callee: B, label: 'one of 3' },
      { caller: D, callee: C, label: 'one of 3' },
      { caller: D, callee: E, label: 'one of 3' },
    ]);
  });
});
