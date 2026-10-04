import { expect, test } from '@playwright/test';
import { existsSync, unlinkSync, writeFileSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { extractEmbeddedPdfText } from '../src/services/pdf/pdf-text-extractor';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PDF_EDITOR_URL = '/app/pdf-editor';

/**
 * The standalone PDF editor surface was retired: a cold deep link to `/app/pdf-editor` now renders
 * the WizardShell "Studio-first" notice (`requiresStudioFlow` in WizardShell.tsx) instead of the
 * plugin's config card, and the plugin UI is unreachable from the app. The flows these tests used to
 * drive live in the Studio canvas (see e2e/studio-edit-text-save.spec.ts and the studio download
 * dialog), so they are kept as `fixme` with the original intent rather than deleted.
 */
test.describe('PDF Editor P0', () => {
  test.setTimeout(150_000);

  async function createFixturePdf(name: string): Promise<string> {
    const path = join(__dirname, `pdf-editor-p0-${name}.pdf`);
    const doc = await PDFDocument.create();
    const page = doc.addPage([612, 792]);
    const font = await doc.embedFont(StandardFonts.Helvetica);
    page.drawText('PDF EDITOR P0 FIXTURE', { x: 72, y: 700, size: 24, font });
    page.drawText('SECRET EDITOR LINE', { x: 72, y: 640, size: 24, font });
    writeFileSync(path, await doc.save());
    return path;
  }

  function safeDelete(path: string): void {
    if (existsSync(path)) {
      unlinkSync(path);
    }
  }

  test('standalone deep link is retired behind the Studio-first notice', async ({ page }) => {
    await page.goto(PDF_EDITOR_URL);

    await expect(page.getByText(/Studio-first/i)).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('.pdf-editor-title')).toHaveCount(0);

    await page.getByRole('button', { name: 'Go to Studio' }).click();
    await expect(page).toHaveURL(/\/app\/studio$/);
    await expect(page.locator('.studio-empty-state')).toBeVisible({ timeout: 20_000 });
  });

  test.fixme('supports upload via drag-and-drop', async ({ page }) => {
    const pdfPath = await createFixturePdf('drop-upload');
    try {
      await page.goto(PDF_EDITOR_URL);
      await expect(page.locator('.pdf-editor-title')).toBeVisible({ timeout: 15_000 });

      const uploadZone = page.locator('.pdf-editor-left .ocr-concept-upload');
      const bytes = await readFile(pdfPath);
      const dataTransfer = await page.evaluateHandle((payload) => {
        const dt = new DataTransfer();
        const file = new File([new Uint8Array(payload.bytes)], payload.name, { type: 'application/pdf' });
        dt.items.add(file);
        return dt;
      }, { bytes: Array.from(bytes), name: 'drop-upload.pdf' });

      await uploadZone.dispatchEvent('dragover', { dataTransfer });
      await expect(uploadZone).toHaveClass(/dragging/);
      await uploadZone.dispatchEvent('drop', { dataTransfer });
      await expect(uploadZone).not.toHaveClass(/dragging/);
      await expect(page.locator('.ocr-concept-file-name')).not.toContainText('No file selected');
      await expect(page.locator('.pdf-editor-preview-stage')).toBeVisible({ timeout: 20_000 });

      await dataTransfer.dispose();
    } finally {
      safeDelete(pdfPath);
    }
  });

  test.fixme('edits text, undoes/redoes it, saves and downloads a PDF with the edit', async ({ page }) => {
    const pdfPath = await createFixturePdf('save-download');
    const tempDir = await mkdtemp(join(tmpdir(), 'localpdf-pdf-editor-'));
    try {
      await page.goto(PDF_EDITOR_URL);
      await expect(page.locator('.pdf-editor-title')).toBeVisible({ timeout: 15_000 });
      await page.locator('.pdf-editor-left input[type="file"]').setInputFiles(pdfPath);
      await expect(page.locator('.pdf-editor-preview-stage')).toBeVisible({ timeout: 20_000 });

      const span = page.locator('.pdf-editor-text-span').first();
      await expect(span).toBeVisible({ timeout: 20_000 });
      await span.click();
      await page.locator('.pdf-editor-overlay-input').first().fill('AUTONOMOUS E2E BLOCK');
      await page.keyboard.press('Escape');

      await page.getByRole('button', { name: 'Undo', exact: true }).click();
      await page.getByRole('button', { name: 'Redo', exact: true }).click();

      await page.getByRole('button', { name: 'Save PDF' }).click();
      const downloadButton = page.getByRole('button', { name: 'Download' });
      await expect(downloadButton).toBeVisible({ timeout: 60_000 });

      const [download] = await Promise.all([
        page.waitForEvent('download'),
        downloadButton.click(),
      ]);
      const downloadedPath = join(tempDir, await download.suggestedFilename());
      await download.saveAs(downloadedPath);

      const bytes = new Uint8Array(await readFile(downloadedPath));
      const extracted = await extractEmbeddedPdfText(new Blob([bytes], { type: 'application/pdf' }));
      const normalized = (extracted?.text ?? '').replace(/\s+/gu, '').toUpperCase();
      expect(normalized).toContain('AUTONOMOUSE2EBLOCK');
    } finally {
      safeDelete(pdfPath);
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test.fixme('whiteout removes the covered line from the downloaded PDF', async ({ page }) => {
    const pdfPath = await createFixturePdf('whiteout-download');
    const tempDir = await mkdtemp(join(tmpdir(), 'localpdf-pdf-editor-'));
    try {
      await page.goto(PDF_EDITOR_URL);
      await expect(page.locator('.pdf-editor-title')).toBeVisible({ timeout: 15_000 });
      await page.locator('.pdf-editor-left input[type="file"]').setInputFiles(pdfPath);
      await expect(page.locator('.pdf-editor-preview-stage')).toBeVisible({ timeout: 20_000 });

      const secretSpan = page.getByRole('button', { name: 'Edit text SECRET EDITOR LINE' });
      const secretBox = await secretSpan.boundingBox();
      if (!secretBox) {
        throw new Error('Missing second text span bounds');
      }

      await page.getByRole('button', { name: 'whiteout', exact: true }).click();
      await page.mouse.move(secretBox.x - 4, secretBox.y - 2);
      await page.mouse.down();
      await page.mouse.move(secretBox.x + secretBox.width + 8, secretBox.y + secretBox.height + 2, { steps: 8 });
      await page.mouse.up();

      await page.getByRole('button', { name: 'Save PDF' }).click();
      const downloadButton = page.getByRole('button', { name: 'Download' });
      await expect(downloadButton).toBeVisible({ timeout: 60_000 });

      const [download] = await Promise.all([
        page.waitForEvent('download'),
        downloadButton.click(),
      ]);
      const downloadedPath = join(tempDir, await download.suggestedFilename());
      await download.saveAs(downloadedPath);

      const bytes = new Uint8Array(await readFile(downloadedPath));
      const extracted = await extractEmbeddedPdfText(new Blob([bytes], { type: 'application/pdf' }));
      const normalized = (extracted?.text ?? '').replace(/\s+/gu, '').toUpperCase();
      expect(normalized).not.toContain('SECRETEDITORLINE');
      expect(normalized).toContain('PDFEDITORP0FIXTURE');
    } finally {
      safeDelete(pdfPath);
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  // The unsaved-changes confirmation was a `window.confirm`; the product rule allows React UI only for
  // input, and the retired standalone surface cannot be reached to assert the replacement behaviour.
  test.fixme('cancel asks confirmation when unsaved changes exist', async ({ page }) => {
    const pdfPath = await createFixturePdf('cancel-confirm');
    try {
      await page.goto(PDF_EDITOR_URL);
      await expect(page.locator('.pdf-editor-title')).toBeVisible({ timeout: 15_000 });
      await page.locator('.pdf-editor-left input[type="file"]').setInputFiles(pdfPath);
      await expect(page.locator('.pdf-editor-preview-stage')).toBeVisible({ timeout: 20_000 });
      await page.locator('.pdf-editor-text-span').first().click();

      let firstDialogMessage = '';
      page.once('dialog', async (dialog) => {
        firstDialogMessage = dialog.message();
        await dialog.dismiss();
      });
      await page.locator('.pdf-editor-left').getByRole('button', { name: 'Back' }).click();
      await expect.poll(() => firstDialogMessage.length > 0).toBe(true);
      expect(firstDialogMessage.toLowerCase()).toContain('unsaved');
      await expect(page.locator('.pdf-editor-preview-stage')).toBeVisible();

      page.once('dialog', async (dialog) => {
        await dialog.accept();
      });
      await page.locator('.pdf-editor-left').getByRole('button', { name: 'Back' }).click();
      await expect(page.locator('.pdf-editor-preview-stage')).toHaveCount(0);
      await expect(page.getByText('No file selected')).toBeVisible();
    } finally {
      safeDelete(pdfPath);
    }
  });
});
