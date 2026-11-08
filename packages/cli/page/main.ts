import {
  DATA_BLOCK_ID,
  reviewInputOfDataBlock,
  UnknownFormatVersionError,
  unpackedSourcesOf,
} from '@callmap/review-input';
import type { ReviewInput } from '@callmap/review-input';
import { readerPageDataOf } from './data.ts';
import { interactionOf } from './interaction.ts';
import type { PagePart, ReaderPage } from './reader-page.ts';
import { READER_VIEWS } from './reader-views.ts';
import { sidePanelOf } from './side-panel.ts';
import { showUnknownFormatVersion } from './unknown-format-version.ts';
import { DIFF_LIMIT, DIFF_LIMIT_HOOK } from './views/diff.ts';

const elementOf = (id: string): HTMLElement => {
  const element = document.getElementById(id);
  if (element === null) throw new Error(`the reader page holds no #${id}`);
  return element;
};

const diffLimitOfPage = (): number => {
  const hooked: unknown = Reflect.get(window, DIFF_LIMIT_HOOK);
  return typeof hooked === 'number' ? hooked : DIFF_LIMIT;
};

const knownReviewInput = (): ReviewInput | undefined => {
  try {
    return reviewInputOfDataBlock(elementOf(DATA_BLOCK_ID).textContent);
  } catch (error) {
    if (!(error instanceof UnknownFormatVersionError)) throw error;
    showUnknownFormatVersion(elementOf('graph'), error);
    return undefined;
  }
};

export const startReaderPage = (parts: readonly PagePart[]): void => {
  const input = knownReviewInput();
  if (input === undefined) return;
  const data = readerPageDataOf(input, diffLimitOfPage());
  let drawn = (): void => undefined;
  const firstDraw = new Promise<void>((resolve) => {
    drawn = resolve;
  });
  const { page: interactive, render } = interactionOf(
    data,
    { graph: elementOf('graph'), panels: elementOf('panels'), tabs: elementOf('views') },
    READER_VIEWS,
  );
  const page: ReaderPage = {
    ...interactive,
    sources: firstDraw.then(() => unpackedSourcesOf(data.packedSources)),
  };
  const leftPanel = sidePanelOf({
    side: 'left',
    label: 'Left panel',
    name: 'left panel',
    body: page.panels,
    widthKey: 'callmap.left-panel.width',
    defaultWidth: 260,
    open: true,
    onChange: page.keepSelectionInView,
  });
  page.graph.before(leftPanel.element);
  for (const part of parts) part(page);
  void render().finally(drawn);
};
