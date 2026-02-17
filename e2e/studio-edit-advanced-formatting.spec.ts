import { expect, test } from '@playwright/test';
import { existsSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDocument, StandardFonts } from 'pdf-lib';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function createTextPdf(name: string): Promise<string> {
  const path = join(__dirname, `advanced-format-${name}.pdf`);
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText('ADVANCED FORMAT SAMPLE', { x: 80, y: 700, size: 24, font });
  writeFileSync(path, await doc.save());
  return path;
}

function safeDelete(path: string): void {
  if (existsSync(path)) {
    unlinkSync(path);
  }
}

test.describe('Studio advanced formatting P2', () => {
  test('applies line-height and letter-spacing in editor and saves', async ({ page }) => {
    const pdfPath = await createTextPdf('p2');
    try {
      await page.goto('/studio');
      await page.locator('.studio-shell-container input[type="file"]').first().setInputFiles(pdfPath);

      await page.waitForFunction(() => {
        const store = (window as Window & { __LOCALPDF_STUDIO_STORE__?: { getState: () => {
          documents: Array<{ id: string; pages: Array<{ id: string }> }>;
          setActiveDocument: (id: string | null) => void;
          setSelection: (selection: Array<{ docId: string; pageId: string }>) => void;
        } } }).__LOCALPDF_STUDIO_STORE__;
        if (!store) {
          return false;
        }
        const state = store.getState();
        const doc = state.documents[0];
        const firstPage = doc?.pages[0];
        if (!doc || !firstPage) {
          return false;
        }
        state.setActiveDocument(doc.id);
        state.setSelection([{ docId: doc.id, pageId: firstPage.id }]);
        return true;
      }, { timeout: 20000 });

      await page.getByRole('button', { name: 'Edit' }).click();
      await expect(page.locator('.studio-edit-shell')).toBeVisible({ timeout: 20000 });

      const sheet = page.locator('.studio-edit-canvas-content').first();
      await expect(sheet).toBeVisible({ timeout: 15000 });
      const bounds = await sheet.boundingBox();
      if (!bounds) {
        throw new Error('Missing edit sheet bounds');
      }
      await sheet.click({
        position: {
          x: Math.max(12, Math.floor(bounds.width * 0.42)),
          y: Math.max(12, Math.floor(bounds.height * 0.45)),
        },
      });

      const textBox = page.locator('.studio-edit-text').first();
      await expect(textBox).toBeVisible({ timeout: 10000 });

      await textBox.click();
      const controls = page.locator('.studio-floating-input.font-size');
      await expect(controls).toHaveCount(3, { timeout: 10000 });
      await controls.nth(1).fill('1.8');
      await controls.nth(2).fill('2.4');

      const lineHeight = await textBox.evaluate((el) => window.getComputedStyle(el).lineHeight);
      const letterSpacing = await textBox.evaluate((el) => window.getComputedStyle(el).letterSpacing);
      expect(Number.parseFloat(lineHeight)).toBeGreaterThan(20);
      expect(Number.parseFloat(letterSpacing)).toBeGreaterThan(2);

      await page.getByTestId('studio-edit-save-btn').click();
      await expect(page.getByText(/Changes applied|Изменения сохранены/i)).toBeVisible({ timeout: 15000 });
    } finally {
      safeDelete(pdfPath);
    }
  });
});
