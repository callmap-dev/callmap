import { describe, expect, it } from 'vitest';
import { goSourceFiles } from '../src/clone-assets.ts';

describe('the source files of the Go extractor', () => {
  it('leave out the Go tests, so a change to a test keeps the key of the binary', () => {
    const names = goSourceFiles().map(({ name }) => name);
    expect(names).toContain('go/internal/extractor/written.go');
    expect(names.filter((name) => name.endsWith('_test.go'))).toEqual([]);
  });

  it('leave out the review command of callmap-go and its page template, so a change to them keeps the key of the binary', () => {
    const names = goSourceFiles().map(({ name }) => name);
    expect(names).toContain('go/cmd/callmap-extract-go/main.go');
    expect(names.filter((name) => /^go\/[^/]+\.(go|html)$/.test(name))).toEqual([]);
  });
});
