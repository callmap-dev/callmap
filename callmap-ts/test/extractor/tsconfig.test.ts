import { mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
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

const MONEY_PACKAGE = JSON.stringify({
  name: '@shop/money',
  type: 'module',
  exports: { '.': { types: './dist/index.d.ts', default: './dist/index.js' } },
});

const MONEY_CONFIG = JSON.stringify({ compilerOptions: { rootDir: 'src', outDir: 'dist' } });

const ROUNDED = 'export const rounded = (amount: number): number => Math.round(amount);\n';

const ROUNDED_DECLARATION = 'export declare const rounded: (amount: number) => number;\n';

const IMPORTS_ROUNDED =
  "import { rounded } from '@shop/money';\n\nexport const taxed = (cents: number) => rounded(cents);\n";

const callIntoMoney = {
  caller: 'apps/web/src/tax.ts#taxed',
  callee: 'packages/money/src/index.ts#rounded',
  line: 3,
};

const workspaceWith = (files: Readonly<Record<string, string>>): string => {
  const repo = repoWith({
    'packages/money/package.json': MONEY_PACKAGE,
    'packages/money/src/index.ts': ROUNDED,
    'apps/web/src/tax.ts': IMPORTS_ROUNDED,
    ...files,
  });
  mkdirSync(join(repo, 'node_modules/@shop'), { recursive: true });
  symlinkSync('../../packages/money', join(repo, 'node_modules/@shop/money'));
  return repo;
};

describe('a workspace package', () => {
  it('resolves to its source when the build folder does not exist', () => {
    const repo = workspaceWith({ 'packages/money/tsconfig.json': MONEY_CONFIG });
    const document = extractGraphDocument({ repo });
    expect(document.calls).toEqual([callIntoMoney]);
    expect(document.openEnds).toEqual([]);
  });

  it('resolves to its source when the build folder exists too', () => {
    const repo = workspaceWith({
      'packages/money/tsconfig.json': MONEY_CONFIG,
      'packages/money/dist/index.d.ts': ROUNDED_DECLARATION,
      'packages/money/dist/index.js': ROUNDED,
    });
    expect(extractGraphDocument({ repo }).calls).toEqual([callIntoMoney]);
  });

  it('resolves to its source when the nearest config of the app is another one', () => {
    const repo = workspaceWith({
      'packages/money/tsconfig.json': MONEY_CONFIG,
      'apps/web/tsconfig.json': aliasConfig('./src/*'),
    });
    expect(extractGraphDocument({ repo }).calls).toEqual([callIntoMoney]);
  });

  it('resolves to its source when it has an outDir and no rootDir, as the compiler emits it', () => {
    const repo = workspaceWith({
      'packages/money/tsconfig.json': JSON.stringify({
        compilerOptions: { outDir: 'dist' },
        include: ['src'],
      }),
    });
    expect(extractGraphDocument({ repo }).calls).toEqual([callIntoMoney]);
  });

  it('maps the build folder of a composite package with no rootDir to the folder of its config', () => {
    const repo = workspaceWith({
      'packages/money/package.json': MONEY_PACKAGE.replaceAll('./dist/index', './dist/src/index'),
      'packages/money/tsconfig.json': JSON.stringify({
        compilerOptions: { outDir: 'dist', composite: true },
        include: ['src'],
      }),
    });
    expect(extractGraphDocument({ repo }).calls).toEqual([callIntoMoney]);
  });

  it('resolves as the type checker does when it has no outDir and no rootDir', () => {
    const repo = workspaceWith({
      'packages/money/tsconfig.json': '{}',
      'packages/money/dist/index.d.ts': ROUNDED_DECLARATION,
    });
    const document = extractGraphDocument({ repo, scope: ['apps/**', 'packages/money/src/**'] });
    expect(document.calls).toEqual([]);
    expect(document.openEnds).toEqual([]);
  });

  it('stays an open end when it has no outDir and its build folder does not exist', () => {
    const repo = workspaceWith({ 'packages/money/tsconfig.json': '{}' });
    expect(extractGraphDocument({ repo }).openEnds).toMatchObject([
      { caller: 'apps/web/src/tax.ts#taxed', reason: 'missing-module' },
    ]);
  });

  it('enters the graph only when the scope holds the files of the package', () => {
    const repo = workspaceWith({ 'packages/money/tsconfig.json': MONEY_CONFIG });
    const document = extractGraphDocument({ repo, scope: ['apps/**'] });
    expect(document.files).toEqual(['apps/web/src/tax.ts']);
    expect(document.calls).toEqual([]);
    expect(document.openEnds).toEqual([]);
  });

  it('is not a package whose real path is inside a node_modules folder', () => {
    const repo = repoWith({
      'node_modules/@shop/money/package.json': MONEY_PACKAGE,
      'node_modules/@shop/money/tsconfig.json': MONEY_CONFIG,
      'node_modules/@shop/money/src/index.ts': ROUNDED,
      'node_modules/@shop/money/dist/index.d.ts': ROUNDED_DECLARATION,
      'apps/web/src/tax.ts': IMPORTS_ROUNDED,
    });
    const document = extractGraphDocument({ repo });
    expect(document.calls).toEqual([]);
    expect(document.openEnds).toEqual([]);
  });

  it('reads no workspace file of a package manager', () => {
    const repo = workspaceWith({
      'packages/money/tsconfig.json': MONEY_CONFIG,
      'package.json': JSON.stringify({ workspaces: ['nowhere/*'] }),
      'pnpm-workspace.yaml': 'packages:\n  - nowhere/*\n',
    });
    expect(extractGraphDocument({ repo }).calls).toEqual([callIntoMoney]);
  });
});

const importsOf = (...specifiers: readonly string[]): string =>
  specifiers.map((specifier) => `import '${specifier}';\n`).join('');

describe('the missing packages', () => {
  it('names each package that an import names and that resolves to no code, sorted and once', () => {
    const repo = repoWith({
      'src/a.ts': `${importsOf('zod', 'lodash/fp')}export { b } from 'left-pad';\n`,
      'src/b.ts': `${importsOf('@shop/money', 'zod')}export const c = () => import('@shop/ui/button');\n`,
    });
    expect(extractGraphDocument({ repo }).missingPackages).toEqual([
      '@shop/money',
      '@shop/ui',
      'left-pad',
      'lodash',
      'zod',
    ]);
  });

  it('names no package when each import finds code', () => {
    const repo = workspaceWith({
      'packages/money/tsconfig.json': MONEY_CONFIG,
      'node_modules/zod/package.json': JSON.stringify({ name: 'zod', types: 'index.d.ts' }),
      'node_modules/zod/index.d.ts': 'export declare const z: number;\n',
      'src/icons.d.ts': "declare module 'virtual:icons' { export const x: 1; }\n",
      'src/a.ts': importsOf('zod', 'node:fs', 'path', 'virtual:icons', '@shop/money'),
    });
    expect(extractGraphDocument({ repo }).missingPackages).toEqual([]);
  });

  it('names no installed package whose import names a file that is not code', () => {
    const repo = repoWith({
      'node_modules/bootstrap/package.json': JSON.stringify({ name: 'bootstrap' }),
      'node_modules/bootstrap/dist/css/bootstrap.min.css': 'a {}\n',
      'src/a.ts': importsOf('bootstrap/dist/css/bootstrap.min.css'),
    });
    expect(extractGraphDocument({ repo }).missingPackages).toEqual([]);
  });

  it('names a workspace package that no link in node_modules reaches', () => {
    const repo = repoWith({
      'packages/money/package.json': MONEY_PACKAGE,
      'packages/money/tsconfig.json': MONEY_CONFIG,
      'packages/money/src/index.ts': ROUNDED,
      'apps/web/src/tax.ts': IMPORTS_ROUNDED,
    });
    expect(extractGraphDocument({ repo }).missingPackages).toEqual(['@shop/money']);
  });

  it('names no relative import and no path alias that finds no file', () => {
    const repo = repoWith({
      'apps/web/tsconfig.json': aliasConfig('./src/*'),
      'apps/web/src/a.ts': importsOf('./nowhere', '../nowhere', '@/nowhere'),
    });
    expect(extractGraphDocument({ repo }).missingPackages).toEqual([]);
  });

  it('names only the packages that the files in scope import', () => {
    const repo = repoWith({
      'src/a.ts': importsOf('zod'),
      'scripts/b.ts': importsOf('left-pad'),
    });
    expect(extractGraphDocument({ repo, scope: ['src/**'] }).missingPackages).toEqual(['zod']);
  });
});
