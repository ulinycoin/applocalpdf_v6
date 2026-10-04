import { test, expect } from '@playwright/test';
import * as path from 'path';
import { enableStudioTestApi } from './studio-edit-helpers';

// We launch Chromium with --expose-gc flag down below when we need it
test.use({
  browserName: 'chromium',
  launchOptions: {
    args: ['--js-flags=--expose-gc'],
  },
});

const WARMUP_LOOPS = 5;
const MEASURED_LOOPS = 15;
const ONE_PAGE_PDF = path.join(process.cwd(), 'test', 'fixtures', 'pdfs', 'documents', 'simple-letter.pdf');

test.describe('Studio Editor Memory Leak Checks', () => {
  test('should not leak memory after multiple PDF uploads and closures', async ({ page }) => {
    test.setTimeout(420_000);
    await enableStudioTestApi(page);

    // Create an isolated CDP session
    const cdpSession = await page.context().newCDPSession(page);

    // The studio canvas is the editor surface: /pdf-editor is a legacy standalone tool.
    await page.goto('/app/studio');
    await expect(page.locator('.studio-empty-state')).toBeVisible({ timeout: 30_000 });

    // Function to explicitly collect garbage
    const forceGC = async (): Promise<void> => {
      await page.evaluate(() => {
        const gc = (window as Window & { gc?: () => void }).gc;
        if (typeof gc === 'function') {
          gc();
        }
      });
      // Yield to browser event loop to let GC finish
      await page.waitForTimeout(400);
    };

    // Function to get heap usage
    const getHeapSize = async (): Promise<number> => {
      return await page.evaluate(() => {
        const memory = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
        return memory?.usedJSHeapSize ?? 0;
      });
    };

    // Function to count DOM nodes via CDP. The counter also keeps nodes of documents that were
    // already closed, so the first uploads raise it to a new plateau — only the growth afterwards
    // is a leak signal.
    const getNodeCount = async (): Promise<number> => {
      const counters = await cdpSession.send('Memory.getDOMCounters');
      return counters.nodes;
    };

    const runUploadCycle = async (): Promise<void> => {
      await page.locator('input[type="file"]').first().setInputFiles(ONE_PAGE_PDF);
      await page.waitForFunction(() => {
        const store = (window as Window & { __LOCALPDF_STUDIO_STORE__?: { getState: () => { documents: Array<{ pages: unknown[] }> } } }).__LOCALPDF_STUDIO_STORE__;
        return (store?.getState().documents[0]?.pages.length ?? 0) > 0;
      }, { timeout: 30_000 });
      await page.locator('canvas').first().waitFor({ state: 'visible', timeout: 30_000 }).catch(() => undefined);

      // Do a simple edit interaction to populate history/tools (open the text editor, then leave it).
      await page.locator('.studio-tool-rail').getByRole('button', { name: 'Text', exact: true }).click();
      await page.locator('.studio-edit-shell').waitFor({ state: 'visible', timeout: 30_000 }).catch(() => undefined);
      await page.locator('.studio-edit-back-btn').click({ timeout: 10_000 }).catch(() => undefined);

      // "Close" the document and return to the empty state.
      await page.evaluate(() => {
        const store = (window as Window & { __LOCALPDF_STUDIO_STORE__?: { getState: () => { clear: () => void } } }).__LOCALPDF_STUDIO_STORE__;
        store?.getState().clear();
      });
      await page.waitForFunction(() => {
        const store = (window as Window & { __LOCALPDF_STUDIO_STORE__?: { getState: () => { documents: unknown[] } } }).__LOCALPDF_STUDIO_STORE__;
        return (store?.getState().documents.length ?? 0) === 0;
      }, { timeout: 15_000 });

      // Let the GC do its work inside the loop
      await forceGC();
    };

    // 1. Warm-up: the canvas and its Konva stage allocate their nodes on the first uploads.
    for (let i = 0; i < WARMUP_LOOPS; i += 1) {
      await runUploadCycle();
    }
    await forceGC();
    const warmHeap = await getHeapSize();
    const warmNodes = await getNodeCount();
    console.log(`[Memory] Warm baseline: Heap=${Math.round(warmHeap / 1024 / 1024)}MB, Nodes=${warmNodes}`);

    // 2. Measured phase: this growth must stay flat, otherwise the editor leaks per document.
    for (let i = 0; i < MEASURED_LOOPS; i += 1) {
      await runUploadCycle();
    }
    await forceGC();
    const finalHeap = await getHeapSize();
    const finalNodes = await getNodeCount();

    const heapDeltaMb = (finalHeap - warmHeap) / 1024 / 1024;
    const nodesDelta = finalNodes - warmNodes;

    console.log(`[Memory] Final: Heap=${Math.round(finalHeap / 1024 / 1024)}MB, Nodes=${finalNodes}`);
    console.log(`[Memory] Delta over ${MEASURED_LOOPS} cycles: Heap=${heapDeltaMb.toFixed(2)}MB, Nodes=${nodesDelta}`);

    // Assertions
    // An acceptable delta is usually less than 15-20MB if caching occurs; 50MB is the ceiling.
    expect(heapDeltaMb).toBeLessThan(50);
    // A per-cycle DOM leak would add ~40 nodes per upload (measured outside this spec); the plateau
    // after warm-up stays in the low tens.
    expect(nodesDelta).toBeLessThan(100);
  });
});
