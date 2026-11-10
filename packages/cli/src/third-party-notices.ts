import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { packageManifestAt } from './package-manifest.ts';

const PACKAGE_FOLDER = /^(.*[\\/]node_modules[\\/](?:@[^\\/]+[\\/])?[^\\/]+)[\\/]/;
const LICENSE_FILE = /^(licen[cs]e|copying)(\..*)?$/i;

export interface Notice {
  readonly name: string;
  readonly version: string;
  readonly license: string;
  readonly text: string;
}

const noticeOf = (folder: string): Notice => {
  const { name, version, license } = packageManifestAt(join(folder, 'package.json'));
  const file = readdirSync(folder).find((entry) => LICENSE_FILE.test(entry));
  if (typeof license !== 'string' || file === undefined)
    throw new Error(`${name} ${version} names no license or has no license file`);
  return { name, version, license, text: readFileSync(join(folder, file), 'utf8').trim() };
};

export const npmNoticesOf = (moduleIds: readonly string[]): readonly Notice[] => {
  const folders = new Set(moduleIds.flatMap((id) => PACKAGE_FOLDER.exec(id)?.slice(1, 2) ?? []));
  return [...folders].map(noticeOf);
};

export const noticesOf = (bundled: readonly Notice[]): string => {
  const notices = new Map(bundled.map((notice) => [`${notice.name} ${notice.version}`, notice]));
  return [
    'Callmap bundles the third-party packages below. Each one keeps its own license.\n',
    ...[...notices.entries()]
      .sort(([first], [second]) => first.localeCompare(second))
      .map(([title, { license, text }]) => `${title}\nLicense: ${license}\n\n${text}\n`),
  ].join(`\n${'-'.repeat(72)}\n\n`);
};
