import { expect, test } from '@playwright/test';
import {
  enableStudioTestApi,
  fillInlineEditor,
  clickTextLine,
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
 * CJK outside the embedded subset is painted as a PNG — that is the documented trade-off, and the
 * applier covers the picture with an invisible text layer (`text-edit/hidden-text.ts`) so the edit
 * still takes part in search and copy. This is the only place the whole chain runs: the raster and
 * its hidden layer are produced by the worker, and the check reads the saved PDF back.
 */
test('a rasterised CJK edit stays searchable in the saved PDF', async ({ page }) => {
  await enableStudioTestApi(page);
  await uploadPdf(page, 'test/fixtures/pdfs/fonts/cff-pingfang-ja.pdf');
  const beforeFileId = await selectFirstPage(page);
  await openEditTool(page, 'Text');
  await waitForTextLayer(page);

  // 鬱 and 薔 are not part of the fixture's subset, so the run cannot be patched in place.
  await clickTextLine(page, 0);
  await fillInlineEditor(page, '鬱薔薇の文書');
  await saveEdits(page);

  const updatedFileId = await waitForSavedFileId(page, beforeFileId);
  const text = squash(await readSavedPageText(page, updatedFileId));
  expect(text).toContain('鬱薔薇の文書');
});
