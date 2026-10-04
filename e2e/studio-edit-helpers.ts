import { expect, type Page } from '@playwright/test';
import { extractEmbeddedPdfText } from '../src/services/pdf/pdf-text-extractor';

/**
 * Shared plumbing for the Studio edit specs.
 *
 * The edit surface moved into an overlay that StudioShell portals onto `document.body`: the rail
 * button "Text" opens it (there is no `Edit` button and the URL stays `/app/studio`), while the
 * extracted-text highlights are `pointer-events: none` decorations, so selecting a line means
 * clicking the canvas at the highlight's coordinates.
 */

export interface StudioPageHandle {
  fileId: string;
}

export type EditToolLabel = 'Text' | 'Annotate' | 'Sign' | 'Whiteout' | 'Watermark' | 'Forms' | 'Protect';

/** The VFS / telemetry hooks are compiled out of production builds unless this flag is present. */
export async function enableStudioTestApi(page: Page): Promise<void> {
  await page.addInitScript(() => {
    (window as Window & { __PLAYWRIGHT_TEST__?: boolean }).__PLAYWRIGHT_TEST__ = true;
  });
}

export async function uploadPdf(page: Page, pdfPath: string): Promise<void> {
  await page.goto('/app/studio');
  await page.locator('input[type="file"]').first().setInputFiles(pdfPath);
}

/**
 * Waits until the uploaded PDF is in the studio store, selects its first page and returns the page
 * file id at that moment (edits replace it on save).
 */
export async function selectFirstPage(page: Page, timeout = 20_000): Promise<string> {
  const handle = await page.waitForFunction(() => {
    const store = (window as Window & {
      __LOCALPDF_STUDIO_STORE__?: {
        getState: () => {
          documents: Array<{ id: string; pages: Array<{ id: string; fileId: string }> }>;
          setActiveDocument: (id: string | null) => void;
          setSelection: (selection: Array<{ docId: string; pageId: string }>) => void;
        };
      };
    }).__LOCALPDF_STUDIO_STORE__;
    if (!store) {
      return null;
    }
    const state = store.getState();
    const doc = state.documents[0];
    const firstPage = doc?.pages[0];
    if (!doc || !firstPage) {
      return null;
    }
    state.setActiveDocument(doc.id);
    state.setSelection([{ docId: doc.id, pageId: firstPage.id }]);
    return firstPage.fileId;
  }, { timeout });
  return await handle.jsonValue() as string;
}

/** Selects the first page of the most recently added document (used when a second file is opened). */
export async function selectLastDocumentFirstPage(page: Page, timeout = 20_000): Promise<string> {
  const handle = await page.waitForFunction(() => {
    const store = (window as Window & {
      __LOCALPDF_STUDIO_STORE__?: {
        getState: () => {
          documents: Array<{ id: string; pages: Array<{ id: string; fileId: string }> }>;
          setActiveDocument: (id: string | null) => void;
          setSelection: (selection: Array<{ docId: string; pageId: string }>) => void;
        };
      };
    }).__LOCALPDF_STUDIO_STORE__;
    if (!store) {
      return null;
    }
    const state = store.getState();
    const doc = state.documents[state.documents.length - 1];
    const firstPage = doc?.pages[0];
    if (!doc || !firstPage) {
      return null;
    }
    state.setActiveDocument(doc.id);
    state.setSelection([{ docId: doc.id, pageId: firstPage.id }]);
    return firstPage.fileId;
  }, { timeout });
  return await handle.jsonValue() as string;
}

/** Selects the first two pages of the first document; returns both file ids. */
export async function selectFirstTwoPages(page: Page, timeout = 20_000): Promise<[string, string]> {
  const handle = await page.waitForFunction(() => {
    const store = (window as Window & {
      __LOCALPDF_STUDIO_STORE__?: {
        getState: () => {
          documents: Array<{ id: string; pages: Array<{ id: string; fileId: string }> }>;
          setActiveDocument: (id: string | null) => void;
          setSelection: (selection: Array<{ docId: string; pageId: string }>) => void;
        };
      };
    }).__LOCALPDF_STUDIO_STORE__;
    if (!store) {
      return null;
    }
    const state = store.getState();
    const doc = state.documents[0];
    const first = doc?.pages[0];
    const second = doc?.pages[1];
    if (!doc || !first || !second) {
      return null;
    }
    state.setActiveDocument(doc.id);
    state.setSelection([
      { docId: doc.id, pageId: first.id },
      { docId: doc.id, pageId: second.id },
    ]);
    return [first.fileId, second.fileId];
  }, { timeout });
  return await handle.jsonValue() as [string, string];
}

/** Opens the edit overlay from the studio rail (URL intentionally unchanged: it is a portal). */
export async function openEditTool(page: Page, tool: EditToolLabel = 'Text'): Promise<void> {
  await page.locator('.studio-tool-rail').getByRole('button', { name: tool, exact: true }).click();
  await expect(page.locator('.studio-edit-shell')).toBeVisible({ timeout: 20_000 });
}

/** Waits for the extracted text layer (or the "no text layer" message) to settle. */
export async function waitForTextLayer(page: Page, timeout = 20_000): Promise<void> {
  await page.waitForFunction(() => {
    const sheet = document.querySelector('.studio-edit-canvas-content');
    return Number(sheet?.getAttribute('data-text-layer-len') ?? '0') > 0
      || Boolean(document.querySelector('.studio-edit-message-text'));
  }, { timeout }).catch(() => undefined);
}

export async function highlightBox(page: Page, index = 0): Promise<{ x: number; y: number; width: number; height: number }> {
  const highlight = page.locator('.studio-edit-text-highlight').nth(index);
  await expect(highlight).toBeVisible({ timeout: 15_000 });
  const box = await highlight.boundingBox();
  if (!box) {
    throw new Error(`Missing text highlight bounding box for index ${index}`);
  }
  return box;
}

/**
 * Clicks a PDF text line through the highlight's coordinates. The highlight itself ignores pointer
 * events on purpose (it is a read-only overlay), so the Text tool receives the click on the canvas
 * and opens the inline editor seeded with that line.
 */
export async function clickTextLine(page: Page, index = 0): Promise<{ x: number; y: number; width: number; height: number }> {
  const box = await highlightBox(page, index);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  return box;
}

/** Vertically lowest / highest highlight of the page, for two-line fixtures. */
export async function pickHighlightByVerticalOrder(page: Page, order: 'top' | 'bottom'): Promise<number> {
  const count = await page.locator('.studio-edit-text-highlight').count();
  let bestIndex = 0;
  let bestY = order === 'top' ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
  for (let index = 0; index < count; index += 1) {
    const box = await page.locator('.studio-edit-text-highlight').nth(index).boundingBox();
    if (!box) continue;
    const better = order === 'top' ? box.y < bestY : box.y > bestY;
    if (better) {
      bestY = box.y;
      bestIndex = index;
    }
  }
  return bestIndex;
}

export async function enableAddTextBoxMode(page: Page): Promise<void> {
  const addButton = page.getByRole('button', { name: 'Add Text Box' });
  await expect(addButton).toBeVisible({ timeout: 10_000 });
  await addButton.click();
}

/** Draws a whiteout over the given page-ratio rectangle (device coordinates are derived here). */
export async function dragRectOnCanvas(
  page: Page,
  box: { x: number; y: number; width: number; height: number },
  padding = 6,
): Promise<void> {
  await page.mouse.move(box.x - padding, box.y - padding);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width + padding, box.y + box.height + padding, { steps: 10 });
  await page.mouse.up();
}

export async function fillInlineEditor(page: Page, text: string): Promise<void> {
  const textarea = page.locator('.studio-edit-textarea').first();
  await expect(textarea).toBeVisible({ timeout: 10_000 });
  await textarea.fill(text);
}

export async function saveEdits(page: Page): Promise<void> {
  await page.getByTestId('studio-edit-save-btn').click();
}

/** Waits for the saved page file id to be replaced and returns the new id. */
export async function waitForSavedFileId(page: Page, previousFileId: string, timeout = 90_000): Promise<string> {
  const handle = await page.waitForFunction((prevId) => {
    const store = (window as Window & {
      __LOCALPDF_STUDIO_STORE__?: { getState: () => { documents: Array<{ pages: Array<{ fileId: string }> }> } };
    }).__LOCALPDF_STUDIO_STORE__;
    const current = store?.getState().documents[0]?.pages[0]?.fileId;
    if (!current || current === prevId) {
      return null;
    }
    return current;
  }, previousFileId, { timeout });
  return await handle.jsonValue() as string;
}

export async function readVfsFileBase64(page: Page, fileId: string): Promise<string> {
  return await page.evaluate(async (id) => {
    const api = (window as Window & {
      __LOCALPDF_V6_TEST_API?: { readFileBase64?: (fileId: string) => Promise<string> };
    }).__LOCALPDF_V6_TEST_API;
    if (!api?.readFileBase64) {
      throw new Error('__LOCALPDF_V6_TEST_API.readFileBase64 is unavailable in this build');
    }
    return api.readFileBase64(id);
  }, fileId);
}

/** Extracts the embedded text of a VFS PDF (Node-side, so a browser extraction bug cannot pass it). */
export async function extractTextFromBase64(base64Pdf: string): Promise<string> {
  const bytes = Uint8Array.from(Buffer.from(base64Pdf, 'base64'));
  const extracted = await extractEmbeddedPdfText(new Blob([bytes], { type: 'application/pdf' }));
  return (extracted?.text ?? '').replace(/\s+/gu, ' ').trim();
}

/** Current VFS file id of a page of the first document. */
export async function readPageFileId(page: Page, index: number): Promise<string> {
  return await page.evaluate((pageIndex) => {
    const store = (window as Window & {
      __LOCALPDF_STUDIO_STORE__?: { getState: () => { documents: Array<{ pages: Array<{ fileId: string }> }> } };
    }).__LOCALPDF_STUDIO_STORE__;
    const pages = store?.getState().documents[0]?.pages;
    return pages?.[pageIndex]?.fileId ?? '';
  }, index);
}

/** Whitespace-stripped uppercase form, for substring assertions that must survive PDF layout. */
export function squash(value: string): string {
  return value.replace(/\s+/gu, '').toUpperCase();
}

export async function readSavedPageText(page: Page, fileId: string): Promise<string> {
  return await extractTextFromBase64(await readVfsFileBase64(page, fileId));
}
