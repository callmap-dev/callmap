import { readFileSync, writeFileSync } from 'node:fs';
import { dataBlockOf, packedReviewInputOf } from '@callmap/review-input';
import type { UnpackedReviewInput } from '@callmap/review-input';

const [replayedFile = '', ...reviewArgs] = process.argv.slice(2);
const out = reviewArgs[reviewArgs.indexOf('--out') + 1] ?? '';
const reviewInput = await packedReviewInputOf(
  JSON.parse(readFileSync(replayedFile, 'utf8')) as UnpackedReviewInput,
);
writeFileSync(out, `<!doctype html>\n<body>${dataBlockOf(reviewInput)}</body>\n`);
