import { knownReviewInput } from './review-input.ts';
import type { ReviewInput } from './review-input.ts';

export const DATA_BLOCK_ID = 'reader-page-data';

const DATA_BLOCK_START = `<script type="application/json" id="${DATA_BLOCK_ID}">`;
const DATA_BLOCK_END = '</script>';
const DATA_BLOCK = new RegExp(`${DATA_BLOCK_START}([^<]*)${DATA_BLOCK_END}`);

const escapedJsonOf = (input: ReviewInput): string =>
  JSON.stringify(input).replaceAll('<', '\\u003c');

export const REVIEW_INPUT_MARKER = '{{CALLMAP_REVIEW_INPUT}}';

export const TEMPLATE_DATA_BLOCK = `${DATA_BLOCK_START}${REVIEW_INPUT_MARKER}${DATA_BLOCK_END}`;

export const dataBlockOf = (input: ReviewInput): string =>
  `${DATA_BLOCK_START}${escapedJsonOf(input)}${DATA_BLOCK_END}`;

export const pageOfTemplate = (template: string, input: ReviewInput): string => {
  const parts = template.split(REVIEW_INPUT_MARKER);
  if (parts.length !== 2)
    throw new Error(
      `the page template holds the marker ${REVIEW_INPUT_MARKER} ${String(parts.length - 1)} times, not once`,
    );
  return parts.join(escapedJsonOf(input));
};

export const reviewInputOfDataBlock = (json: string): ReviewInput =>
  knownReviewInput(JSON.parse(json));

const NO_DATA_BLOCK = 'the page holds no data block';

const dataBlockJsonOf = (page: string): string => {
  const json = DATA_BLOCK.exec(page)?.[1];
  if (json === undefined) throw new Error(NO_DATA_BLOCK);
  return json;
};

export const reviewInputOfPage = (page: string): ReviewInput =>
  reviewInputOfDataBlock(dataBlockJsonOf(page));

export const pageWithReviewInput = (page: string, input: ReviewInput): string => {
  if (!DATA_BLOCK.test(page)) throw new Error(NO_DATA_BLOCK);
  return page.replace(DATA_BLOCK, () => dataBlockOf(input));
};
