import type { FunctionId } from '@callmap/graph-document';
import type { ReaderPageData } from '../data.ts';
import { isChangeMark, pageFunctionsOf } from '../functions.ts';
import { levelsAmong } from '../levels.ts';
import { sceneOf } from '../scene.ts';
import type { View } from '../view.ts';
import { countWordsOf } from '../words.ts';

export const DIFF_LIMIT = 2_000;

/** A test sets a smaller Diff limit on the window under this name, as decision 3 of ADR-0038 records. */
export const DIFF_LIMIT_HOOK = 'callmapDiffLimit';

const shownOf = (data: ReaderPageData, opened: ReadonlySet<FunctionId>): ReadonlySet<FunctionId> =>
  new Set([...data.review.functions.map(({ id }) => id), ...opened]);

export const diffView: View = {
  name: 'Diff',
  callLimitOf: ({ diffLimit }) => diffLimit,
  countOf: ({ review }) => {
    const count = review.functions.filter(({ mark }) => isChangeMark(mark)).length;
    return { count, words: countWordsOf(count, 'changed function', 'changed functions') };
  },
  levelsOf: (data, opened) => levelsAmong(data, shownOf(data, opened)),
  sceneOf: (data, opened, choice) => {
    const shown = shownOf(data, opened);
    if (choice?.kind === 'level')
      return { ...levelsAmong(data, shown).sceneOf(choice.path), modelOrder: 'NONE' };
    const functions = pageFunctionsOf(data);
    return {
      ...sceneOf(
        data,
        [...shown].flatMap((id) => functions.get(id) ?? []),
        data.review.allCalls.filter(({ caller, callee }) => shown.has(caller) && shown.has(callee)),
      ),
      modelOrder: 'NONE',
    };
  },
};
