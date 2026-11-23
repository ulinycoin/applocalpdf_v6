import { expect, test } from '@playwright/test';
import {
  clickTextLine,
  enableStudioTestApi,
  fillInlineEditor,
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

/**
 * A shaped right-to-left run is stored in visual order, so rewriting it with logical-order codes
 * draws a mirrored, unjoined line (verified on this fixture before the guard existed). The applier
 * therefore paints Arabic/Hebrew runs with the browser canvas instead of reusing the document codes;
 * this spec proves the UI takes that path and the saved page keeps its other text intact.
 */
test('an Arabic edit is painted instead of patched into a mirrored run', async ({ page }) => {
  test.setTimeout(180_000);
  await enableStudioTestApi(page);

  await uploadPdf(page, 'test/fixtures/pdfs/fonts/rtl-arabic-chrome.pdf');
  const beforeFileId = await selectFirstPage(page, 30_000);
  await openEditTool(page, 'Text');
  await waitForTextLayer(page, 20_000);

  const index = await pickHighlightByVerticalOrder(page, 'top');
  await clickTextLine(page, index);
  const replacement = 'عنوان الوثيقة الجديدة';
  await fillInlineEditor(page, replacement);
  await saveEdits(page);

  const afterFileId = await waitForSavedFileId(page, beforeFileId, 40_000);
  const text = squash(await readSavedPageText(page, afterFileId));

  // The replaced line must not stay behind in any order, least of all mirrored.
  expect(text).not.toContain(squash('ةينقتلا ةقيثولا ناونع'));
  expect(text).not.toContain(squash('عنوان الوثيقة التقنية'));
  // The rest of the page is untouched: the edit did not take the document with it.
  expect(text).toContain(squash('هذا نص عربي'));

  const snapshot = await page.evaluate(() => (
    window as unknown as { __LOCALPDF_V6_TEST_API?: { getTelemetrySnapshot?: () => Array<Record<string, unknown>> } }
  ).__LOCALPDF_V6_TEST_API?.getTelemetrySnapshot?.() ?? []);
  const paths = snapshot
    .filter((event) => event.type === 'STUDIO_TEXT_EDIT_FONT_PATH')
    .at(-1)?.paths as Record<string, number> | undefined;
  expect(paths).toBeTruthy();
  expect(paths?.rasterized ?? 0).toBeGreaterThan(0);
  expect(paths?.patchedCodes ?? 0).toBe(0);
});
