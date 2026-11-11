import { TEMPLATE_DATA_BLOCK } from '@callmap/review-input';
import { beforeAll, describe, expect, it } from 'vitest';
import { pageTemplate } from '../build/index.ts';

let template = '';

beforeAll(async () => {
  template = await pageTemplate();
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
