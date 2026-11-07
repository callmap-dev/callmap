import type { Editor } from '@callmap/editor-link';
import type { Review } from '@callmap/review';

export const DATA_BLOCK_ID = 'reader-page-data';

export type SourceTexts = Readonly<Record<string, string>>;

export interface Sources {
  readonly branch: SourceTexts;
  readonly base: SourceTexts;
}

export interface EditorChoice {
  readonly name: Editor;
  readonly repoRoot: string;
}

export interface Checkout {
  readonly branch: string | undefined;
  readonly baseName: string;
  readonly baseCommit: string;
  readonly headCommit: string;
  readonly uncommitted: boolean;
}

export interface ReaderPageData {
  readonly review: Review;
  readonly packedSources: string;
  readonly editor: EditorChoice;
  readonly checkout: Checkout;
  readonly diffLimit: number;
}
