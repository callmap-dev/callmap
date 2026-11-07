import { readFileSync, writeFileSync } from 'node:fs';
import { dataBlockOf, packedSourcesOf } from '@callmap/review-input';
import type { ReviewInput, Sources } from '@callmap/review-input';

const [replayedFile = '', ...reviewArgs] = process.argv.slice(2);
const out = reviewArgs[reviewArgs.indexOf('--out') + 1] ?? '';
const { sources, ...input } = JSON.parse(readFileSync(replayedFile, 'utf8')) as Omit<
  ReviewInput,
  'packedSources'
> & { readonly sources: Sources };
const reviewInput = { ...input, packedSources: await packedSourcesOf(sources) };
writeFileSync(out, `<!doctype html>\n<body>${dataBlockOf(reviewInput)}</body>\n`);
