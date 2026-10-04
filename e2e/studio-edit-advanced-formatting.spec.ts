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
  const path = join(__dirname, `advanced-format-${name}.pdf`);
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText('ADVANCED FORMAT SAMPLE', { x: 80, y: 700, size: 24, font });
  writeFileSync(path, await doc.save());
  return path;
}

function safeDelete(path: string): void {
  if (existsSync(path)) {
    unlinkSync(path);
  }
}

test.describe('Studio advanced formatting P2', () => {
  test.beforeEach(async ({ page }) => {
    await enableStudioTestApi(page);
  });

  test('applies line-height and letter-spacing in editor and saves', async ({ page }) => {
    const pdfPath = await createTextPdf('p2');
    try {
      await uploadPdf(page, pdfPath);
      const beforeFileId = await selectFirstPage(page);
      await openEditTool(page, 'Text');
      await waitForTextLayer(page);

      await clickTextLine(page, 0);
      await fillInlineEditor(page, 'ADVANCED FORMAT TEXT');

      // The typography rail is the live home of these controls; the old floating menu is not rendered.
      const lineHeightInput = page.locator('.ep-field[title="Line height"] input');
      const letterSpacingInput = page.locator('.ep-field[title="Letter spacing"] input');
      await expect(lineHeightInput).toBeVisible({ timeout: 10_000 });
      await expect(letterSpacingInput).toBeVisible({ timeout: 10_000 });
      await lineHeightInput.fill('1.8');
      await letterSpacingInput.fill('2.4');

      const textBox = page.locator('.studio-edit-text').first();
      const lineHeight = await textBox.evaluate((el) => window.getComputedStyle(el).lineHeight);
      const letterSpacing = await textBox.evaluate((el) => window.getComputedStyle(el).letterSpacing);
      expect(Number.parseFloat(lineHeight)).toBeGreaterThan(20);
      expect(Number.parseFloat(letterSpacing)).toBeGreaterThan(2);

      await saveEdits(page);
      await expect(page.getByText(/Changes applied/i).first()).toBeVisible({ timeout: 15_000 });

      const updatedFileId = await waitForSavedFileId(page, beforeFileId);
      expect(squash(await readSavedPageText(page, updatedFileId))).toContain('ADVANCEDFORMATTEXT');
    } finally {
      safeDelete(pdfPath);
    }
  });
});
