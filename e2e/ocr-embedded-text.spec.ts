import { expect, test } from '@playwright/test';
import { join } from 'node:path';
import { enableStudioTestApi, uploadPdf } from './studio-edit-helpers';

const FIXTURE = join(process.cwd(), 'test', 'fixtures', 'pdfs', 'documents', 'localpdf-demo-short.pdf');

/**
 * Regression: the embedded-text path silently gave up inside the tool worker (pdf.js has no
 * workerSrc there), fell back to a byte-level parser, and OCR returned a constant-offset shift of the
 * document (`LocalPDF` -> `/ R F D O 3 ' )`). The file has a text layer, so the answer must be its text.
 */
test('OCR of a PDF with a text layer returns that text, not shifted bytes', async ({ page }) => {
  await enableStudioTestApi(page);
  await uploadPdf(page, FIXTURE);
  await page.waitForSelector('.studio-nav-btn:has-text("Download")', { timeout: 60_000 });
  await page.locator('[title="Recognize text in scanned PDFs and make them searchable"]').first().click();
  await page.getByRole('button', { name: /Run OCR/i }).click();
  await page.waitForSelector('.cvt-btn-download', { timeout: 240_000 });

  const result = await page.locator('textarea').first().inputValue();
  expect(result).toContain('LocalPDF is a browser extension');
  expect(result).not.toContain('/ R F D O 3');
});
