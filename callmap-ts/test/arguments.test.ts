import { describe, expect, it } from 'vitest';
import { readArguments, usageOf } from '../src/arguments.ts';

describe('the arguments of callmap review', () => {
  it('leaves the tests out unless --tests asks for them', () => {
    expect(readArguments(['review'], '/repo', 'callmap-ts').tests).toBe(false);
    expect(readArguments(['review', '--tests'], '/repo', 'callmap-ts').tests).toBe(true);
  });

  it('names --tests in the usage line', () => {
    expect(usageOf('callmap-ts')).toContain('[--tests]');
  });
});
