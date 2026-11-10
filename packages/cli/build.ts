import { copyFileSync, cpSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { assets } from './src/assets.ts';
import {
  GO_PROGRAM,
  goSourceFiles,
  isGoExtractorSource,
  RUBY_SCRIPTS,
  rubySourceFiles,
} from './src/clone-assets.ts';
import { sha256OfFiles } from './src/file-hash.ts';
import { buildTypescriptPackage } from './src/package-build.ts';
import { noticesOf, npmNoticesOf } from './src/third-party-notices.ts';
import type { Notice } from './src/third-party-notices.ts';

const PACKAGE = import.meta.dirname;
const REPO_ROOT = join(PACKAGE, '..', '..');
const DIST = join(PACKAGE, 'dist');

const GO_MODULE_LICENSES: Readonly<Record<string, string>> = {
  'golang.org/x/mod': 'BSD-3-Clause',
  'golang.org/x/sync': 'BSD-3-Clause',
  'golang.org/x/tools': 'BSD-3-Clause',
};

const VENDORED_MODULE = /^# (\S+) (v\S+)$/gm;

const goNoticesOf = (program: string): readonly Notice[] =>
  [...readFileSync(join(program, 'vendor', 'modules.txt'), 'utf8').matchAll(VENDORED_MODULE)].map(
    ([, name = '', version = '']) => {
      const license = GO_MODULE_LICENSES[name];
      if (license === undefined) throw new Error(`${name} ${version} has no known license`);
      const text = readFileSync(join(program, 'vendor', name, 'LICENSE'), 'utf8').trim();
      return { name, version, license, text };
    },
  );

const moduleIds = await buildTypescriptPackage({
  dist: DIST,
  cli: join(PACKAGE, 'src', 'cli.ts'),
  packageAssets: join(PACKAGE, 'src', 'package-assets.ts'),
  otherExtractors: { 'extract-go': assets.goExtractor, 'extract-ruby': assets.rubyExtractor },
});

cpSync(GO_PROGRAM, join(DIST, 'go'), {
  recursive: true,
  filter: (source) =>
    statSync(source).isDirectory() || isGoExtractorSource(relative(GO_PROGRAM, source)),
});
writeFileSync(join(DIST, 'go-extractor-source.sha256'), sha256OfFiles(goSourceFiles()));
cpSync(RUBY_SCRIPTS, join(DIST, 'ruby'), { recursive: true });
writeFileSync(join(DIST, 'ruby-extractor-source.sha256'), sha256OfFiles(rubySourceFiles()));
writeFileSync(
  join(DIST, 'THIRD-PARTY-NOTICES.txt'),
  noticesOf([...npmNoticesOf(moduleIds), ...goNoticesOf(GO_PROGRAM)]),
);

for (const file of ['README.md', 'LICENSE'])
  copyFileSync(join(REPO_ROOT, file), join(PACKAGE, file));
