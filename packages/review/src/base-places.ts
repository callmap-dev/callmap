import type { FunctionId, GraphFunction } from '@callmap/graph-document';
import type { CallGraph } from './call-graph.ts';
import type { ChangeMark } from './changes.ts';

export type LineSpan = Pick<GraphFunction, 'firstLine' | 'lastLine'>;

export type BasePlaces = Readonly<Record<FunctionId, LineSpan>>;

export const basePlacesOf = (
  base: CallGraph,
  changes: ReadonlyMap<FunctionId, ChangeMark>,
): BasePlaces =>
  Object.fromEntries(
    base.functions
      .filter(({ id }) => changes.get(id) === 'changed')
      .map(({ id, firstLine, lastLine }) => [id, { firstLine, lastLine }]),
  );
