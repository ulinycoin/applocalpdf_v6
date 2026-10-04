import { expect, test } from '@playwright/test';
import { existsSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import {
  clickTextLine,
  enableStudioTestApi,
  highlightBox,
  openEditTool,
  selectFirstPage,
  uploadPdf,
  waitForTextLayer,
} from './studio-edit-helpers';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function createPrecisionTestPdf(): Promise<string> {
  const path = join(__dirname, 'precision-test.pdf');
  const doc = await PDFDocument.create();
  const page = doc.addPage([600, 400]);
  const font = await doc.embedFont(StandardFonts.Helvetica);

  // Precise text at known coordinates
  page.drawText('PRECISION TEST LINE 1', { x: 50, y: 350, size: 20, font });

  const bytes = await doc.save();
  writeFileSync(path, bytes);
  return path;
}

function safeDelete(path: string): void {
  if (existsSync(path)) {
    unlinkSync(path);
  }
}

test.describe('Studio Edit Precision', () => {
  test.beforeEach(async ({ page }) => {
    await enableStudioTestApi(page);
  });

  test('Selection box matches text layer span', async ({ page }) => {
    const pdfPath = await createPrecisionTestPdf();

    try {
      await uploadPdf(page, pdfPath);
      await selectFirstPage(page);
      await openEditTool(page, 'Text');
      await waitForTextLayer(page);

      const box = await highlightBox(page, 0);
      await clickTextLine(page, 0);

      const textarea = page.locator('.studio-edit-textarea');
      await expect(textarea).toBeVisible({ timeout: 10_000 });
      const editBox = await textarea.boundingBox();
      expect(editBox).not.toBeNull();

      if (box && editBox) {
        const diffX = Math.abs(editBox.x - box.x);
        const diffY = Math.abs(editBox.y - box.y);

        // Assertions with tolerance (V6 should be within 2-3px)
        expect(diffX).toBeLessThan(5);
        expect(diffY).toBeLessThan(5);
      }
    } finally {
      safeDelete(pdfPath);
    }
  });

  test('text does not compress in narrow columns', async ({ page }) => {
    const pdfPath = await createPrecisionTestPdf();

    try {
      await uploadPdf(page, pdfPath);
      await selectFirstPage(page);
      await openEditTool(page, 'Text');
      await waitForTextLayer(page);

      const originalBox = await highlightBox(page, 0);
      await clickTextLine(page, 0);

      const textarea = page.locator('.studio-editor-element.selected textarea');
      await expect(textarea).toBeVisible({ timeout: 10_000 });

      const editBox = await textarea.boundingBox();
      expect(editBox).not.toBeNull();

      if (originalBox && editBox) {
        // Assert that the text area is at least 90% of the original bounding box
        // to prevent aggressive text compression wrapping.
        expect(editBox.width).toBeGreaterThan(originalBox.width * 0.9);
      }
    } finally {
      safeDelete(pdfPath);
    }
  });
});
