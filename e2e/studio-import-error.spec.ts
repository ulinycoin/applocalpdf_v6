/**
 * Regression guard for a raw browser error leaking into the import toast.
 *
 * When the pdf.js module worker cannot be loaded (dev server restarted, stale chunk, wrong MIME), the
 * browser says "Failed to load module script: Expected a JavaScript module script…". Users saw that
 * exact sentence instead of an instruction, and it looked like their JPG was rejected.
 */
import { test, expect } from '@playwright/test';

test('a failed engine worker load is explained instead of pasted verbatim', async ({ page }) => {
  // Serve HTML for the worker request: this is exactly the MIME mismatch the browser complains about.
  // The production build only exposes the telemetry test API when this flag is set before load.
  await page.addInitScript(() => {
    (window as unknown as { __PLAYWRIGHT_TEST__?: boolean }).__PLAYWRIGHT_TEST__ = true;
  });
  // The built asset has a content hash (`pdf.worker.min-<hash>.mjs`), so match the name, not the path.
  await page.route('**/*pdf.worker*', (route) => route.fulfill({
    status: 200,
    contentType: 'text/html',
    body: '<!doctype html><title>fallback</title>',
  }));

  await page.goto('/app/studio');
  await page.locator('input[type="file"]').first().setInputFiles('test/fixtures/pdfs/scanned/scanned-ocr-receipt.pdf');

  const toastMessages = async (): Promise<string[]> => page.evaluate(() => {
    const api = (window as unknown as {
      __LOCALPDF_V6_TEST_API?: { getTelemetrySnapshot: () => Array<{ type: string; message?: string }> };
    }).__LOCALPDF_V6_TEST_API;
    return (api?.getTelemetrySnapshot() ?? [])
      .filter((event) => event.type === 'UI_TOAST_SHOWN' && typeof event.message === 'string')
      .map((event) => event.message as string);
  });

  await expect.poll(async () => (await toastMessages()).length, { timeout: 90_000 }).toBeGreaterThan(0);
  const messages = await toastMessages();

  expect(messages.some((message) => /Reload the page/u.test(message))).toBe(true);
  expect(messages.some((message) => /Failed to load module script|MIME type of/u.test(message))).toBe(false);
});
