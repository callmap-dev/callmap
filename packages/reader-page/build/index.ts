/**
 * The build of the reader page: it bundles the page script in `page/` with elkjs once, and gives
 * the page template, the HTML shell with the page style and the page script inlined and one place
 * for the data block. Each distribution writes its pages from this template.
 */

export { pageTemplate, pageTemplateBuild } from './page-build.ts';
export type { PageTemplateBuild } from './page-build.ts';
export { PAGE_TEMPLATE_FILE } from './page-template.ts';
