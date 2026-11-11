import { callTreeOf } from '@callmap/review';
import { pageFunctionsOf } from '../functions.ts';
import { sceneOf } from '../scene.ts';
import type { View } from '../view.ts';

export const routeView: View = {
  name: 'Route',
  sceneOf: (data, _opened, choice) => {
    const from = choice?.kind === 'tree' ? choice.from : data.review.entryPoints[0]?.id;
    if (from === undefined) return sceneOf(data, [], []);
    const functions = pageFunctionsOf(data);
    const tree = new Set(callTreeOf(data.review.branch, from));
    const calls = data.review.allCalls.filter(
      ({ caller, callee }) => tree.has(caller) && tree.has(callee),
    );
    return sceneOf(
      data,
      [...tree].flatMap((id) => functions.get(id) ?? []),
      calls,
    );
  },
  choiceShowing: (data, id) => ({
    kind: 'tree',
    from: data.review.routeEntryByFunction[id] ?? id,
  }),
};
