import type { Call, GraphDocument, OpenEnd } from '@callmap/graph-document';
import type { SourceLine } from './candidate-lines.ts';

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

const longestBacktickRunOf = (text: string): number =>
  Math.max(0, ...[...text.matchAll(/`+/g)].map(([run]) => run.length));

const codeOf = (text: string): string => {
  const fence = '`'.repeat(Math.max(3, longestBacktickRunOf(text) + 1));
  return `${fence}\n${text}\n${fence}`;
};

const inlineCodeOf = (text: string): string => {
  const ticks = '`'.repeat(longestBacktickRunOf(text) + 1);
  return text.startsWith('`') || text.endsWith('`')
    ? `${ticks} ${text} ${ticks}`
    : `${ticks}${text}${ticks}`;
};

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
    `- Count: ${String(head.count)}`,
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
      `## ${locationOf(file, line)}`,
      '',
      codeOf(text),
      '',
      ...contentLinesOf(contentAt(locationOf(file, line))),
      '',
      'Verdict:',
      '',
    ].join('\n'),
  );
  return [headOf(head), ...sections].join('\n');
};
