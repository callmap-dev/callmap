import type { FunctionId } from '@callmap/graph-document';
import type { CallGraph } from './call-graph.ts';

export type CallLines = Readonly<Record<FunctionId, Readonly<Record<FunctionId, number>>>>;

export const callLinesOf = ({ calls }: CallGraph): CallLines => {
  const lines = new Map<FunctionId, Map<FunctionId, number>>();
  for (const { caller, callee, line } of calls) {
    const byCallee = lines.get(caller) ?? new Map<FunctionId, number>();
    byCallee.set(callee, Math.min(line, byCallee.get(callee) ?? line));
    lines.set(caller, byCallee);
  }
  return Object.fromEntries(
    [...lines].map(([caller, byCallee]) => [caller, Object.fromEntries(byCallee)]),
  );
};
