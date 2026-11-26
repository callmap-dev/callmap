import type { Call, GraphDocument, OpenEnd } from '@callmap/graph-document';
import type { SourceLine } from './candidate-lines.ts';
import { codeOf, inlineCodeOf } from './markdown.ts';

export interface AuditHead {
  readonly repo: string;
  readonly commit: string;
  readonly distribution: string;
  readonly version: string;
  readonly checker: string;
  readonly seed: number;
  readonly count: number;
}

interface LineContent {
  readonly calls: readonly Call[];
  readonly oneOfGroups: readonly (readonly Call[])[];
  readonly openEnds: readonly OpenEnd[];
}

const locationOf = (file: string, line: number): string => `${file}:${String(line)}`;

const fileOfCaller = (documents: readonly GraphDocument[]): ReadonlyMap<string, string> =>
  new Map(
    documents.flatMap((document) =>
      document.functions.map((graphFunction) => [graphFunction.id, graphFunction.file]),
    ),
  );

const groupedBy = <Item>(
  items: readonly Item[],
  keyOf: (item: Item) => string,
): ReadonlyMap<string, readonly Item[]> => {
  const groups = new Map<string, Item[]>();
  for (const item of items) {
    const key = keyOf(item);
    const group = groups.get(key);
    if (group === undefined) groups.set(key, [item]);
    else group.push(item);
  }
  return groups;
};

const lineContentAt = (documents: readonly GraphDocument[]) => {
  const files = fileOfCaller(documents);
  const locationOfCaller = ({
    caller,
    line,
  }: {
    readonly caller: string;
    readonly line: number;
  }) => {
    const file = files.get(caller);
    if (file === undefined)
      throw new Error(`The caller ${caller} is no function of the graph document.`);
    return locationOf(file, line);
  };
  const calls = groupedBy(
    documents.flatMap((document) => document.calls),
    locationOfCaller,
  );
  const openEnds = groupedBy(
    documents.flatMap((document) => document.openEnds),
    locationOfCaller,
  );
  return (location: string): LineContent => {
    const callsOnLine = calls.get(location) ?? [];
    return {
      calls: callsOnLine.filter((call) => call.group === undefined),
      oneOfGroups: [
        ...groupedBy(
          callsOnLine.filter((call) => call.group !== undefined),
          (call) => call.group ?? '',
        ).values(),
      ],
      openEnds: openEnds.get(location) ?? [],
    };
  };
};

const SECTION_MARK = '## ';
const VERDICT_MARK = 'Verdict:';
const COUNT_MARK = '- Count: ';
const VERDICTS = ['right', 'wrong'] as const;

const NOTHING_ON_LINE = 'The graph document holds nothing on this line.';

const contentLinesOf = ({ calls, oneOfGroups, openEnds }: LineContent): readonly string[] => {
  const lines = [
    ...calls.map((call) => `- Call: ${inlineCodeOf(call.callee)}`),
    ...oneOfGroups.flatMap((group) => [
      '- One-of group:',
      ...group.map((call) => `  - ${inlineCodeOf(call.callee)}`),
    ]),
    ...openEnds.map(
      (openEnd) =>
        `- Open end: ${inlineCodeOf(openEnd.expression)}, open-end reason ${inlineCodeOf(openEnd.reason)}`,
    ),
  ];
  return lines.length === 0 ? [NOTHING_ON_LINE] : lines;
};

const headOf = (head: AuditHead): string =>
  [
    '# Audit sheet',
    '',
    `- Repo: ${inlineCodeOf(head.repo)}`,
    `- Commit: ${inlineCodeOf(head.commit)}`,
    `- Distribution: ${inlineCodeOf(head.distribution)}`,
    `- Version: ${inlineCodeOf(head.version)}`,
    `- Checker: ${head.checker}`,
    `- Seed: ${String(head.seed)}`,
    `${COUNT_MARK}${String(head.count)}`,
    '',
    'Check each line against its code. Write `right` or `wrong` after the verdict of the line.',
    '',
  ].join('\n');

export const auditSheetOf = (
  head: AuditHead,
  lines: readonly SourceLine[],
  documents: readonly GraphDocument[],
): string => {
  const contentAt = lineContentAt(documents);
  const sections = lines.map(({ file, line, text }) =>
    [
      `${SECTION_MARK}${locationOf(file, line)}`,
      '',
      codeOf(text),
      '',
      ...contentLinesOf(contentAt(locationOf(file, line))),
      '',
      VERDICT_MARK,
      '',
    ].join('\n'),
  );
  return [headOf(head), ...sections].join('\n');
};

export interface VerdictCount {
  readonly right: number;
  readonly wrong: number;
  readonly empty: number;
}

interface FilledSection {
  readonly location: string;
  readonly linesOutsideCode: string[];
}

const isFence = (line: string): boolean => /^`{3,}$/.test(line);

const filledSectionsOf = (sheet: string) => {
  const sections: FilledSection[] = [];
  const headLines: string[] = [];
  let openFence: string | undefined;
  for (const line of sheet.split('\n')) {
    if (openFence !== undefined) {
      if (line === openFence) openFence = undefined;
    } else if (isFence(line)) openFence = line;
    else if (line.startsWith(SECTION_MARK))
      sections.push({ location: line.slice(SECTION_MARK.length), linesOutsideCode: [] });
    else (sections.at(-1)?.linesOutsideCode ?? headLines).push(line);
  }
  if (openFence !== undefined)
    throw new Error('The audit sheet holds a code block that does not close.');
  return { headLines, sections };
};

const countOfHead = (headLines: readonly string[]): number => {
  const countLine = headLines.find((line) => line.startsWith(COUNT_MARK));
  const count = countLine?.slice(COUNT_MARK.length) ?? '';
  if (!/^\d+$/.test(count)) throw new Error('The head of the audit sheet names no count.');
  return Number(count);
};

const verdictOf = ({ location, linesOutsideCode }: FilledSection): string => {
  const verdictLines = linesOutsideCode.filter((line) => line.startsWith(VERDICT_MARK));
  const [verdictLine, ...extra] = verdictLines;
  if (verdictLine === undefined || extra.length > 0)
    throw new Error(
      `The section ${location} holds ${String(verdictLines.length)} verdict lines. Keep one "${VERDICT_MARK}" line.`,
    );
  const linesAfterVerdict = linesOutsideCode.slice(linesOutsideCode.indexOf(verdictLine) + 1);
  if (linesAfterVerdict.some((line) => line.trim() !== ''))
    throw new Error(
      `The section ${location} holds text after its verdict line. Write ${VERDICTS.join(' or ')} after "${VERDICT_MARK}".`,
    );
  const verdict = verdictLine.slice(VERDICT_MARK.length).trim();
  if (verdict !== '' && !(VERDICTS as readonly string[]).includes(verdict))
    throw new Error(
      `The verdict of the section ${location} is "${verdict}". Write ${VERDICTS.join(' or ')}.`,
    );
  return verdict;
};

export const verdictCountOf = (sheet: string): VerdictCount => {
  const { headLines, sections } = filledSectionsOf(sheet);
  const count = countOfHead(headLines);
  if (sections.length !== count)
    throw new Error(
      `The head of the audit sheet names the count ${String(count)}, but the sheet holds ${String(sections.length)} sections.`,
    );
  const verdicts = sections.map(verdictOf);
  const countOfVerdict = (verdict: string) => verdicts.filter((each) => each === verdict).length;
  return {
    right: countOfVerdict('right'),
    wrong: countOfVerdict('wrong'),
    empty: countOfVerdict(''),
  };
};
