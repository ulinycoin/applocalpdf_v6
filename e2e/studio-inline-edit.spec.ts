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
  readSavedPageText,
  saveEdits,
  selectFirstPage,
  squash,
  uploadPdf,
  waitForSavedFileId,
  waitForTextLayer,
} from './studio-edit-helpers';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function createTextPdf(name: string): Promise<string> {
  const path = join(__dirname, `inline-${name}.pdf`);
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText('INLINE EDIT SAMPLE', { x: 80, y: 700, size: 24, font });
  const bytes = await doc.save();
  writeFileSync(path, bytes);
  return path;
}

async function createNoTextPdf(name: string): Promise<string> {
  const path = join(__dirname, `inline-notext-${name}.pdf`);
  const doc = await PDFDocument.create();
  doc.addPage([612, 792]);
  const bytes = await doc.save();
  writeFileSync(path, bytes);
  return path;
}

function safeDelete(path: string): void {
  if (existsSync(path)) {
    unlinkSync(path);
  }
}

test.describe('Studio inline text edit', () => {
  test.beforeEach(async ({ page }) => {
    await enableStudioTestApi(page);
  });

  test('supports inline edit and save', async ({ page }) => {
    const pdfPath = await createTextPdf('text');
    try {
      await uploadPdf(page, pdfPath);
      let currentFileId = await selectFirstPage(page);
      await openEditTool(page, 'Text');
      await waitForTextLayer(page);

      await clickTextLine(page, 0);
      const textarea = page.locator('.studio-edit-textarea').first();
      await expect(textarea).toBeVisible({ timeout: 10_000 });

      const fontSize = await textarea.evaluate((el) => window.getComputedStyle(el).fontSize);
      expect(Number.parseFloat(fontSize)).toBeGreaterThan(10);

      await fillInlineEditor(page, 'INLINE UPDATED');
      await saveEdits(page);
      await expect(page.getByTestId('studio-edit-save-btn')).toBeDisabled({ timeout: 15_000 });

      currentFileId = await waitForSavedFileId(page, currentFileId);
      expect(squash(await readSavedPageText(page, currentFileId))).toContain('INLINEUPDATED');

      // The saved page is reloaded inside the same overlay, so a second edit needs no reopening.
      await waitForTextLayer(page);
      await clickTextLine(page, 0);
      await fillInlineEditor(page, 'INLINE UPDATED AGAIN');
      await saveEdits(page);
      await expect(page.getByTestId('studio-edit-save-btn')).toBeDisabled({ timeout: 15_000 });

      currentFileId = await waitForSavedFileId(page, currentFileId);
      expect(squash(await readSavedPageText(page, currentFileId))).toContain('INLINEUPDATEDAGAIN');
    } finally {
      safeDelete(pdfPath);
    }
  });

  test('shows no-text-layer warning for PDF without embedded text', async ({ page }) => {
    const pdfPath = await createNoTextPdf('blank');
    try {
      await uploadPdf(page, pdfPath);
      await selectFirstPage(page);
      await openEditTool(page, 'Text');

      await expect(page.getByText(/no text layer/i)).toBeVisible({ timeout: 15_000 });
    } finally {
      safeDelete(pdfPath);
    }
  });
});
