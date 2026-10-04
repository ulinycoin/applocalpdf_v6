import { expect, test } from '@playwright/test';
import { existsSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import {
  clickTextLine,
  enableStudioTestApi,
  fillInlineEditor,
  openEditTool,
  saveEdits,
  selectFirstPage,
  uploadPdf,
  waitForSavedFileId,
  waitForTextLayer,
} from './studio-edit-helpers';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function createTextPdf(name: string): Promise<string> {
  const path = join(__dirname, `telemetry-edit-${name}.pdf`);
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText('TELEMETRY SAMPLE', { x: 80, y: 700, size: 24, font });
  writeFileSync(path, await doc.save());
  return path;
}

function safeDelete(path: string): void {
  if (existsSync(path)) {
    unlinkSync(path);
  }
}

test.describe('Studio telemetry P2', () => {
  test.beforeEach(async ({ page }) => {
    await enableStudioTestApi(page);
  });

  test('emits STUDIO_EDIT_SAVE_ACTION after save', async ({ page }) => {
    const pdfPath = await createTextPdf('apply');
    try {
      await uploadPdf(page, pdfPath);
      await page.evaluate(() => {
        const api = (window as Window & { __LOCALPDF_V6_TEST_API?: { clearTelemetry?: () => void } }).__LOCALPDF_V6_TEST_API;
        api?.clearTelemetry?.();
      });

      const beforeFileId = await selectFirstPage(page);
      await openEditTool(page, 'Text');
      await waitForTextLayer(page);

      await clickTextLine(page, 0);
      await fillInlineEditor(page, 'TELEMETRY UPDATED');
      await saveEdits(page);
      await expect(page.getByText(/Changes applied/i)).toBeVisible({ timeout: 15_000 });
      await waitForSavedFileId(page, beforeFileId);

      const saveActions = await page.waitForFunction(() => {
        const api = (window as Window & { __LOCALPDF_V6_TEST_API?: { getTelemetrySnapshot?: () => Array<{ type?: string }> } }).__LOCALPDF_V6_TEST_API;
        const events = api?.getTelemetrySnapshot?.() ?? [];
        const found = events.filter((event) => event?.type === 'STUDIO_EDIT_SAVE_ACTION');
        return found.length > 0 ? found : null;
      }, { timeout: 15_000 });

      const telemetryEvents = await saveActions.jsonValue() as Array<Record<string, unknown>>;
      const applyEvent = telemetryEvents.find((event) => event.action === 'apply');
      expect(applyEvent).toBeTruthy();
      expect(applyEvent?.scope).toBe('single');
      expect(applyEvent?.pagesTotal).toBe(1);
      expect(applyEvent?.pagesSucceeded).toBe(1);
      expect(applyEvent?.pagesFailed).toBe(0);
    } finally {
      safeDelete(pdfPath);
    }
  });
});
