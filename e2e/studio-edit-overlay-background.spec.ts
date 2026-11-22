import { expect, test } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
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

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const BACKGROUND = { r: 13, g: 46, b: 71 };
const SOURCE_TEXT = 'Revenue grew by 23 percent this quarter';
const REPLACEMENT = 'ПРИВЕТ 2026';

/**
 * An overlay replacement (this one is forced by the non-Latin-1 text) used to paint a solid white
 * rectangle over the run, so on a coloured page the edit left a white patch — and white source text
 * turned invisible on it. The cover must take the page colour under the run.
 */
test('overlay edit on a coloured page keeps the page colour under the run', async ({ page }) => {
  test.setTimeout(180_000);
  await enableStudioTestApi(page);

  const source = await PDFDocument.create();
  const font = await source.embedFont(StandardFonts.Helvetica);
  const pageOne = source.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  pageOne.drawRectangle({
    x: 0,
    y: 0,
    width: PAGE_WIDTH,
    height: PAGE_HEIGHT,
    color: rgb(BACKGROUND.r / 255, BACKGROUND.g / 255, BACKGROUND.b / 255),
  });
  pageOne.drawText(SOURCE_TEXT, { x: 72, y: 660, size: 20, font, color: rgb(1, 1, 1) });
  const sourceWidth = font.widthOfTextAtSize(SOURCE_TEXT, 20);
  const path = test.info().outputPath('colored-overlay-source.pdf');
  writeFileSync(path, await source.save());

  await uploadPdf(page, path);
  const beforeFileId = await selectFirstPage(page);
  await openEditTool(page, 'Text');
  await waitForTextLayer(page);

  const imageBefore = await page.locator('.studio-edit-page-image').getAttribute('src');
  await clickTextLine(page, 0);
  await fillInlineEditor(page, REPLACEMENT);
  await saveEdits(page);
  const afterFileId = await waitForSavedFileId(page, beforeFileId);
  expect(afterFileId).not.toBe(beforeFileId);

  const text = squash(await readSavedPageText(page, afterFileId));
  expect(text).toContain(squash(REPLACEMENT));
  expect(text).not.toContain(squash(SOURCE_TEXT));

  // Wait for the editor to show the saved page, then read a pixel that the old glyphs did not cover
  // (the replacement is shorter) — it must be the page colour, not the old white cover.
  await expect.poll(
    () => page.locator('.studio-edit-page-image').getAttribute('src'),
    { timeout: 15_000 },
  ).not.toBe(imageBefore);

  const pixel = await page.evaluate(({ xRatio, yRatio }) => {
    const image = document.querySelector('.studio-edit-page-image') as HTMLImageElement | null;
    if (!image || !image.complete || image.naturalWidth === 0) {
      return null;
    }
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d');
    if (!context) {
      return null;
    }
    context.drawImage(image, 0, 0);
    const data = context.getImageData(
      Math.round(xRatio * canvas.width),
      Math.round(yRatio * canvas.height),
      1,
      1,
    ).data;
    return { r: data[0], g: data[1], b: data[2] };
  }, {
    xRatio: (72 + sourceWidth * 0.92) / PAGE_WIDTH,
    yRatio: (PAGE_HEIGHT - (660 + 4)) / PAGE_HEIGHT,
  });

  expect(pixel, 'saved page image should be readable').not.toBeNull();
  expect(pixel!.r, `cover pixel ${JSON.stringify(pixel)} should not be white`).toBeLessThan(120);
  expect(pixel!.g).toBeLessThan(120);
  expect(pixel!.b).toBeLessThan(150);
});
