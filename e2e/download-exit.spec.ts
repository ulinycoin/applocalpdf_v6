/**
 * End-to-end guard for the download exit contract (plan v2, Step 0).
 *
 * The wizard used to hand files over through `createBrowserIOAdapter.save()` with no daily-quota gate
 * and no telemetry, so a free user could download unlimited results and the funnel never saw them.
 * `word-to-pdf` and `excel-to-pdf` are the only tools whose wizard still runs standalone
 * (`shared/standalone-tools.ts`); every other tool forwards into Studio, so this is the whole surface
 * that was ungated. These tests drive the real UI and read the real quota, so a regression shows up as
 * a failed assertion here rather than as a silently wrong metric in PostHog.
 */
import { test, expect } from '@playwright/test';
import { existsSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ExcelJS from 'exceljs';
import { PDFDocument } from 'pdf-lib';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const QUOTA_KEY = 'localpdf_daily_files';

async function createXlsx(): Promise<string> {
  const path = join(__dirname, 'download-exit-standalone.xlsx');
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Sheet1');
  ws.addRow(['Name', 'Score']);
  ws.addRow(['Alice', 10]);
  ws.addRow(['Bob', 20]);
  await wb.xlsx.writeFile(path);
  return path;
}

async function createPdf(name: string, pages = 2): Promise<string> {
  const path = join(__dirname, `download-exit-${name}.pdf`);
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i += 1) {
    doc.addPage([612, 792]);
    doc.getPage(i).drawText(`page ${i + 1}`, { x: 40, y: 700 });
  }
  writeFileSync(path, await doc.save());
  return path;
}

function removeFile(path: string): void {
  if (existsSync(path)) {
    unlinkSync(path);
  }
}

async function readQuota(page: import('@playwright/test').Page): Promise<number> {
  return await page.evaluate((key) => {
    const raw = window.localStorage.getItem(key);
    return raw ? Number(JSON.parse(raw).downloaded ?? 0) : 0;
  }, QUOTA_KEY);
}

interface DownloadEvent {
  type: string;
  outcome?: string;
  surface?: string;
  toolId?: string;
  requested?: number;
  outputCount?: number;
  reason?: string;
}

async function workspaceCount(page: import('@playwright/test').Page): Promise<number> {
  return await page.evaluate(() => {
    const store = (window as unknown as { __LOCALPDF_STUDIO_STORE__?: { getState: () => { documents: unknown[] } } }).__LOCALPDF_STUDIO_STORE__;
    return store?.getState().documents.length ?? -1;
  });
}

async function downloadedEvents(page: import('@playwright/test').Page): Promise<DownloadEvent[]> {
  return await page.evaluate(() => {
    const api = (window as unknown as {
      __LOCALPDF_V6_TEST_API?: { getTelemetrySnapshot: () => Array<{ type: string }> };
    }).__LOCALPDF_V6_TEST_API;
    if (!api) return [];
    return api.getTelemetrySnapshot().filter((event) => event.type === 'OUTPUT_DOWNLOADED');
  }) as DownloadEvent[];
}

/**
 * Keeps the real PostHog snippet from throwing inside the app (`t.push is not a function`) by giving it
 * an object to claim. The spec itself asserts on the offer banner and the exported files, not on
 * capture calls: what the app *sends* is covered deterministically by
 * `src/app/react/monetization-telemetry.test.ts`.
 */
async function installPosthogStub(page: import('@playwright/test').Page): Promise<void> {
  await page.addInitScript(() => {
    (window as unknown as { __PLAYWRIGHT_TEST__?: boolean }).__PLAYWRIGHT_TEST__ = true;
    (window as unknown as { posthog?: unknown }).posthog = {
      capture: () => {},
      push: () => {},
      get_distinct_id: () => 'e2e-distinct-id',
    };
  });
}

test.describe('download exit contract', () => {
  test('the standalone wizard now spends the daily allowance and reports every attempt', async ({ page }) => {
    const xlsxPath = await createXlsx();
    await page.addInitScript(() => {
      (window as unknown as { __PLAYWRIGHT_TEST__?: boolean }).__PLAYWRIGHT_TEST__ = true;
    });

    try {
      await page.goto('/app/excel-to-pdf');
      await page.evaluate((key) => window.localStorage.removeItem(key), QUOTA_KEY);

      const fileInput = page.locator('input[type="file"]').first();
      await fileInput.setInputFiles(xlsxPath);
      // The plugin reuses one button: "Convert to PDF" becomes "Download PDF" once a result exists.
      const runButton = page.getByRole('button', { name: /Convert to PDF/i });
      await expect(runButton).toBeVisible({ timeout: 30_000 });
      await runButton.click();

      const downloadButton = page.getByRole('button', { name: /Download PDF/i }).first();
      await expect(downloadButton).toBeVisible({ timeout: 90_000 });

      for (let i = 1; i <= 3; i += 1) {
        await downloadButton.click();
        await expect.poll(() => readQuota(page), { timeout: 15_000 }).toBe(i);
      }

      const successes = (await downloadedEvents(page)).filter((event) => event.outcome === 'success');
      expect(successes.length).toBe(3);
      expect(successes[0].surface).toBe('wizard');
      expect(successes[0].toolId).toBe('excel-to-pdf');

      // The fourth attempt is refused by the same gate Studio uses, and the refusal is measured.
      await downloadButton.click();
      await expect(page.getByText(/Free includes 3 downloads per day/i)).toBeVisible({ timeout: 15_000 });
      await expect.poll(() => readQuota(page), { timeout: 5_000 }).toBe(3);

      const denied = (await downloadedEvents(page)).filter((event) => event.outcome === 'denied');
      expect(denied.length).toBe(1);
      expect(denied[0].surface).toBe('wizard');
      expect(denied[0].reason).toBe('daily_download_limit');
      expect(denied[0].requested).toBe(1);
    } finally {
      removeFile(xlsxPath);
    }
  });
});

/**
 * The offer is only worth testing if it renders at the right moment and reachable numbers prove it.
 * This drives the real Studio export and reads what PostHog would have received (`window.posthog` is
 * stubbed before the app loads, so the capture calls are recorded verbatim).
 */
test.describe('post-export offer', () => {
  test('shows once after a successful export with two workspaces, and never for the singleton case', async ({ page }) => {
    const first = await createPdf('workspace-one');
    const second = await createPdf('workspace-two');
    await installPosthogStub(page);

    try {
      await page.goto('/app/studio');
      await page.locator('input[type="file"]').first().setInputFiles([first, second]);

      // Import is incremental: the first document is usable long before the second lands in the store,
      // and the offer is qualified on what is actually on the canvas at export time. Waiting for the
      // count is what makes this the multi-document case rather than two separate single ones.
      await expect.poll(async () => await workspaceCount(page), { timeout: 90_000 }).toBe(2);
      await expect(page.getByRole('button', { name: 'Download' })).toBeEnabled({ timeout: 60_000 });

      const downloadButton = page.getByRole('button', { name: 'Download' });
      await downloadButton.click();
      await expect(page.locator('.studio-download-modal-input')).toBeVisible({ timeout: 10_000 });
      await page.getByTestId('studio-download-submit').click();

      const banner = page.getByTestId('studio-export-offer');
      await expect(banner).toBeVisible({ timeout: 30_000 });
      await expect(banner).toContainText('More PDF work to do?');
      await expect(banner).toContainText('$19 once');

      // A second export in the same session must not re-show it (the qualified impression is spent once).
      await page.getByTestId('studio-export-offer-continue').click();
      await expect(banner).toBeHidden();
      await downloadButton.click();
      await expect(page.locator('.studio-download-modal-input')).toBeVisible({ timeout: 10_000 });
      await page.getByTestId('studio-download-submit').click();
      await expect(banner).toBeHidden({ timeout: 10_000 });
    } finally {
      removeFile(first);
      removeFile(second);
    }
  });

  test('a single document on the canvas is not qualified', async ({ page }) => {
    const only = await createPdf('workspace-single');
    await installPosthogStub(page);

    try {
      await page.goto('/app/studio');
      await page.locator('input[type="file"]').first().setInputFiles(only);
      await expect.poll(async () => await workspaceCount(page), { timeout: 90_000 }).toBe(1);
      await expect(page.getByRole('button', { name: 'Download' })).toBeEnabled({ timeout: 60_000 });
      await page.getByRole('button', { name: 'Download' }).click();
      await expect(page.locator('.studio-download-modal-input')).toBeVisible({ timeout: 10_000 });
      await page.getByTestId('studio-download-submit').click();

      // The export itself is reported, the offer is not.
      await expect(page.getByTestId('studio-export-offer')).toBeHidden({ timeout: 15_000 });
      await expect.poll(async () => await page.evaluate(() => {
        const api = (window as unknown as { __LOCALPDF_V6_TEST_API?: { getTelemetrySnapshot: () => Array<{ type: string; outcome?: string }> } }).__LOCALPDF_V6_TEST_API;
        return api?.getTelemetrySnapshot().filter((event) => event.type === 'OUTPUT_DOWNLOADED' && event.outcome === 'success').length ?? 0;
      }), { timeout: 15_000 }).toBeGreaterThan(0);
    } finally {
      removeFile(only);
    }
  });
});
