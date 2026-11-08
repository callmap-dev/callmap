import type { FunctionId, OpenEnd } from '@callmap/graph-document';
import type { CallGraph } from './call-graph.ts';
import type { FunctionMark } from './review.ts';
import { oneOfGroupsOf, oneOfLabelsOf } from './one-of-groups.ts';
import type { OneOfGroup, OneOfLabel } from './one-of-groups.ts';
import { openEndsByCallerOf, openEndsOf } from './open-ends.ts';
import type { OpenEndsByCaller } from './open-ends.ts';

export interface Resolution {
  readonly openEnds: readonly OpenEnd[];
  readonly oneOfGroups: readonly OneOfGroup[];
  readonly openEndsByCaller: OpenEndsByCaller;
  readonly oneOfLabels: readonly OneOfLabel[];
}

export interface CallGraphs {
  readonly base: CallGraph;
  readonly branch: CallGraph;
}

export const resolutionOf = (
  { base, branch }: CallGraphs,
  marks: ReadonlyMap<FunctionId, FunctionMark>,
): Resolution => {
  const graphOf = (caller: FunctionId): CallGraph =>
    marks.get(caller) === 'removed' ? base : branch;
  const reviewed = new Set(marks.keys());
  const openEnds = openEndsOf(reviewed, graphOf);
  const oneOfGroups = oneOfGroupsOf(reviewed, graphOf);
  return {
    openEnds,
    oneOfGroups,
    openEndsByCaller: openEndsByCallerOf(openEnds, branch, reviewed),
    oneOfLabels: oneOfLabelsOf(oneOfGroups, branch, reviewed),
  };
};
