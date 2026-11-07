import { pageOfTemplate } from '@callmap/review-input';
import type { ReviewInput } from '@callmap/review-input';
import { assets } from './assets.ts';

export const readerPageOf = async (input: ReviewInput): Promise<string> =>
  pageOfTemplate(await assets.pageTemplate(), input);
