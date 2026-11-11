import { arrowIconOf } from '../arrows.ts';
import { coverTopOfGraph } from '../camera.ts';
import type { PagePart } from '../reader-page.ts';
import type { OverLimit } from '../view.ts';
import { callsWordsOf, countWordsOf, functionsAndCallsOf } from '../words.ts';

const noteOf = (over: OverLimit): string =>
  `This review holds ${functionsAndCallsOf(over)}, over the Diff limit of ${callsWordsOf(over.limit)}, so the Diff view shows one level at a time.`;

const levelBar: PagePart = (page) => {
  const bar = document.createElement('section');
  bar.setAttribute('aria-label', 'Level bar');
  bar.className = 'level-bar';
  coverTopOfGraph(bar);
  bar.hidden = true;
  const nav = document.createElement('nav');
  nav.setAttribute('aria-label', 'Level');
  nav.className = 'breadcrumb';
  const list = document.createElement('ol');
  nav.append(list);
  const summary = document.createElement('span');
  summary.className = 'level-counts';
  const note = document.createElement('p');
  note.className = 'diff-limit-note';
  note.hidden = true;
  const clear = document.createElement('button');
  clear.type = 'button';
  clear.className = 'clear-next-hops';
  clear.textContent = 'Clear next hops';
  const up = document.createElement('button');
  up.type = 'button';
  up.className = 'up-level';
  up.append(arrowIconOf('up', 'up-arrow'), 'Up one level');
  bar.append(nav, summary, note, clear, up);
  page.graph.append(bar);

  let parent: string | undefined;
  up.addEventListener('click', () => {
    if (parent !== undefined) void page.choose({ kind: 'level', path: parent });
  });
  clear.addEventListener('click', () => {
    void page.clearNextHops();
  });

  const show = (): void => {
    const open = page.openLevel();
    bar.hidden = open === undefined;
    if (open === undefined) return;
    const { levels, path: level } = open;
    const crumbs = levels.crumbsOf(level);
    list.replaceChildren(
      ...crumbs.map(({ path, label }, index) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = label;
        if (index === crumbs.length - 1) button.setAttribute('aria-current', 'location');
        button.addEventListener('click', () => {
          void page.choose({ kind: 'level', path });
        });
        const item = document.createElement('li');
        item.append(button);
        return item;
      }),
    );
    const { boxes, lines } = levels.sceneOf(level);
    summary.textContent = `${countWordsOf(boxes.length, 'box', 'boxes')} · ${countWordsOf(lines.length, 'line', 'lines')}`;
    clear.hidden = !page.hasNextHops();
    parent = crumbs.at(-2)?.path;
    up.disabled = parent === undefined;
  };

  show();
  page.onViewChange(show);
  page.onChoiceChange(show);
  page.onLevelChange(show);
  page.onOverLimitChange((over) => {
    note.hidden = over === undefined;
    note.textContent = over === undefined ? '' : noteOf(over);
  });
};

export default levelBar;
