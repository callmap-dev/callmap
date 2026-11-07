import type { FunctionId, OpenEnd } from '@callmap/graph-document';
import type { CallGraph } from './call-graph.ts';
import type { GraphOfCaller } from './graph-of-caller.ts';
import { appendTo } from './indexes.ts';
import { byText } from './order.ts';

export const openEndsOf = (
  shown: Iterable<FunctionId>,
  graphOf: GraphOfCaller,
): readonly OpenEnd[] =>
  [...shown]
    .flatMap((caller) => graphOf(caller).openEnds.filter((end) => end.caller === caller))
    .sort(
      (left, right) =>
        byText(left.caller, right.caller) ||
        left.line - right.line ||
        byText(left.expression, right.expression),
    );

export type OpenEndsByCaller = Readonly<Record<FunctionId, readonly OpenEnd[]>>;

export const openEndsByCallerOf = (
  reviewOpenEnds: readonly OpenEnd[],
  branch: CallGraph,
  reviewed: ReadonlySet<FunctionId>,
): OpenEndsByCaller => {
  const byCaller = new Map<FunctionId, OpenEnd[]>();
  for (const openEnd of [
    ...reviewOpenEnds,
    ...branch.openEnds.filter(({ caller }) => !reviewed.has(caller)),
  ]) {
    appendTo(byCaller, openEnd.caller, openEnd);
  }
  return Object.fromEntries(byCaller);
};
