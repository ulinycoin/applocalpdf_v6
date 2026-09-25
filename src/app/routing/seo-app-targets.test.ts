import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveAppRoute } from '../../../shared/app-routes';
import { isCanvasTool } from '../../../shared/canvas-tools';
import { FEATURE_PAGE_CANVAS_TOOLS } from '../../../shared/seo-app-targets';

interface MarketingFeaturePage {
  slug: string;
  canvasTool: string | null;
}

/**
 * Loaded by URL because the website is its own package (no "type": "module"), so a static import
 * from here would be read as CommonJS and lose its named exports.
 */
async function loadMarketingPages(): Promise<MarketingFeaturePage[]> {
  const module = await import(
    new URL('../../../website/src/data/featurePages.ts', import.meta.url).href
  ) as { featurePages: MarketingFeaturePage[] };
  return module.featurePages;
}

test('no feature page routes to a standalone tool screen any more', async () => {
  const pages = await loadMarketingPages();
  assert.ok(pages.length >= 8, `expected the feature pages to load, got ${pages.length}`);

  for (const page of pages) {
    assert.equal(
      resolveAppRoute(page.slug),
      '/studio',
      `feature page "${page.slug}" must land in the canvas, not on a standalone tool screen`,
    );
  }
});

test('feature page tool ids are tools the canvas rail can open', () => {
  for (const [slug, toolId] of Object.entries(FEATURE_PAGE_CANVAS_TOOLS)) {
    if (toolId === null) {
      continue;
    }
    assert.ok(
      isCanvasTool(toolId),
      `feature page "${slug}" arms "${toolId}", which is not a canvas tool`,
    );
  }
});

test('feature pages use the shared tool map, so the app and the site cannot drift', async () => {
  const pages = await loadMarketingPages();

  for (const page of pages) {
    assert.equal(
      page.canvasTool,
      FEATURE_PAGE_CANVAS_TOOLS[page.slug as keyof typeof FEATURE_PAGE_CANVAS_TOOLS],
      `feature page "${page.slug}" declares a tool the shared map does not`,
    );
  }
});

test('the pages that promise a named tool arm it, and the canvas actions stay on the canvas', () => {
  assert.equal(FEATURE_PAGE_CANVAS_TOOLS['ocr-pdf'], 'ocr-pdf');
  assert.equal(FEATURE_PAGE_CANVAS_TOOLS['compress-pdf'], 'compress-pdf');
  assert.equal(FEATURE_PAGE_CANVAS_TOOLS['auto-toc-pdf'], 'auto-toc');
  assert.equal(FEATURE_PAGE_CANVAS_TOOLS['edit-pdf'], 'text');
  assert.equal(FEATURE_PAGE_CANVAS_TOOLS['sign-pdf'], 'sign');
  // Merge, split and convert are canvas actions/sections, so nothing is pre-selected.
  assert.equal(FEATURE_PAGE_CANVAS_TOOLS['merge-pdf'], null);
  assert.equal(FEATURE_PAGE_CANVAS_TOOLS['split-pdf'], null);
  assert.equal(FEATURE_PAGE_CANVAS_TOOLS['convert-pdf'], null);
});
