import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ExtractionError, extractGraphDocument } from '../../extractor/index.ts';
import { tempDir } from '../../../test/temp-dir.ts';

const FIXTURE = fileURLToPath(new URL('../../fixture', import.meta.url));
const INNER = `${FIXTURE}/src`;

const repoWith = (files: Readonly<Record<string, string>>): string => {
  const repo = tempDir('callmap-ts-config-');
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(repo, path, '..'), { recursive: true });
    writeFileSync(join(repo, path), text);
  }
  return repo;
};

const PRICE = 'export const price = () => 1;\n';

const checkoutCalls = {
  caller: 'src/screens/checkout.tsx#Checkout',
  callee: 'src/shared/money.ts#formatMoney',
  line: 8,
};

describe('the tsconfig a call is resolved through', () => {
  it('resolves a call through an alias that a tsconfig inherits from the one it extends', () => {
    expect(extractGraphDocument({ repo: FIXTURE }).calls).toContainEqual(checkoutCalls);
  });

  it('resolves a relative import in a repo that has no tsconfig at its root', () => {
    expect(extractGraphDocument({ repo: INNER }).calls).toContainEqual({
      caller: 'api/receipt.ts#printReceipt',
      callee: 'shared/money.ts#formatMoney',
      line: 4,
    });
  });

  it('resolves no alias in a repo that has no tsconfig, because that is where aliases live', () => {
    expect(
      extractGraphDocument({ repo: INNER }).calls.some(
        ({ caller }) => caller === 'screens/checkout.tsx#Checkout',
      ),
    ).toBe(false);
  });

  it('resolves the alias again when told which tsconfig to read', () => {
    const document = extractGraphDocument({ repo: INNER, tsconfig: `${FIXTURE}/tsconfig.json` });
    expect(document.calls).toContainEqual({
      caller: 'screens/checkout.tsx#Checkout',
      callee: 'shared/money.ts#formatMoney',
      line: 8,
    });
  });

  it('refuses a tsconfig it was told to read and could not, and names it', () => {
    const read = () => extractGraphDocument({ repo: FIXTURE, tsconfig: `${FIXTURE}/nowhere.json` });
    expect(read).toThrow(ExtractionError);
    expect(read).toThrow(/nowhere\.json/);
  });

  it('refuses a root tsconfig that is there and cannot be read, and names it', () => {
    const repo = repoWith({
      'tsconfig.json': '{ "compilerOptions": { "paths": ',
      'index.ts': PRICE,
    });
    const read = () => extractGraphDocument({ repo });
    expect(read).toThrow(ExtractionError);
    expect(read).toThrow(/tsconfig\.json/);
  });

  it('refuses a tsconfig whose extends chain does not resolve, and names the base', () => {
    const repo = repoWith({
      'tsconfig.json': '{ "extends": "./tsconfig.base.json" }\n',
      'index.ts': PRICE,
    });
    const read = () => extractGraphDocument({ repo });
    expect(read).toThrow(ExtractionError);
    expect(read).toThrow(/tsconfig\.base\.json/);
  });

  it('reads a tsconfig whose include names no file, because the extractor brings its own', () => {
    const repo = repoWith({
      'tsconfig.json': '{ "include": ["nowhere/**/*.ts"] }\n',
      'index.ts': PRICE,
    });
    expect(extractGraphDocument({ repo }).files).toEqual(['index.ts']);
  });
});

const aliasConfig = (target: string): string =>
  JSON.stringify({ compilerOptions: { paths: { '@/*': [target] } } });

const IMPORTS_PRICE = "import { price } from '@/price';\n\nexport const total = () => price();\n";

describe('the nearest tsconfig of each file', () => {
  it('resolves the alias of each app through the config of that app', () => {
    const repo = repoWith({
      'apps/web/tsconfig.json': aliasConfig('./src/*'),
      'apps/web/src/price.ts': PRICE,
      'apps/web/src/total.ts': IMPORTS_PRICE,
      'apps/admin/tsconfig.json': aliasConfig('./lib/*'),
      'apps/admin/lib/price.ts': PRICE,
      'apps/admin/src/total.ts': IMPORTS_PRICE,
    });
    expect(extractGraphDocument({ repo }).calls).toEqual([
      { caller: 'apps/admin/src/total.ts#total', callee: 'apps/admin/lib/price.ts#price', line: 3 },
      { caller: 'apps/web/src/total.ts#total', callee: 'apps/web/src/price.ts#price', line: 3 },
    ]);
  });

  it('gives the default options to a file with no tsconfig above it', () => {
    const repo = repoWith({
      'apps/web/tsconfig.json': aliasConfig('./src/*'),
      'apps/web/src/price.ts': PRICE,
      'scripts/price.ts': PRICE,
      'scripts/total.ts':
        "import { price } from './price';\n\nexport const total = () => price();\n",
      'scripts/aliased.ts': IMPORTS_PRICE,
    });
    const document = extractGraphDocument({ repo });
    expect(document.calls).toEqual([
      { caller: 'scripts/total.ts#total', callee: 'scripts/price.ts#price', line: 3 },
    ]);
    expect(document.openEnds).toMatchObject([{ caller: 'scripts/aliased.ts#total' }]);
  });

  it('never reads a tsconfig.build.json as the nearest config', () => {
    const repo = repoWith({
      'apps/web/tsconfig.build.json': aliasConfig('./src/*'),
      'apps/web/src/price.ts': PRICE,
      'apps/web/src/total.ts': IMPORTS_PRICE,
      'apps/admin/tsconfig.json': aliasConfig('./src/*'),
      'apps/admin/tsconfig.build.json': aliasConfig('./lib/*'),
      'apps/admin/src/price.ts': PRICE,
      'apps/admin/src/total.ts': IMPORTS_PRICE,
    });
    const document = extractGraphDocument({ repo });
    expect(document.calls).toEqual([
      { caller: 'apps/admin/src/total.ts#total', callee: 'apps/admin/src/price.ts#price', line: 3 },
    ]);
    expect(document.openEnds).toMatchObject([{ caller: 'apps/web/src/total.ts#total' }]);
  });

  it('reads the one config that --tsconfig names for every file, over the nearest config', () => {
    const repo = repoWith({
      'tsconfig.shared.json': aliasConfig('./apps/web/lib/*'),
      'apps/web/tsconfig.json': aliasConfig('./src/*'),
      'apps/web/src/price.ts': PRICE,
      'apps/web/lib/price.ts': PRICE,
      'apps/web/src/total.ts': IMPORTS_PRICE,
    });
    expect(
      extractGraphDocument({ repo, tsconfig: join(repo, 'tsconfig.shared.json') }).calls,
    ).toEqual([
      { caller: 'apps/web/src/total.ts#total', callee: 'apps/web/lib/price.ts#price', line: 3 },
    ]);
  });

  it('refuses a nested tsconfig that is there and cannot be read, and names it', () => {
    const repo = repoWith({
      'apps/web/tsconfig.json': '{ "compilerOptions": { "paths": ',
      'apps/web/src/price.ts': PRICE,
    });
    const read = () => extractGraphDocument({ repo });
    expect(read).toThrow(ExtractionError);
    expect(read).toThrow(`${repo}/apps/web/tsconfig.json could not be read as a tsconfig`);
  });
});

describe('the directories every extractor skips', () => {
  it('leaves out node_modules, vendor, and a dot directory', () => {
    const repo = repoWith({
      'src/a.ts': PRICE,
      'vendor/lib.ts': PRICE,
      'node_modules/x/index.ts': PRICE,
      '.cache/b.ts': PRICE,
    });
    expect(extractGraphDocument({ repo }).files).toEqual(['src/a.ts']);
  });
});

describe('a monorepo whose packages import each other by name', () => {
  const REPO = fileURLToPath(new URL('../../..', import.meta.url));
  const document = () =>
    extractGraphDocument({
      repo: REPO,
      scope: ['callmap-ts/src/**', 'packages/graph-document/**'],
    });

  it('ties a call through a package name to the function the package exports', () => {
    expect(document().calls).toContainEqual({
      caller: 'callmap-ts/src/extractor.ts#extractionOf',
      callee: 'packages/graph-document/src/document.ts#readGraphDocument',
      line: 56,
    });
  });

  it('claims no file outside the scope, so nothing from a linked package leaks in', () => {
    expect(
      document().files.every(
        (path) => path.startsWith('callmap-ts/src/') || path.startsWith('packages/graph-document/'),
      ),
    ).toBe(true);
  });
});
