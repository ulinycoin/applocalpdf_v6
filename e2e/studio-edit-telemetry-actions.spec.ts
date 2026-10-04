import { expect, test } from '@playwright/test';
import { existsSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import {
  clickTextLine,
  enableStudioTestApi,
  fillInlineEditor,
  openEditTool,
  saveEdits,
  selectFirstTwoPages,
  uploadPdf,
  waitForSavedFileId,
  waitForTextLayer,
} from './studio-edit-helpers';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function createTwoPagePdf(name: string): Promise<string> {
  const path = join(__dirname, `telemetry-actions-${name}.pdf`);
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const p1 = doc.addPage([612, 792]);
  p1.drawText('TELEMETRY ACTIONS PAGE 1', { x: 80, y: 700, size: 24, font });
  const p2 = doc.addPage([612, 792]);
  p2.drawText('TELEMETRY ACTIONS PAGE 2', { x: 80, y: 700, size: 24, font });
  writeFileSync(path, await doc.save());
  return path;
}

function safeDelete(path: string): void {
  if (existsSync(path)) {
    unlinkSync(path);
  }
}

/**
 * PRODUCT GAP (reported, not fixed here): a selection-scope save is not wired up — `applyChanges`
 * sends APPLY_STUDIO_TEXT_EDITS for `[preview]` only, so with two pages selected the emitted events
 * are still scope='single', pagesTotal=1. Batch save existed in commit 2648828 and was dropped in
 * the 5-stage workspace refactor (1ebb634). The strict expectation to restore with the feature is:
 *
 *   expect(actions.some((event) => event.action === 'apply' && event.scope === 'selection')).toBe(true);
 *   expect(actions.some((event) => event.action === 'apply' && Number(event.pagesTotal) >= 2)).toBe(true);
 *
 * Until then this spec pins the current contract instead of hiding it behind a skip.
 */
test.describe('Studio telemetry save actions P2', () => {
  test.setTimeout(180_000);

  test.beforeEach(async ({ page }) => {
    await enableStudioTestApi(page);
  });

  test('emits apply/undo/redo save actions for the edited page of a multi-page selection', async ({ page }) => {
    const pdfPath = await createTwoPagePdf('selection');
    try {
      await uploadPdf(page, pdfPath);
      await page.evaluate(() => {
        const api = (window as Window & { __LOCALPDF_V6_TEST_API?: { clearTelemetry?: () => void } }).__LOCALPDF_V6_TEST_API;
        api?.clearTelemetry?.();
      });

      const [beforeFirst] = await selectFirstTwoPages(page);
      await openEditTool(page, 'Text');
      await waitForTextLayer(page);

      await clickTextLine(page, 0);
      await fillInlineEditor(page, 'TELEMETRY ACTIONS UPDATED');
      await saveEdits(page);

      await page.waitForFunction(() => {
        const api = (window as Window & { __LOCALPDF_V6_TEST_API?: { getTelemetrySnapshot?: () => Array<Record<string, unknown>> } }).__LOCALPDF_V6_TEST_API;
        const events = api?.getTelemetrySnapshot?.() ?? [];
        return events.some((event) => event?.type === 'STUDIO_EDIT_SAVE_ACTION' && event.action === 'apply');
      }, { timeout: 90_000 });
      await waitForSavedFileId(page, beforeFirst);

      await page.getByRole('button', { name: /Undo Save/i }).click();
      await page.getByRole('button', { name: /Redo Save/i }).click();

      const actionsHandle = await page.waitForFunction(() => {
        const api = (window as Window & { __LOCALPDF_V6_TEST_API?: { getTelemetrySnapshot?: () => Array<Record<string, unknown>> } }).__LOCALPDF_V6_TEST_API;
        const events = api?.getTelemetrySnapshot?.() ?? [];
        const saveActions = events.filter((event) => event?.type === 'STUDIO_EDIT_SAVE_ACTION');
        return saveActions.length >= 3 ? saveActions : null;
      }, { timeout: 90_000 });

      const actions = await actionsHandle.jsonValue() as Array<Record<string, unknown>>;
      for (const action of ['apply', 'undo', 'redo'] as const) {
        const event = actions.find((candidate) => candidate.action === action) as
          | { scope?: string; pagesTotal?: number; pagesSucceeded?: number; pagesFailed?: number }
          | undefined;
        expect(event, `expected a ${action} save action`).toBeTruthy();
        expect(event?.scope).toBe('single');
        expect(event?.pagesTotal).toBe(1);
        expect(event?.pagesSucceeded).toBe(1);
        expect(event?.pagesFailed).toBe(0);
      }
    } finally {
      safeDelete(pdfPath);
    }
  });
});
