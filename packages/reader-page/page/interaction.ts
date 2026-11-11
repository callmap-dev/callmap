import type { FunctionId } from '@callmap/graph-document';
import type { FunctionMark } from '@callmap/review';
import type { ReaderPageData } from './data.ts';
import { drawingOf } from './drawing.ts';
import { viewLayoutsOf } from './layout.ts';
import type { Laid, LaidFunction, Rect } from './layout.ts';
import type { Levels } from './levels.ts';
import type { OpenLevel, ReaderPage } from './reader-page.ts';
import { isHiddenBy } from './scene.ts';
import type { FunctionBox, Scene } from './scene.ts';
import { tabBarOf } from './tabs.ts';
import { choiceKeyOf, overLimitOf } from './view.ts';
import type { Choice, OverLimit, View } from './view.ts';

export interface Interaction {
  readonly page: Omit<ReaderPage, 'sources'>;
  readonly render: () => Promise<void>;
}

export interface PageElements {
  readonly graph: HTMLElement;
  readonly panels: HTMLElement;
  readonly tabs: HTMLElement;
}

interface ViewState {
  readonly view: View;
  readonly opened: Set<FunctionId>;
  choice: Choice | undefined;
  over: OverLimit | undefined;
  scene: Scene | undefined;
  laid: Promise<Laid> | undefined;
}

const middleOf = ({ y, height }: Rect): number => y + height / 2;

const nextAlongCalls = (
  { boxes, lines }: Laid,
  from: string,
  along: 'callers' | 'callees',
  hidden: ReadonlySet<FunctionMark>,
): LaidFunction | undefined => {
  const start = boxes.find(({ id }) => id === from);
  if (start === undefined) return undefined;
  const ends = new Set(
    lines.flatMap((line) => {
      if (along === 'callees') return line.from === from ? [line.to] : [];
      return line.to === from ? [line.from] : [];
    }),
  );
  const distanceOf = (box: Rect): number => Math.abs(middleOf(box) - middleOf(start));
  return boxes
    .filter(
      (box): box is LaidFunction =>
        box.kind === 'function' && ends.has(box.id) && !isHiddenBy(hidden, box),
    )
    .sort((left, right) => distanceOf(left) - distanceOf(right) || left.x - right.x)[0];
};

export const interactionOf = (
  data: ReaderPageData,
  { graph, panels, tabs }: PageElements,
  views: readonly [View, ...View[]],
): Interaction => {
  const drawing = drawingOf(graph);
  const boxHandlers: ((box: FunctionBox) => void)[] = [];
  const viewHandlers: ((view: View) => void)[] = [];
  const choiceHandlers: ((view: View, choice: Choice) => void)[] = [];
  const overLimitHandlers: ((over: OverLimit | undefined) => void)[] = [];
  const hiddenMarkHandlers: ((hidden: ReadonlySet<FunctionMark>) => void)[] = [];
  const hiddenMarks = new Set<FunctionMark>();
  const overviewMapHandlers: ((collapsed: boolean) => void)[] = [];
  let overviewMapCollapsed = false;
  const states = views.map((view): ViewState => ({
    view,
    opened: new Set(),
    choice: view.firstChoice?.(data),
    over: undefined,
    scene: undefined,
    laid: undefined,
  })) as [ViewState, ...ViewState[]];
  let selected: FunctionId | undefined;
  let hovered: string | undefined;
  let drawn: ViewState | undefined;
  const layouts = viewLayoutsOf(graph);

  const sceneOf = (target: ViewState): Scene => {
    target.scene ??= target.view.sceneOf(data, target.opened, target.choice);
    return target.scene;
  };

  let current = states[0];

  const tellOverLimit = (over: OverLimit | undefined): void => {
    for (const handler of overLimitHandlers) handler(over);
  };

  const openLevelAt = ({ view, opened, choice }: ViewState): OpenLevel | undefined => {
    const levels = choice?.kind === 'level' ? view.levelsOf?.(data, opened) : undefined;
    return levels === undefined || choice?.kind !== 'level'
      ? undefined
      : { levels, path: choice.path };
  };

  const levelOn = (levels: Levels, level: string, id: FunctionId): boolean =>
    levels.sceneOf(level).boxes.some((box) => box.kind === 'function' && box.id === id);

  const levelChoiceOf = (target: ViewState, levels: Levels, place?: FunctionId): Choice => {
    const open = target.choice?.kind === 'level' ? target.choice.path : undefined;
    if (place !== undefined && (open === undefined || !levelOn(levels, open, place))) {
      const file = levels.fileOf(place);
      if (file !== undefined) return { kind: 'level', path: file };
    }
    if (open !== undefined && levels.holds(open)) return { kind: 'level', path: open };
    return { kind: 'level', path: levels.top };
  };

  const fitShape = (target: ViewState, place?: FunctionId): void => {
    const { view, opened } = target;
    if (view.callLimitOf === undefined || view.levelsOf === undefined) return;
    target.over = overLimitOf(view, data, view.sceneOf(data, opened, undefined));
    const choice =
      target.over === undefined
        ? undefined
        : levelChoiceOf(target, view.levelsOf(data, opened), place);
    const before = target.choice === undefined ? '' : choiceKeyOf(target.choice);
    const after = choice === undefined ? '' : choiceKeyOf(choice);
    if (before === after) return;
    target.choice = choice;
    if (target !== current) return;
    drawn = undefined;
    if (choice !== undefined) for (const handler of choiceHandlers) handler(view, choice);
  };

  const paint = (target: ViewState, laid: Laid, anchor?: FunctionId): void => {
    if (target !== current) return;
    tellOverLimit(target.over);
    drawing.draw(laid, anchor);
    hovered = undefined;
    drawing.highlight(selected, hovered);
    if (drawn !== target) drawing.camera.open(selected);
    drawn = target;
  };

  const functionBoxOf = (id: FunctionId): FunctionBox | undefined =>
    sceneOf(current).boxes.find(
      (box): box is FunctionBox => box.kind === 'function' && box.id === id,
    );

  const render = (target: ViewState, anchor?: FunctionId, place?: FunctionId): Promise<void> => {
    fitShape(target, place);
    target.scene = undefined;
    const layout = layouts.layoutOf({
      view: target.view,
      choice: target.choice,
      opened: target.opened,
      scene: sceneOf(target),
    });
    target.laid = layout;
    return layouts.whileBusy(async () => {
      paint(target, await layout, anchor);
    });
  };

  const highlight = (id: FunctionId | undefined): void => {
    selected = id;
    drawing.highlight(selected, hovered);
  };

  drawing.onBoxHover((id) => {
    if (id === hovered) return;
    hovered = id;
    drawing.highlight(selected, hovered);
  });

  const select = (box: FunctionBox): void => {
    highlight(box.id);
    for (const handler of boxHandlers) handler(box);
  };
  drawing.onBoxClick(select);
  drawing.onLevelBoxClick(({ opens }) => {
    void choose(opens);
  });
  drawing.onEmptyClick(() => {
    highlight(undefined);
  });
  graph.ownerDocument.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') highlight(undefined);
  });
  const step = (along: 'callers' | 'callees'): void => {
    if (selected === undefined) return;
    const next = nextAlongCalls(drawing.level(), selected, along, hiddenMarks);
    if (next === undefined) return;
    select(next);
    drawing.camera.keepInView(next.id);
    graph.querySelector<SVGElement>(`[data-box="${CSS.escape(next.id)}"]`)?.focus();
  };
  const graphKeys: Readonly<Record<string, () => void>> = {
    f: drawing.camera.fit,
    F: drawing.camera.fit,
    0: drawing.camera.reset,
    ArrowLeft: () => {
      step('callers');
    },
    ArrowRight: () => {
      step('callees');
    },
  };
  const isOnDrawing = (target: EventTarget | null): boolean =>
    target instanceof Element && target.closest('svg.drawing') !== null;
  graph.addEventListener('keydown', (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey || !isOnDrawing(event.target)) return;
    const act = graphKeys[event.key];
    if (act === undefined) return;
    event.preventDefault();
    act();
  });

  const toggleMark = (mark: FunctionMark): void => {
    if (hiddenMarks.has(mark)) hiddenMarks.delete(mark);
    else hiddenMarks.add(mark);
    for (const handler of hiddenMarkHandlers) handler(hiddenMarks);
  };

  const keepSelectionInView = (): void => {
    if (selected !== undefined) drawing.camera.keepInView(selected);
  };

  const toggleOverviewMap = (): void => {
    overviewMapCollapsed = !overviewMapCollapsed;
    // The CSS reads this attribute, so the map and the zoom controls move before any handler measures them.
    graph.toggleAttribute('data-overview-map-collapsed', overviewMapCollapsed);
    for (const handler of overviewMapHandlers) handler(overviewMapCollapsed);
    if (!overviewMapCollapsed) keepSelectionInView();
  };

  const show = (ids: readonly FunctionId[], anchor?: FunctionId): Promise<void> => {
    const levels = openLevelAt(current)?.levels;
    const fresh = ids.filter(
      (id) =>
        !current.opened.has(id) &&
        functionBoxOf(id) === undefined &&
        levels?.fileOf(id) === undefined,
    );
    if (fresh.length === 0) return layouts.idle();
    for (const id of fresh) current.opened.add(id);
    return render(current, anchor, ids[0]);
  };

  const clearNextHops = (): Promise<void> => {
    if (current.opened.size === 0) return layouts.idle();
    current.opened.clear();
    return render(current);
  };

  const choose = (choice: Choice): Promise<void> => {
    current.choice = choice;
    if (choice.kind !== 'level') current.opened.clear();
    drawn = undefined;
    for (const handler of choiceHandlers) handler(current.view, choice);
    return render(current);
  };

  const reveal = (id: FunctionId): Promise<void> => {
    if (functionBoxOf(id) !== undefined) return layouts.idle();
    const file = openLevelAt(current)?.levels.fileOf(id);
    const choice: Choice | undefined =
      file === undefined ? current.view.choiceShowing?.(data, id) : { kind: 'level', path: file };
    return choice === undefined ? show([id]) : choose(choice);
  };

  const open = async (id: FunctionId): Promise<void> => {
    await reveal(id);
    const box = functionBoxOf(id);
    if (box === undefined) return;
    drawing.camera.focus(id);
    select(box);
  };

  const showView = (name: string): Promise<void> => {
    const target = states.find(({ view }) => view.name === name);
    if (target === undefined || target === current) return layouts.idle();
    current = target;
    tabBar.select(name);
    for (const handler of viewHandlers) handler(target.view);
    tellOverLimit(target.over);
    const { laid } = target;
    if (laid === undefined) return render(target);
    return layouts.whileBusy(async () => {
      paint(target, await laid);
    });
  };

  const tabBar = tabBarOf(
    tabs,
    views.map(({ name, countOf }) => ({ name, count: countOf?.(data) })),
    graph.id,
    (name) => {
      void showView(name);
    },
  );
  tabBar.select(current.view.name);

  const page: Omit<ReaderPage, 'sources'> = {
    data,
    graph,
    camera: drawing.camera,
    level: drawing.level,
    onLevelChange: drawing.onLevelChange,
    panels,
    onBoxClick: (handler) => {
      boxHandlers.push(handler);
    },
    onLineClick: drawing.onLineClick,
    onHighlight: drawing.onHighlight,
    onViewChange: (handler) => {
      viewHandlers.push(handler);
    },
    onChoiceChange: (handler) => {
      choiceHandlers.push(handler);
    },
    currentView: () => current.view,
    openLevel: () => openLevelAt(current),
    hasNextHops: () => current.opened.size > 0,
    clearNextHops,
    onOverLimitChange: (handler) => {
      overLimitHandlers.push(handler);
    },
    hiddenMarks: () => hiddenMarks,
    toggleMark,
    onHiddenMarksChange: (handler) => {
      hiddenMarkHandlers.push(handler);
    },
    overviewMapCollapsed: () => overviewMapCollapsed,
    toggleOverviewMap,
    onOverviewMapToggle: (handler) => {
      overviewMapHandlers.push(handler);
    },
    show,
    open,
    keepSelectionInView,
    showView,
    choose,
  };
  return { page, render: () => render(current) };
};
