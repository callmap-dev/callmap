import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rolldown } from 'rolldown';
import { pageTemplateOf } from './page-template.ts';

const PAGE = fileURLToPath(new URL('../page/', import.meta.url));
const PARTS = join(PAGE, 'parts');
const ENTRY = '\0reader-page-entry';
const ELK_WORKER = createRequire(import.meta.url).resolve('elkjs/lib/elk-worker.min.js');

const partsWith = (extension: string): readonly string[] =>
  readdirSync(PARTS)
    .filter((name) => name.endsWith(extension))
    .sort()
    .map((name) => join(PARTS, name));

const entrySource = (): string => {
  const parts = partsWith('.ts');
  return [
    `import { startReaderPage } from ${JSON.stringify(join(PAGE, 'main.ts'))};`,
    ...parts.map((path, index) => `import part${index} from ${JSON.stringify(path)};`),
    `startReaderPage([${parts.map((_, index) => `part${index}`).join(', ')}]);`,
  ].join('\n');
};

interface PageBundle {
  readonly script: string;
  readonly moduleIds: readonly string[];
}

const pageBundle = async (): Promise<PageBundle> => {
  const bundle = await rolldown({
    input: ENTRY,
    platform: 'browser',
    logLevel: 'silent',
    transform: {
      define: { ELK_WORKER_SOURCE: JSON.stringify(readFileSync(ELK_WORKER, 'utf8')) },
    },
    plugins: [
      {
        name: 'reader-page-entry',
        resolveId: (id) => (id === ENTRY ? id : null),
        load: (id) => (id === ENTRY ? entrySource() : null),
      },
    ],
  });
  try {
    const { output } = await bundle.generate({ format: 'iife', minify: true });
    const chunks = output.flatMap((chunk) => (chunk.type === 'chunk' ? [chunk] : []));
    return {
      script: chunks.map(({ code }) => code).join('\n'),
      moduleIds: chunks.flatMap(({ moduleIds }) => moduleIds),
    };
  } finally {
    await bundle.close();
  }
};

const pageStyle = (): string =>
  [join(PAGE, 'page.css'), join(PAGE, 'drawing.css'), ...partsWith('.css')]
    .map((path) => readFileSync(path, 'utf8'))
    .join('\n');

export interface PageTemplateBuild {
  readonly template: string;
  readonly moduleIds: readonly string[];
}

export const pageTemplateBuild = async (): Promise<PageTemplateBuild> => {
  const { script, moduleIds } = await pageBundle();
  return { template: pageTemplateOf(pageStyle(), script), moduleIds };
};

export const pageTemplate = async (): Promise<string> => (await pageTemplateBuild()).template;
