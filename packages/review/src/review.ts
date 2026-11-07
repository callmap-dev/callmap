import type { FunctionId, GraphDocument, GraphFunction } from '@callmap/graph-document';
import { basePlacesOf } from './base-places.ts';
import type { BasePlaces } from './base-places.ts';
import { callGraphOf } from './call-graph.ts';
import { markedCallsOf } from './calls.ts';
import type { MarkedCall } from './calls.ts';
import { changesOf, functionsById } from './changes.ts';
import { entryPointsOf } from './entry-points.ts';
import type { EntryPoint } from './entry-points.ts';
import type { ChangeMark } from './changes.ts';
import { hopsOf, oneHopFrom } from './hops.ts';
import { byText } from './order.ts';
import { resolutionRatesOf } from './rate.ts';
import type { LanguageRate } from './rate.ts';
import { resolutionOf } from './resolution.ts';
import type { CallGraphs, Resolution } from './resolution.ts';
import { allFunctionsOf, allMarkedCallsOf } from './whole-graph.ts';
import type { ReviewFunction } from './whole-graph.ts';

export type FunctionMark = ChangeMark | 'neighbour';

export interface MarkedFunction extends GraphFunction {
  readonly mark: FunctionMark;
}

export interface ReviewDocuments {
  readonly base: readonly GraphDocument[];
  readonly branch: readonly GraphDocument[];
}

export interface Review extends CallGraphs, Resolution {
  readonly functions: readonly MarkedFunction[];
  readonly calls: readonly MarkedCall[];
  readonly resolutionRates: readonly LanguageRate[];
  readonly basePlaces: BasePlaces;
  readonly allFunctions: readonly ReviewFunction[];
  readonly markedCalls: readonly MarkedCall[];
  readonly entryPoints: readonly EntryPoint[];
}

export const reviewOf = (documents: ReviewDocuments): Review => {
  const base = callGraphOf(documents.base);
  const branch = callGraphOf(documents.branch);
  const baseFunctions = functionsById(base);
  const branchFunctions = functionsById(branch);
  const changes = changesOf(baseFunctions, branchFunctions);
  const baseHops = hopsOf(base.calls);
  const branchHops = hopsOf(branch.calls);

  const marks = new Map<FunctionId, FunctionMark>(changes);
  for (const changed of changes.keys()) {
    for (const id of [...oneHopFrom(baseHops, changed), ...oneHopFrom(branchHops, changed)]) {
      if (!marks.has(id)) marks.set(id, 'neighbour');
    }
  }

  const functions = [...marks]
    .sort(([left], [right]) => byText(left, right))
    .flatMap(([id, mark]): MarkedFunction[] => {
      const place = mark === 'removed' ? baseFunctions.get(id) : branchFunctions.get(id);
      return place === undefined ? [] : [{ ...place, mark }];
    });

  const calls = [...markedCallsOf(baseHops, branchHops, new Set(marks.keys()))].sort(
    (left, right) => byText(left.caller, right.caller) || byText(left.callee, right.callee),
  );

  return {
    base,
    branch,
    functions,
    calls,
    ...resolutionOf({ base, branch }, marks),
    resolutionRates: resolutionRatesOf(documents.branch),
    basePlaces: basePlacesOf(base, changes),
    allFunctions: allFunctionsOf(branch, functions),
    markedCalls: allMarkedCallsOf(branch, calls),
    entryPoints: entryPointsOf(branch, new Set(changes.keys())),
  };
};
