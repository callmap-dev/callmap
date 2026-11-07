import type { Editor } from '@callmap/editor-link';
import type { GraphDocument } from '@callmap/graph-document';

export const REVIEW_INPUT_FORMAT_VERSION = 1;

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

export interface ReviewInput {
  readonly formatVersion: typeof REVIEW_INPUT_FORMAT_VERSION;
  readonly base: readonly GraphDocument[];
  readonly branch: readonly GraphDocument[];
  readonly packedSources: string;
  readonly checkout: Checkout;
  readonly editor: EditorChoice;
}

const sideToUpdateFor = (formatVersion: unknown): string =>
  typeof formatVersion === 'number' && formatVersion > REVIEW_INPUT_FORMAT_VERSION
    ? 'the reader page'
    : 'the distribution that wrote the review input';

export class UnknownFormatVersionError extends Error {
  override readonly name = 'UnknownFormatVersionError';
  readonly formatVersion: unknown;

  constructor(formatVersion: unknown) {
    super(
      `The review input has format version ${JSON.stringify(formatVersion)}, and this reader page reads only format version ${String(REVIEW_INPUT_FORMAT_VERSION)}. Update ${sideToUpdateFor(formatVersion)}.`,
    );
    this.formatVersion = formatVersion;
  }
}

export const knownReviewInput = (parsed: unknown): ReviewInput => {
  const formatVersion: unknown =
    typeof parsed === 'object' && parsed !== null
      ? Reflect.get(parsed, 'formatVersion')
      : undefined;
  if (formatVersion !== REVIEW_INPUT_FORMAT_VERSION)
    throw new UnknownFormatVersionError(formatVersion);
  return parsed as ReviewInput;
};
