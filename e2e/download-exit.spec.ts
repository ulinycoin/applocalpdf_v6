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
import { existsSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ExcelJS from 'exceljs';

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

async function downloadedEvents(page: import('@playwright/test').Page): Promise<DownloadEvent[]> {
  return await page.evaluate(() => {
    const api = (window as unknown as {
      __LOCALPDF_V6_TEST_API?: { getTelemetrySnapshot: () => Array<{ type: string }> };
    }).__LOCALPDF_V6_TEST_API;
    if (!api) return [];
    return api.getTelemetrySnapshot().filter((event) => event.type === 'OUTPUT_DOWNLOADED');
  }) as DownloadEvent[];
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
