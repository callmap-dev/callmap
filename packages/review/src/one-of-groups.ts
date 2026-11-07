import type { Call, FunctionId } from '@callmap/graph-document';
import type { CallGraph } from './call-graph.ts';
import type { GraphOfCaller } from './graph-of-caller.ts';
import { appendTo } from './indexes.ts';
import { byText } from './order.ts';

export interface OneOfGroup {
  readonly id: string;
  readonly caller: FunctionId;
  readonly line: number;
  readonly callees: readonly FunctionId[];
}

export const oneOfGroupsOf = (
  shown: Iterable<FunctionId>,
  graphOf: GraphOfCaller,
): readonly OneOfGroup[] => {
  const groups = new Map<string, OneOfGroup>();
  for (const caller of shown) {
    for (const call of graphOf(caller).calls) {
      if (call.group === undefined || call.caller !== caller) continue;
      const known = groups.get(call.group);
      groups.set(call.group, {
        id: call.group,
        caller,
        line: call.line,
        callees: [...(known?.callees ?? []), call.callee],
      });
    }
  }
  return [...groups.values()].sort((left, right) => byText(left.id, right.id));
};

export interface OneOfLabel {
  readonly caller: FunctionId;
  readonly callee: FunctionId;
  readonly label: string;
}

type GroupCall = Pick<Call, 'caller' | 'callee'> & { readonly group: string };

export const oneOfLabelsOf = (
  reviewGroups: readonly OneOfGroup[],
  branch: CallGraph,
  reviewed: ReadonlySet<FunctionId>,
): readonly OneOfLabel[] => {
  const groups = new Map<string, GroupCall[]>();
  const add = (call: GroupCall): void => {
    appendTo(groups, JSON.stringify([call.caller, call.group]), call);
  };
  for (const { id, caller, callees } of reviewGroups) {
    for (const callee of callees) add({ group: id, caller, callee });
  }
  for (const { group, caller, callee } of branch.calls) {
    if (group !== undefined && !reviewed.has(caller)) add({ group, caller, callee });
  }
  return [...groups.values()].flatMap((calls) =>
    calls.map(({ caller, callee }) => ({
      caller,
      callee,
      label: `one of ${String(calls.length)}`,
    })),
  );
};
