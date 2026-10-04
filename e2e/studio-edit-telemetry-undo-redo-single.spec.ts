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

async function createPdf(name: string): Promise<string> {
  const path = join(__dirname, `telemetry-undo-redo-single-${name}.pdf`);
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText('TELEMETRY UNDO REDO SINGLE', { x: 80, y: 700, size: 24, font });
  writeFileSync(path, await doc.save());
  return path;
}

function safeDelete(path: string): void {
  if (existsSync(path)) {
    unlinkSync(path);
  }
}

test.describe('Studio telemetry undo/redo single P2', () => {
  test.setTimeout(150_000);

  test.beforeEach(async ({ page }) => {
    await enableStudioTestApi(page);
  });

  test('emits apply/undo/redo save actions for single scope', async ({ page }) => {
    const pdfPath = await createPdf('single');
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
      await fillInlineEditor(page, 'TELEMETRY UNDO REDO SINGLE UPDATED');
      await saveEdits(page);

      await expect(page.getByText(/Changes applied/i)).toBeVisible({ timeout: 15_000 });
      await waitForSavedFileId(page, beforeFileId);

      await page.getByRole('button', { name: /Undo Save/i }).click();
      await page.getByRole('button', { name: /Redo Save/i }).click();

      const actionsHandle = await page.waitForFunction(() => {
        const api = (window as Window & { __LOCALPDF_V6_TEST_API?: { getTelemetrySnapshot?: () => Array<{ type?: string; scope?: string }> } }).__LOCALPDF_V6_TEST_API;
        const events = api?.getTelemetrySnapshot?.() ?? [];
        const actions = events.filter((event) => event?.type === 'STUDIO_EDIT_SAVE_ACTION' && event.scope === 'single');
        return actions.length >= 3 ? actions : null;
      }, { timeout: 15_000 });

      const actions = await actionsHandle.jsonValue() as Array<Record<string, unknown>>;
      const hasApply = actions.some((event) => (
        event.action === 'apply'
        && event.pagesTotal === 1
        && event.pagesSucceeded === 1
        && event.pagesFailed === 0
        && typeof event.overflowCount === 'number'
      ));
      const hasUndo = actions.some((event) => (
        event.action === 'undo'
        && event.pagesTotal === 1
        && event.pagesSucceeded === 1
        && event.pagesFailed === 0
      ));
      const hasRedo = actions.some((event) => (
        event.action === 'redo'
        && event.pagesTotal === 1
        && event.pagesSucceeded === 1
        && event.pagesFailed === 0
      ));

      expect(hasApply).toBe(true);
      expect(hasUndo).toBe(true);
      expect(hasRedo).toBe(true);
    } finally {
      safeDelete(pdfPath);
    }
  });
});
