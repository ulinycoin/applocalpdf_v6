import { expect, test } from '@playwright/test';

test.describe('UX Toast Dedupe', () => {
  test('deduplicates repeated error toasts and emits dedupe telemetry', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('LocalPDF')).toBeVisible();

    await page.evaluate(() => {
      const api = (window as any).__LOCALPDF_V6_TEST_API;
      if (!api) {
        throw new Error('Test API is unavailable');
      }

      for (let i = 0; i < 10; i += 1) {
        api.trackTelemetry({
          type: 'UI_TOAST_SHOWN',
          runId: `dedupe-run-${i}`,
          toolId: 'merge-pdf',
          level: 'error',
          message: 'Synthetic repeated worker failure',
        });
      }
    });

    const toastItems = page.getByTestId('ux-toast-item').filter({ hasText: 'Synthetic repeated worker failure' });
    await expect(toastItems.first()).toBeVisible();
    await expect(toastItems).toHaveCount(1);

    await expect(page.getByText(/UI_TOAST_DEDUPED/).first()).toBeVisible();
  });
});
