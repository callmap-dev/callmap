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

const isObject = (value: unknown): value is object => typeof value === 'object' && value !== null;

const FIELD_SHAPES: readonly (readonly [
  field: keyof ReviewInput,
  shape: string,
  fits: (value: unknown) => boolean,
])[] = [
  ['base', 'a list of graph documents', Array.isArray],
  ['branch', 'a list of graph documents', Array.isArray],
  ['packedSources', 'a text', (value) => typeof value === 'string'],
  ['checkout', 'an object', isObject],
  ['editor', 'an object', isObject],
];

export const knownReviewInput = (parsed: unknown): ReviewInput => {
  const formatVersion: unknown = isObject(parsed)
    ? Reflect.get(parsed, 'formatVersion')
    : undefined;
  if (formatVersion !== REVIEW_INPUT_FORMAT_VERSION || !isObject(parsed))
    throw new UnknownFormatVersionError(formatVersion);
  for (const [field, shape, fits] of FIELD_SHAPES)
    if (!fits(Reflect.get(parsed, field)))
      throw new Error(`The review input is malformed: "${field}" is not ${shape}.`);
  return parsed as ReviewInput;
};
