import { expect, test } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { extractEmbeddedPdfText } from '../src/services/pdf/pdf-text-extractor';

test('manual export: save original and edited pdf in project root', async ({ page }) => {
  const projectRoot = process.cwd();
  const originalPath = join(projectRoot, 'studio-edit-original.pdf');
  const resultPath = join(projectRoot, 'studio-edit-result.pdf');

  const doc = await PDFDocument.create();
  const pdfPage = doc.addPage([612, 792]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  pdfPage.drawText('INLINE EDIT SAMPLE', { x: 80, y: 700, size: 24, font });
  const originalBytes = await doc.save();
  writeFileSync(originalPath, originalBytes);

  await page.goto('/studio');
  await page.locator('.studio-shell-container input[type="file"]').first().setInputFiles(originalPath);

  const initialFileId = await page.waitForFunction(() => {
    const store = (window as Window & { __LOCALPDF_STUDIO_STORE__?: { getState: () => {
      documents: Array<{ id: string; pages: Array<{ id: string; fileId: string }> }>;
      setActiveDocument: (id: string | null) => void;
      setSelection: (selection: Array<{ docId: string; pageId: string }>) => void;
    } } }).__LOCALPDF_STUDIO_STORE__;
    if (!store) {
      return null;
    }
    const state = store.getState();
    const docItem = state.documents[0];
    const firstPage = docItem?.pages[0];
    if (!docItem || !firstPage) {
      return null;
    }
    state.setActiveDocument(docItem.id);
    state.setSelection([{ docId: docItem.id, pageId: firstPage.id }]);
    return firstPage.fileId;
  }, { timeout: 20000 });

  const beforeFileId = await initialFileId.jsonValue() as string;

  await page.getByRole('button', { name: 'Edit' }).click();
  await expect(page.locator('.studio-edit-shell')).toBeVisible({ timeout: 20000 });

  const selectTextBtn = page.locator('.studio-edit-toolbar .studio-edit-tool-btn').first();
  await selectTextBtn.click();
  await expect(selectTextBtn).toHaveClass(/select-mode/);

  const highlight = page.locator('.studio-edit-text-highlight').first();
  await expect(highlight).toBeVisible({ timeout: 15000 });
  await highlight.click();

  const textarea = page.locator('.studio-edit-textarea').first();
  await expect(textarea).toBeVisible({ timeout: 10000 });
  await textarea.fill('INLINE UPDATED EXPORT');
  await page.getByTestId('studio-edit-save-btn').click();
  await expect(page.getByText(/Changes applied|Изменения сохранены/i)).toBeVisible({ timeout: 15000 });

  const afterFileId = await page.waitForFunction((prevId) => {
    const store = (window as Window & { __LOCALPDF_STUDIO_STORE__?: { getState: () => {
      documents: Array<{ pages: Array<{ fileId: string }> }>;
    } } }).__LOCALPDF_STUDIO_STORE__;
    const current = store?.getState().documents[0]?.pages[0]?.fileId;
    if (!current || current === prevId) {
      return null;
    }
    return current;
  }, beforeFileId, { timeout: 20000 });

  const updatedFileId = await afterFileId.jsonValue() as string;
  const base64Pdf = await page.evaluate(async (fileId) => {
    const api = (window as any).__LOCALPDF_V6_TEST_API;
    if (!api?.readFileBase64) {
      return '';
    }
    return api.readFileBase64(fileId);
  }, updatedFileId);

  const bytes = Uint8Array.from(Buffer.from(base64Pdf, 'base64'));
  writeFileSync(resultPath, bytes);

  const extracted = await extractEmbeddedPdfText(new Blob([bytes], { type: 'application/pdf' }));
  const normalized = (extracted?.text ?? '').replace(/\s+/g, '').toUpperCase();
  expect(normalized).toContain('INLINEUPDATEDEXPORT');
});
