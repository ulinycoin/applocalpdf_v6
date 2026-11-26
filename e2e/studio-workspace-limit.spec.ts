import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Workspaces are unlimited on every plan: the canvas never sends a file anywhere, and the old
 * 3-document cap stopped free users before they had a result to pay for. The wall lives at export.
 *
 * This is money logic (plan-limits.ts), so the behaviour is pinned: importing four files must not
 * open the paywall, and the canvas must actually hold four documents.
 */

const FIXTURE_DIR = join(process.cwd(), 'test/fixtures/pdfs/documents');
const FIXTURES = [
  'simple-letter.pdf',
  'multi-line-paragraph.pdf',
  'mixed-fonts.pdf',
  'localpdf-demo-short.pdf',
];

async function workspaceCount(page: import('@playwright/test').Page): Promise<number> {
  return await page.evaluate(() => {
    const store = (window as unknown as { __LOCALPDF_STUDIO_STORE__?: { getState: () => { documents: unknown[] } } }).__LOCALPDF_STUDIO_STORE__;
    return store?.getState().documents.length ?? -1;
  });
}

test('importing four files never opens the workspace paywall', async ({ page }) => {
  await page.goto('/app/studio');

  await page.locator('input[type="file"]').first().setInputFiles(
    FIXTURES.map((name) => ({
      name,
      mimeType: 'application/pdf',
      buffer: readFileSync(join(FIXTURE_DIR, name)),
    })),
  );

  await expect.poll(async () => await workspaceCount(page), { timeout: 120_000 }).toBe(FIXTURES.length);

  // The offer overlay is the paywall surface; it must stay closed while files are being added.
  await expect(page.locator('.ux-upsell-modal')).toBeHidden();
  await expect(page.getByText(/3 workspaces/i)).toHaveCount(0);
});
