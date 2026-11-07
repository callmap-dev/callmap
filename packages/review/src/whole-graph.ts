import type { FunctionId, GraphFunction } from '@callmap/graph-document';
import type { CallGraph } from './call-graph.ts';
import type { MarkedCall } from './calls.ts';
import { addTo } from './indexes.ts';
import type { FunctionMark, MarkedFunction } from './review.ts';

export type ReviewFunction = GraphFunction & { readonly mark?: FunctionMark };

export const allFunctionsOf = (
  branch: CallGraph,
  marked: readonly MarkedFunction[],
): readonly ReviewFunction[] => [
  ...new Map<FunctionId, ReviewFunction>([
    ...branch.functions.map((graphFunction): [FunctionId, ReviewFunction] => [
      graphFunction.id,
      graphFunction,
    ]),
    ...marked.map((markedFunction): [FunctionId, ReviewFunction] => [
      markedFunction.id,
      markedFunction,
    ]),
  ]).values(),
];

export const allCallsOf = (
  branch: CallGraph,
  marked: readonly MarkedCall[],
): readonly MarkedCall[] => {
  const listed = new Map<FunctionId, Set<FunctionId>>();
  for (const { caller, callee } of marked) addTo(listed, caller, callee);
  const keptCalls = branch.calls.flatMap(({ caller, callee }): MarkedCall[] => {
    if (listed.get(caller)?.has(callee) === true) return [];
    addTo(listed, caller, callee);
    return [{ caller, callee, mark: 'kept' }];
  });
  return [...marked, ...keptCalls];
};
