import { isChangeMark, markedCallsOf, pageFunctionsOf } from '../functions.ts';
import { sceneOf } from '../scene.ts';
import type { View } from '../view.ts';
import { countWordsOf } from '../words.ts';

export const DIFF_LIMIT = 2_000;

/** A test sets a smaller Diff limit on the window under this name, as ADR-0038 records. */
export const DIFF_LIMIT_HOOK = 'callmapDiffLimit';

export const diffView: View = {
  name: 'Diff',
  callLimitOf: ({ diffLimit }) => diffLimit,
  countOf: ({ review }) => {
    const count = review.functions.filter(({ mark }) => isChangeMark(mark)).length;
    return { count, words: countWordsOf(count, 'changed function', 'changed functions') };
  },
  sceneOf: (data, opened) => {
    const functions = pageFunctionsOf(data);
    const shown = new Set([...data.review.functions.map(({ id }) => id), ...opened]);
    return {
      ...sceneOf(
        data,
        [...shown].flatMap((id) => functions.get(id) ?? []),
        markedCallsOf(data).filter(({ caller, callee }) => shown.has(caller) && shown.has(callee)),
      ),
      modelOrder: 'NONE',
    };
  },
};
