import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { createContext, Script } from 'node:vm';
import { reviewInputOfPage } from '@callmap/review-input';
import { fireEvent, within } from '@testing-library/dom';
import type { JSDOM } from 'jsdom';
import { beforeAll, describe, expect, it } from 'vitest';
import { boxesOf, loadReaderPage, loadReaderPageWith, openTab, settled } from './reader-page.ts';
import { readerPageOfFile } from './review-input-file.ts';
import type { LoadedPage } from './reader-page.ts';

let html = '';

beforeAll(async () => {
  html = await readerPageOfFile('typescript/review');
});

const graphOf = ({ window }: LoadedPage): HTMLElement => {
  const graph = window.document.getElementById('graph');
  if (graph === null) throw new Error('the page holds no graph');
  return graph;
};

const functionIdsOf = (page: LoadedPage): readonly string[] =>
  boxesOf(page)
    .filter(({ kind }) => kind === 'function')
    .map(({ id }) => id);

describe('the layout of the Diff view and the Whole project view', () => {
  it('is not in the review input that the page reads', () => {
    expect(Object.keys(reviewInputOfPage(html))).not.toContain('placements');
  });

  it('runs in the page for the Diff view', async () => {
    const page = await loadReaderPage(html);
    expect(page.layouts).toEqual(['callmap layout: Diff']);
    expect(functionIdsOf(page)).toContain('src/cart.ts#receipt');
  });

  it('runs in the page for the top level of the Whole project view', async () => {
    const page = await loadReaderPage(html);
    await openTab(page, 'Whole project');
    expect(page.layouts).toEqual([
      'callmap layout: Diff',
      'callmap layout: Whole project level:src',
    ]);
    expect(boxesOf(page).length).toBeGreaterThan(0);
  });

  it('marks the graph busy while it runs, and not busy after it', async () => {
    const page = await loadReaderPage(html);
    expect(graphOf(page).getAttribute('aria-busy')).toBe('false');
    fireEvent.click(within(page.window.document.body).getByRole('tab', { name: 'Whole project' }));
    expect(graphOf(page).getAttribute('aria-busy')).toBe('true');
    await settled(page);
    expect(graphOf(page).getAttribute('aria-busy')).toBe('false');
    expect(page.layouts).toHaveLength(2);
  });
});

const ELK_WORKER_SOURCE = readFileSync(
  createRequire(import.meta.url).resolve('elkjs/lib/elk-worker.min.js'),
  'utf8',
);

interface WorkerRun {
  readonly urls: string[];
  readonly sources: string[];
  readonly layoutOptions: Readonly<Record<string, string>>[];
}

interface WorkerSelf {
  onmessage?: (message: { readonly data: unknown }) => void;
}

/** A Web Worker of the page runs its source in a realm of its own, and each message is a copy. */
const withWorkerOf = (run: WorkerRun) => (window: JSDOM['window']) => {
  const blobs = new Map<string, Blob>();
  Object.assign(window.URL, {
    createObjectURL: (blob: Blob): string => {
      const url = `blob:callmap/${String(blobs.size)}`;
      blobs.set(url, blob);
      return url;
    },
  });
  class PageWorker extends window.EventTarget {
    onmessage: ((message: { readonly data: unknown }) => void) | undefined;
    readonly #self: Promise<WorkerSelf>;

    constructor(url: string) {
      super();
      run.urls.push(url);
      this.#self = (blobs.get(url)?.text() ?? Promise.reject(new Error(`no blob at ${url}`))).then(
        (source) => {
          run.sources.push(source);
          const self: WorkerSelf = createContext({
            setTimeout,
            clearTimeout,
            console,
            postMessage: (data: unknown) => {
              const copy: unknown = window.JSON.parse(JSON.stringify(data));
              setTimeout(() => this.onmessage?.({ data: copy }), 0);
            },
          });
          new Script('globalThis.self = globalThis;').runInContext(self);
          new Script(source).runInContext(self);
          return self;
        },
      );
    }

    postMessage(data: { readonly cmd: string; readonly graph?: { layoutOptions?: object } }) {
      if (data.cmd === 'layout')
        run.layoutOptions.push({ ...(data.graph?.layoutOptions as Record<string, string>) });
      const text = JSON.stringify(data);
      void this.#self.then((self) => {
        self.onmessage?.({ data: JSON.parse(text) as unknown });
      });
    }

    terminate() {
      return undefined;
    }
  }
  Object.assign(window, { Worker: PageWorker });
};

describe('the layout where the browser has a Worker', () => {
  it('runs the elkjs worker source that the page build inlines, from a Blob URL, with the thoroughness 3', async () => {
    const run: WorkerRun = { urls: [], sources: [], layoutOptions: [] };
    const page = await loadReaderPageWith(html, withWorkerOf(run));
    await openTab(page, 'Whole project');
    expect(run.urls).toEqual(['blob:callmap/0']);
    expect(run.sources).toEqual([ELK_WORKER_SOURCE]);
    expect(run.layoutOptions.map((options) => options['elk.layered.thoroughness'])).toEqual([
      '3',
      '3',
    ]);
    expect(page.layouts).toEqual([
      'callmap layout: Diff',
      'callmap layout: Whole project level:src',
    ]);
    expect(boxesOf(page).length).toBeGreaterThan(0);
  });
});

const withBlobUrls = (window: JSDOM['window']): void => {
  Object.assign(window.URL, { createObjectURL: (): string => 'blob:callmap/0' });
};

const withRefusedWorker = (window: JSDOM['window']): void => {
  withBlobUrls(window);
  function RefusedWorker(): never {
    throw new window.DOMException('worker-src refuses blob:', 'SecurityError');
  }
  Object.assign(window, { Worker: RefusedWorker });
};

const withFailedWorker = (window: JSDOM['window']): void => {
  withBlobUrls(window);
  class FailedWorker extends window.EventTarget {
    onmessage: unknown;

    constructor() {
      super();
      setTimeout(() => this.dispatchEvent(new window.Event('error')), 0);
    }

    postMessage() {
      return undefined;
    }

    terminate() {
      return undefined;
    }
  }
  Object.assign(window, { Worker: FailedWorker });
};

describe('the layout where the browser does not start the worker', () => {
  it.each([
    ['refuses to construct the worker', withRefusedWorker],
    ['fires an error on the worker', withFailedWorker],
  ])('runs in the page when the browser %s', async (_, withWorker) => {
    const page = await loadReaderPageWith(html, withWorker);
    await openTab(page, 'Whole project');
    expect(page.layouts).toEqual([
      'callmap layout: Diff',
      'callmap layout: Whole project level:src',
    ]);
    expect(graphOf(page).getAttribute('aria-busy')).toBe('false');
    expect(boxesOf(page).length).toBeGreaterThan(0);
  });
});
