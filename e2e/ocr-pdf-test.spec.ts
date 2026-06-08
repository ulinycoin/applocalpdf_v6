import { expect, test } from '@playwright/test';
import { existsSync, unlinkSync, writeFileSync } from 'node:fs';
import { randomFillSync } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDocument, StandardFonts } from 'pdf-lib';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function createEmbeddedTextPdf(name: string): Promise<string> {
  const path = join(__dirname, `dummy-${name}.pdf`);
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const font = await doc.embedFont(StandardFonts.Helvetica);

  page.drawText('INVOICE 2026-02', { x: 72, y: 730, size: 18, font });
  page.drawText('Customer: LocalPDF OCR E2E', { x: 72, y: 700, size: 13, font });
  page.drawText('Total amount: 15320.55 USD', { x: 72, y: 672, size: 13, font });
  page.drawText('This text should appear in OCR result view.', { x: 72, y: 644, size: 12, font });

  const bytes = await doc.save();
  writeFileSync(path, bytes);
  return path;
}

async function createLargeEmbeddedTextPdf(name: string, minBytes = 12 * 1024 * 1024): Promise<string> {
  const path = join(__dirname, `dummy-large-${name}.pdf`);
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const font = await doc.embedFont(StandardFonts.Helvetica);

  page.drawText('LARGE OCR DOCUMENT 2026', { x: 72, y: 730, size: 18, font });
  page.drawText('This document contains embedded text and large payload.', { x: 72, y: 700, size: 12, font });
  page.drawText('Expected marker: LARGE_OCR_TEST_MARKER', { x: 72, y: 676, size: 12, font });

  const payload = new Uint8Array(minBytes);
  randomFillSync(payload);
  await doc.attach(payload, 'payload.bin', {
    mimeType: 'application/octet-stream',
    description: 'E2E large-payload attachment',
  });

  const bytes = await doc.save({ useObjectStreams: false });
  writeFileSync(path, bytes);
  return path;
}

function safeDelete(path: string): void {
  if (existsSync(path)) {
    unlinkSync(path);
  }
}

async function openOcrTest(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/app/ocr-pdf');
  await expect(page.locator('h1, h2, h3').filter({ hasText: 'OCR' }).first()).toBeVisible();
}

test.describe('OCR PDF Test route', () => {
  test('ocr-pdf-test: processes embedded-text PDF and shows result', async ({ page }) => {
    test.setTimeout(120000);
    const pdfPath = await createEmbeddedTextPdf('ocr-test-basic');

    try {
       await openOcrTest(page);
       const fileInput = page.locator('section.ocr-concept-left input[type="file"]').first();
       await fileInput.setInputFiles([pdfPath]);
       await page.getByLabel('Output format').selectOption('json');

       await page.getByRole('button', { name: 'Run OCR' }).click();
       const jsonPreview = page.locator('section.ocr-concept-right pre.ocr-concept-editor-copy').first();
       await expect(jsonPreview).toBeVisible({ timeout: 90000 });
       await expect(jsonPreview).toContainText('"sourceMime": "application/pdf"', { timeout: 90000 });
       await expect(jsonPreview).toContainText('"ocr"', { timeout: 90000 });

       await page.getByRole('button', { name: 'Text editor' }).click();
       await expect(page.locator('textarea.ocr-concept-editor-input')).toBeVisible({ timeout: 10000 });
     } finally {
       safeDelete(pdfPath);
     }
   });

  test('ocr-pdf-test: processes large embedded-text PDF', async ({ page }) => {
    test.setTimeout(240000);
    const largePdfPath = await createLargeEmbeddedTextPdf('ocr-test-large');

    try {
      await openOcrTest(page);
      const fileInput = page.locator('section.ocr-concept-left input[type="file"]').first();
      await fileInput.setInputFiles([largePdfPath]);
      await page.getByLabel('Output format').selectOption('json');

      await page.getByRole('button', { name: 'Run OCR' }).click();

      const jsonPreview = page.locator('section.ocr-concept-right pre.ocr-concept-editor-copy').first();
      await expect(jsonPreview).toBeVisible({ timeout: 180000 });
      const raw = (await jsonPreview.textContent()) ?? '';
      const payload = JSON.parse(raw) as { sourceBytes?: unknown; sourceMime?: unknown };

      expect(payload.sourceMime).toBe('application/pdf');
      expect(typeof payload.sourceBytes).toBe('number');
      expect((payload.sourceBytes as number) > 10 * 1024 * 1024).toBeTruthy();
    } finally {
      safeDelete(largePdfPath);
    }
  });

  test('ocr-pdf-test: processes PDF inside Studio flow', async ({ page }) => {
    test.setTimeout(120000);
    const pdfPath = await createEmbeddedTextPdf('ocr-studio-flow');

    try {
      // 1. Go to Studio and upload the document
      await page.goto('/app/studio');
      const fileInput = page.locator('input[type="file"]').first();
      await fileInput.setInputFiles([pdfPath]);

      // 2. Wait until pages are loaded in the workspace
      await expect(page.locator('.studio-shell-canvas')).toBeVisible({ timeout: 20000 });

      // 3. Click OCR tool in the rail
      const ocrRailBtn = page.locator('button[aria-label="OCR"], button:has-text("OCR")').first();
      await ocrRailBtn.click();

      // 4. Click Run OCR in the inline panel
      const runBtn = page.locator('button:has-text("Run OCR")').first();
      await expect(runBtn).toBeVisible({ timeout: 15000 });
      await runBtn.click();

      // 5. Verify that it completes successfully without "Conversion failed"
      // The panel should show success message and no error banners.
      const errorBanner = page.locator('text=Conversion failed');
      const successMsg = page.locator('text=OCR completed');
      
      await expect(successMsg.or(errorBanner)).toBeVisible({ timeout: 60000 });
      await expect(errorBanner).not.toBeVisible();
      await expect(successMsg).toBeVisible();
    } finally {
      safeDelete(pdfPath);
    }
  });
});
