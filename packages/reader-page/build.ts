import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pageTemplate, PAGE_TEMPLATE_FILE } from './build/index.ts';

const DIST = join(import.meta.dirname, 'dist');

mkdirSync(DIST, { recursive: true });
writeFileSync(join(DIST, PAGE_TEMPLATE_FILE), await pageTemplate());
