import { test, expect } from '@playwright/test';
import { existsSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDocument } from 'pdf-lib';
import {
  enableAddTextBoxMode,
  enableStudioTestApi,
  fillInlineEditor,
  openEditTool,
  selectFirstPage,
  uploadPdf,
} from './studio-edit-helpers';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function createDummyPdf(name: string, pages = 1): Promise<string> {
  const path = join(__dirname, `dummy-${name}.pdf`);
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i += 1) {
    doc.addPage([612, 792]);
  }
  const bytes = await doc.save();
  writeFileSync(path, bytes);
  return path;
}

function safeDelete(path: string): void {
  if (existsSync(path)) {
    unlinkSync(path);
  }
}

test.describe('Studio Edit Text', () => {
  test.beforeEach(async ({ page }) => {
    await enableStudioTestApi(page);
  });

  test('text does not reset after input and drag', async ({ page }) => {
    const pdfPath = await createDummyPdf('studio-edit-text');
    try {
      await uploadPdf(page, pdfPath);
      await selectFirstPage(page);
      await openEditTool(page, 'Text');

      // A page without a text layer has nothing to latch onto: new content needs Add Text Box mode.
      await enableAddTextBoxMode(page);
      const sheet = page.locator('.studio-edit-canvas-content').first();
      await expect(sheet).toBeVisible({ timeout: 20_000 });
      const box = await sheet.boundingBox();
      if (!box) {
        throw new Error('Missing edit page sheet bounds');
      }

      await sheet.click({
        position: {
          x: Math.max(8, Math.floor(box.width * 0.35)),
          y: Math.max(8, Math.floor(box.height * 0.45)),
        },
      });

      await fillInlineEditor(page, 'Drag me text');
      await expect(page.locator('.studio-edit-text').first()).toContainText('Drag me text');

      // Committing the editor (click on empty canvas) is what arms the drag: while the textarea is
      // focused the element deliberately ignores pointer drags.
      await sheet.click({
        position: {
          x: Math.max(8, Math.floor(box.width * 0.85)),
          y: Math.max(8, Math.floor(box.height * 0.85)),
        },
      });

      const textNode = page.locator('.studio-edit-text').first();
      const before = await textNode.boundingBox();
      if (!before) {
        throw new Error('Missing text node bounds');
      }

      await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
      await page.mouse.down();
      await page.mouse.move(before.x + before.width / 2 + 80, before.y + before.height / 2 + 40, { steps: 8 });
      await page.mouse.up();

      await expect(page.locator('.studio-edit-text').first()).toContainText('Drag me text');
      await expect(page.locator('.studio-edit-text').first()).not.toContainText(/^Text$/);

      const after = await page.locator('.studio-edit-text').first().boundingBox();
      if (!before || !after) {
        throw new Error('Missing text node bounds after drag');
      }
      expect(after.x - before.x).toBeGreaterThan(40);
      expect(after.y - before.y).toBeGreaterThan(15);
    } finally {
      safeDelete(pdfPath);
    }
  });
});
