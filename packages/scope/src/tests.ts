/**
 * The test files that no walk reads unless the user asks for them with `--tests` (ADR-0029). The
 * globs live in test-globs.json at the root of this package, keyed by language, so that every
 * distribution reads the same data. Every walk leaves out the test files of every language, so the
 * same scope gives the same graph document in every distribution. The Go extractor is a Go program with its own copy of this list, `testGlobs` in
 * packages/extractor-go/go/scope.go. A test fails when the 2 copies differ.
 */

import testGlobsByLanguage from '../test-globs.json' with { type: 'json' };

export const TEST_GLOBS: readonly string[] = [
  ...new Set(Object.values(testGlobsByLanguage).flat()),
];

/**
 * The scope that a walk reads: the globs of the user, then each test glob as a `!` glob, unless the
 * user asks for the tests. A negated glob that the user already typed does not repeat.
 */
export const effectiveScope = (scope: readonly string[], tests: boolean): readonly string[] =>
  tests
    ? scope
    : [...scope, ...TEST_GLOBS.map((glob) => `!${glob}`).filter((glob) => !scope.includes(glob))];
