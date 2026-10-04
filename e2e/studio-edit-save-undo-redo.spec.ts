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
  const path = join(__dirname, `p1-save-undo-redo-${name}.pdf`);
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText('UNDO REDO SAMPLE', { x: 80, y: 700, size: 24, font });
  writeFileSync(path, await doc.save());
  return path;
}

function safeDelete(path: string): void {
  if (existsSync(path)) {
    unlinkSync(path);
  }
}

test.describe('Studio save undo/redo P1', () => {
  test.setTimeout(150_000);

  test.beforeEach(async ({ page }) => {
    await enableStudioTestApi(page);
  });

  test('reverts and reapplies saved output file id', async ({ page }) => {
    const pdfPath = await createPdf('single');
    try {
      await uploadPdf(page, pdfPath);
      const initialFileId = await selectFirstPage(page);
      await openEditTool(page, 'Text');
      await waitForTextLayer(page);

      await clickTextLine(page, 0);
      await fillInlineEditor(page, 'SAVE UNDO REDO P1');
      await saveEdits(page);

      const savedFileId = await waitForSavedFileId(page, initialFileId);

      await page.getByRole('button', { name: /Undo Save/i }).click();
      await page.waitForFunction((expected) => {
        const store = (window as Window & { __LOCALPDF_STUDIO_STORE__?: { getState: () => {
          documents: Array<{ pages: Array<{ fileId: string }> }>;
        } } }).__LOCALPDF_STUDIO_STORE__;
        return store?.getState().documents[0]?.pages[0]?.fileId === expected;
      }, initialFileId, { timeout: 90_000 });

      await page.getByRole('button', { name: /Redo Save/i }).click();
      await page.waitForFunction((expected) => {
        const store = (window as Window & { __LOCALPDF_STUDIO_STORE__?: { getState: () => {
          documents: Array<{ pages: Array<{ fileId: string }> }>;
        } } }).__LOCALPDF_STUDIO_STORE__;
        return store?.getState().documents[0]?.pages[0]?.fileId === expected;
      }, savedFileId, { timeout: 90_000 });
    } finally {
      safeDelete(pdfPath);
    }
  });
});
