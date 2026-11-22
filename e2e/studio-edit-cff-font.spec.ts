import { expect, test } from '@playwright/test';
import {
  clickTextLine,
  enableStudioTestApi,
  fillInlineEditor,
  openEditTool,
  readSavedPageText,
  saveEdits,
  selectFirstPage,
  squash,
  uploadPdf,
  waitForSavedFileId,
  waitForTextLayer,
} from './studio-edit-helpers';

/**
 * PingFang from macOS print is an Identity-H `CIDFontType0` (CFF) font with an empty `/W`. It used
 * to fall back to a substitute face because the CID path only accepted `CIDFontType2`. The content
 * stream already writes CIDs and `/ToUnicode` maps characters to them, so the run can be patched in
 * the document's own typeface — the point of this spec is that the UI takes that path, not the
 * fallback, and the new text stays searchable.
 */
test('a CFF PingFang run is edited in the document own font', async ({ page }) => {
  test.setTimeout(180_000);
  await enableStudioTestApi(page);

  await uploadPdf(page, 'test/fixtures/pdfs/fonts/cff-pingfang-ja.pdf');
  const beforeFileId = await selectFirstPage(page, 30_000);
  await openEditTool(page, 'Text');
  await waitForTextLayer(page, 20_000);

  // The line merges the CJK run with Latin digits drawn in another font, so the editor seeds the
  // whole line; the CFF run is the one this spec is about.
  const replacement = 'テキストです。漢字とかなと数字';
  await clickTextLine(page, 0);
  await expect(page.locator('.studio-edit-textarea').first()).toContainText('テキスト');
  await fillInlineEditor(page, replacement);
  await saveEdits(page);

  const afterFileId = await waitForSavedFileId(page, beforeFileId, 40_000);
  const text = squash(await readSavedPageText(page, afterFileId));
  expect(text).toContain(squash(replacement));

  const snapshot = await page.evaluate(() => (
    window as unknown as { __LOCALPDF_V6_TEST_API?: { getTelemetrySnapshot?: () => Array<Record<string, unknown>> } }
  ).__LOCALPDF_V6_TEST_API?.getTelemetrySnapshot?.() ?? []);
  const paths = snapshot
    .filter((event) => event.type === 'STUDIO_TEXT_EDIT_FONT_PATH')
    .at(-1)?.paths as Record<string, number> | undefined;
  expect(paths).toBeTruthy();
  expect(paths?.patchedCodes ?? 0).toBeGreaterThan(0);
  expect(paths?.substituted ?? 0).toBe(0);
  expect(paths?.rasterized ?? 0).toBe(0);
});
