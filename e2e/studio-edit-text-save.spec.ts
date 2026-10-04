import { expect, test } from '@playwright/test';
import { existsSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import {
  clickTextLine,
  enableStudioTestApi,
  fillInlineEditor,
  highlightBox,
  openEditTool,
  pickHighlightByVerticalOrder,
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

async function createTextPdf(name: string, lines: Array<[string, number]>): Promise<string> {
  const path = join(__dirname, `p0-text-save-${name}.pdf`);
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const [text, y] of lines) {
    page.drawText(text, { x: 80, y, size: 24, font });
  }
  writeFileSync(path, await doc.save());
  return path;
}

function safeDelete(path: string): void {
  if (existsSync(path)) {
    unlinkSync(path);
  }
}

test.describe('Studio edit text save P0', () => {
  test.beforeEach(async ({ page }) => {
    await enableStudioTestApi(page);
  });

  test('saves edited text into output PDF in VFS', async ({ page }) => {
    const pdfPath = await createTextPdf('p0', [['INLINE EDIT SAMPLE', 700]]);
    try {
      await uploadPdf(page, pdfPath);
      const beforeFileId = await selectFirstPage(page);
      await openEditTool(page, 'Text');
      await waitForTextLayer(page);

      await clickTextLine(page, 0);
      await fillInlineEditor(page, 'INLINE UPDATED P0');
      await saveEdits(page);

      const updatedFileId = await waitForSavedFileId(page, beforeFileId);
      const text = squash(await readSavedPageText(page, updatedFileId));

      expect(text).toContain('INLINEUPDATEDP0');
      // The run is patched, not merely overlaid: the original glyphs must not stay extractable.
      expect(text).not.toContain('INLINEEDITSAMPLE');
    } finally {
      safeDelete(pdfPath);
    }
  });

  test('saves a Cyrillic edit and extracts it back from the result', async ({ page }) => {
    const pdfPath = await createTextPdf('cyrillic', [['CYRILLIC SOURCE LINE', 700]]);
    try {
      await uploadPdf(page, pdfPath);
      const beforeFileId = await selectFirstPage(page);
      await openEditTool(page, 'Text');
      await waitForTextLayer(page);

      await clickTextLine(page, 0);
      await fillInlineEditor(page, 'Итого 100 USD ПРИВЕТ');
      await saveEdits(page);

      const updatedFileId = await waitForSavedFileId(page, beforeFileId);
      const text = squash(await readSavedPageText(page, updatedFileId));

      expect(text).toContain('ИТОГО100USDПРИВЕТ');
      expect(text).not.toContain('CYRILLICSOURCELINE');
    } finally {
      safeDelete(pdfPath);
    }
  });

  test('whiteout next to a text edit leaves no extractable original text', async ({ page }) => {
    const pdfPath = await createTextPdf('whiteout', [
      ['SECRET LINE TO ERASE', 700],
      ['KEEP EDIT LINE', 640],
    ]);
    try {
      await uploadPdf(page, pdfPath);
      const beforeFileId = await selectFirstPage(page);
      await openEditTool(page, 'Text');
      await waitForTextLayer(page);

      // Boxes are captured before editing: a committed line drops out of the highlight list.
      const topIndex = await pickHighlightByVerticalOrder(page, 'top');
      const bottomIndex = await pickHighlightByVerticalOrder(page, 'bottom');
      const secretBox = await highlightBox(page, topIndex);

      await clickTextLine(page, bottomIndex);
      await fillInlineEditor(page, 'EDITED KEEP LINE');

      await page.locator('.studio-editor-left-toolbar').getByRole('button', { name: 'Whiteout', exact: true }).click();
      await page.mouse.move(secretBox.x - 6, secretBox.y - 4);
      await page.mouse.down();
      await page.mouse.move(secretBox.x + secretBox.width + 12, secretBox.y + secretBox.height + 4, { steps: 10 });
      await page.mouse.up();

      await saveEdits(page);
      const updatedFileId = await waitForSavedFileId(page, beforeFileId);
      const text = squash(await readSavedPageText(page, updatedFileId));

      expect(text).toContain('EDITEDKEEPLINE');
      expect(text).not.toContain('SECRETLINETOERASE');
    } finally {
      safeDelete(pdfPath);
    }
  });
});
