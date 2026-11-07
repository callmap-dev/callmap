import { dataBlockOf } from '@callmap/review-input';
import type { ReviewInput } from '@callmap/review-input';
import { assets } from './assets.ts';

const inlineScript = (code: string): string => code.replaceAll('</script', '<\\/script');

const pageOf = (input: ReviewInput, script: string): string => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Callmap review</title>
<style>
${assets.pageStyle()}
</style>
</head>
<body>
<header class="top-bar">
<h1 class="brand"><svg viewBox="0 0 18 18" aria-hidden="true"><rect x="1" y="6.5" width="5" height="5" rx="1.2"/><rect x="12" y="1.5" width="5" height="5" rx="1.2"/><rect x="12" y="11.5" width="5" height="5" rx="1.2"/><path d="M6 9H9V4H12M9 9V14H12"/></svg>Callmap</h1>
<nav id="views" class="tabs"></nav>
</header>
<div class="reader">
<div id="panels"></div>
<main id="graph" aria-label="Call graph"></main>
</div>
${dataBlockOf(input)}
<script>
${inlineScript(script)}
</script>
</body>
</html>
`;

export const readerPageOf = async (input: ReviewInput): Promise<string> =>
  pageOf(input, await assets.pageScript());
