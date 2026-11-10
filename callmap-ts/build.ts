import { copyFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildTypescriptPackage } from '@callmap/cli/src/package-build.ts';
import { noticesOf, npmNoticesOf } from '@callmap/cli/src/third-party-notices.ts';

const PACKAGE = import.meta.dirname;
const DIST = join(PACKAGE, 'dist');

const moduleIds = await buildTypescriptPackage({
  dist: DIST,
  cli: join(PACKAGE, 'src', 'cli.ts'),
  packageAssets: fileURLToPath(
    import.meta.resolve('@callmap/cli/src/typescript-package-assets.ts'),
  ),
  otherExtractors: {},
});

writeFileSync(join(DIST, 'THIRD-PARTY-NOTICES.txt'), noticesOf(npmNoticesOf(moduleIds)));
copyFileSync(join(PACKAGE, '..', 'LICENSE'), join(PACKAGE, 'LICENSE'));
