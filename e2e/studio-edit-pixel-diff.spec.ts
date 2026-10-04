import { expect, test } from '@playwright/test';
import { existsSync, unlinkSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';
import {
  clickTextLine,
  enableStudioTestApi,
  fillInlineEditor,
  openEditTool,
  readVfsFileBase64,
  saveEdits,
  selectFirstPage,
  selectLastDocumentFirstPage,
  uploadPdf,
  waitForSavedFileId,
  waitForTextLayer,
} from './studio-edit-helpers';

// Playwright's own output directory: the repo ignores it, so the debug rasters never show up as
// untracked build artifacts.
const WORK_DIR = join(process.cwd(), 'test-results', 'studio-edit-pixel-diff');

async function createBasePdf(): Promise<string> {
  if (!existsSync(WORK_DIR)) mkdirSync(WORK_DIR, { recursive: true });
  const path = join(WORK_DIR, 'diff-test.pdf');
  const doc = await PDFDocument.create();
  const page = doc.addPage([500, 300]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText('Original Text to Edit', { x: 50, y: 250, size: 24, font });
  writeFileSync(path, await doc.save());
  return path;
}

test.describe('Studio Edit Pixel Diff', () => {
  test.setTimeout(180_000);

  test.beforeEach(async ({ page }) => {
    await enableStudioTestApi(page);
  });

  test('edited pdf matches ui screenshot', async ({ page }) => {
    if (!existsSync(WORK_DIR)) mkdirSync(WORK_DIR, { recursive: true });
    const pdfPath = await createBasePdf();

    try {
      // 1. Edit the PDF in the studio and capture what the editor renders.
      await uploadPdf(page, pdfPath);
      const beforeFileId = await selectFirstPage(page);
      await openEditTool(page, 'Text');
      await waitForTextLayer(page);

      await clickTextLine(page, 0);
      await fillInlineEditor(page, 'Testing pixel diff render');

      const sheet = page.locator('.studio-edit-canvas-content').first();
      const sheetBox = await sheet.boundingBox();
      if (!sheetBox) {
        throw new Error('Missing edit canvas bounds');
      }
      // Click the empty bottom-right corner: commits the inline editor and clears the selection.
      await sheet.click({
        position: { x: Math.floor(sheetBox.width * 0.8), y: Math.floor(sheetBox.height * 0.8) },
      });

      const uiScreenshotBuffer = await sheet.screenshot();

      await saveEdits(page);
      const savedFileId = await waitForSavedFileId(page, beforeFileId);

      // 2. Reopen the saved output straight from the VFS and render it through the same editor.
      const editedPath = join(WORK_DIR, 'edited.pdf');
      writeFileSync(editedPath, Buffer.from(await readVfsFileBase64(page, savedFileId), 'base64'));
      await uploadPdf(page, editedPath);
      await selectLastDocumentFirstPage(page);
      await openEditTool(page, 'Text');
      await waitForTextLayer(page);

      const savedSheet = page.locator('.studio-edit-canvas-content').first();
      const savedScreenshotBuffer = await savedSheet.screenshot();

      const uiPng = PNG.sync.read(uiScreenshotBuffer);
      const savedPng = PNG.sync.read(savedScreenshotBuffer);

      writeFileSync(join(WORK_DIR, 'ui.png'), PNG.sync.write(uiPng));
      writeFileSync(join(WORK_DIR, 'pdf.png'), PNG.sync.write(savedPng));

      expect(uiPng.width).toBeGreaterThan(0);
      expect(savedPng.width).toBeGreaterThan(0);
      // Same page size and same editor container: the raster must line up, otherwise the comparison
      // below would be meaningless rather than merely tolerant.
      expect({ width: savedPng.width, height: savedPng.height }).toEqual({ width: uiPng.width, height: uiPng.height });

      const diff = new PNG({ width: uiPng.width, height: uiPng.height });
      const numDiffPixels = pixelmatch(
        uiPng.data,
        savedPng.data,
        diff.data,
        uiPng.width,
        uiPng.height,
        { threshold: 0.1 },
      );
      writeFileSync(join(WORK_DIR, 'diff.png'), PNG.sync.write(diff));

      const diffRatio = numDiffPixels / (uiPng.width * uiPng.height);
      // The editor overlays HTML text on a rasterised page; a few percent of edge/antialiasing noise
      // is expected. What must not happen is the saved PDF rendering something else entirely.
      expect(diffRatio).toBeLessThan(0.06);

      if (existsSync(editedPath)) unlinkSync(editedPath);
    } finally {
      if (existsSync(pdfPath)) unlinkSync(pdfPath);
    }
  });
});
