import { pageOfTemplate, reviewInputOfPage, TEMPLATE_DATA_BLOCK } from '@callmap/review-input';
import { beforeAll, describe, expect, it } from 'vitest';
import { assets } from '../src/assets.ts';
import { featureBranchRepo } from './fixture-repo.ts';
import { reviewHtmlOf } from './reader-page.ts';

let template = '';

beforeAll(async () => {
  template = await assets.pageTemplate();
});

describe('the page template', () => {
  it('holds the data block with the marker once', () => {
    expect(template.split(TEMPLATE_DATA_BLOCK)).toHaveLength(2);
  });

  it('inlines the page style and the page script, and loads no other file', () => {
    expect(template).toMatch(/<style>\n[^<]*--[\s\S]+\n<\/style>/);
    expect(template).toMatch(/<script>\n[\s\S]+\n<\/script>\n<\/body>\n<\/html>\n$/);
    expect(template).not.toMatch(/<(script|link)\b[^>]*\b(src|href)=/);
  });
});

describe('the command', () => {
  it('writes the page only by putting the escaped review input at the marker of the data block', () => {
    const page = reviewHtmlOf(featureBranchRepo());
    expect(page).toBe(pageOfTemplate(template, reviewInputOfPage(page)));
  });
});
