import { expect, test } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDocument, StandardFonts } from 'pdf-lib';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function createPrecisionTestPdf(): Promise<string> {
    const path = join(__dirname, 'precision-test.pdf');
    const doc = await PDFDocument.create();
    const page = doc.addPage([600, 400]);
    const font = await doc.embedFont(StandardFonts.Helvetica);

    // Precise text at known coordinates
    page.drawText('PRECISION TEST LINE 1', { x: 50, y: 350, size: 20, font });

    const bytes = await doc.save();
    writeFileSync(path, bytes);
    return path;
}

test.describe('Studio Edit Precision', () => {
    test('Selection box matches text layer span', async ({ page }) => {
        const pdfPath = await createPrecisionTestPdf();

        try {
            await page.goto('/studio');

            // Upload PDF to Studio
            const fileInput = page.locator('input[type="file"]');
            await fileInput.setInputFiles([pdfPath]);

            // Wait for upload to complete (The Void disappears)
            await expect(page.locator('.studio-void-layer')).not.toBeVisible({ timeout: 15000 });

            // Navigate directly to Edit mode (it will pick the first page automatically)
            await page.goto('/studio/edit');
            await expect(page.locator('.studio-edit-workspace')).toBeVisible({ timeout: 15000 });

            // Enable Select Text mode
            const selectTextBtn = page.getByRole('button', { name: /Select Text/i });
            await selectTextBtn.click();
            await expect(selectTextBtn).toHaveClass(/select-mode/);

            // Wait for PDF layer to be analyzed
            await page.waitForTimeout(3000);

            // Find highlight element
            const highlight = page.locator('.studio-edit-text-highlight').first();
            await expect(highlight).toBeVisible({ timeout: 15000 });

            // Get highlight bounds in client coordinates
            const box = await highlight.boundingBox();
            console.log('Highlight Box (Playwright):', box);
            expect(box).not.toBeNull();

            // Click to edit
            await highlight.click();

            // Expect a Textarea to appear
            const textarea = page.locator('.studio-edit-textarea');
            await expect(textarea).toBeVisible({ timeout: 10000 });

            // Get textarea bounds
            const editBox = await textarea.boundingBox();
            console.log('Edit Area Box (Playwright):', editBox);
            expect(editBox).not.toBeNull();

            if (box && editBox) {
                const diffX = Math.abs(editBox.x - box.x);
                const diffY = Math.abs(editBox.y - box.y);
                console.log(`Precision Diff: X=${diffX}, Y=${diffY}`);

                // Assertions with tolerance (V6 should be within 2-3px)
                expect(diffX).toBeLessThan(5);
                expect(diffY).toBeLessThan(5);
            }

        } finally {
            // Cleanup
        }
    });
});
