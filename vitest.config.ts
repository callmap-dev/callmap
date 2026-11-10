import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'packages/*/test/**/*.test.ts',
      'callmap-ts/test/**/*.test.ts',
      'callmap-go/test/**/*.test.ts',
      'test/**/*.test.ts',
    ],
    environment: 'node',
    maxWorkers: '50%',
    // A test that runs the command or `go` takes seconds alone, and many times more under the load of the whole suite.
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
