import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveAppRoute } from '../../../shared/app-routes';
import { FEATURE_PAGE_APP_TARGETS } from '../../../shared/seo-app-targets';
import { canRunStandalone } from '../../../shared/standalone-tools';

/**
 * Routes the SPA actually serves: the studio surfaces plus the tool ids that get a standalone
 * wizard route (see buildToolRoutes + isStandaloneToolHidden). A feature page whose target is
 * missing here would hit the catch-all redirect and silently fall back to the canvas — which is
 * exactly how every SEO visitor used to end up in the studio instead of the tool they came for.
 */
const SERVED_ROUTES = new Set([
  '/studio',
  '/studio/edit',
  '/studio/convert',
  '/auto-toc',
  '/compress-pdf',
  '/encrypt-pdf',
  '/excel-to-pdf',
  '/extract-images',
  '/merge-pdf',
  '/ocr-pdf',
  '/pdf-editor',
  '/pdf-to-jpg',
  '/protect-pdf',
  '/share-pdf',
  '/unlock-pdf',
  '/word-to-pdf',
]);

interface MarketingFeaturePage {
  slug: string;
  appHash: string;
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

test('every marketing feature page opens a route the SPA serves', async () => {
  const pages = await loadMarketingPages();
  assert.ok(pages.length >= 8, `expected the feature pages to load, got ${pages.length}`);

  for (const page of pages) {
    const route = resolveAppRoute(page.appHash);
    assert.ok(
      SERVED_ROUTES.has(route),
      `feature page "${page.slug}" points at "${route}", which the SPA does not serve`,
    );
  }
});

test('feature pages use the shared target map, so the app and the site cannot drift', async () => {
  const pages = await loadMarketingPages();

  for (const page of pages) {
    assert.equal(
      page.appHash,
      FEATURE_PAGE_APP_TARGETS[page.slug as keyof typeof FEATURE_PAGE_APP_TARGETS],
      `feature page "${page.slug}" declares a target the shared map does not`,
    );
  }
});

/** ocr-pdf is served by its own page (OcrPdfTestPage) rather than the wizard shell. */
const DEDICATED_STANDALONE_ROUTES = new Set(['/ocr-pdf']);

test('feature pages that point at a tool route land on a tool that runs standalone', () => {
  for (const [slug, target] of Object.entries(FEATURE_PAGE_APP_TARGETS)) {
    const route = resolveAppRoute(target);
    const toolId = route.slice(1);
    if (route.startsWith('/studio') || DEDICATED_STANDALONE_ROUTES.has(route)) {
      continue;
    }
    assert.ok(
      canRunStandalone(toolId),
      `feature page "${slug}" promises tool "${toolId}", which only renders a "Studio-first" notice`,
    );
  }
});

test('feature pages spread across tools instead of all funnelling into the canvas', () => {
  const routes = new Map(
    Object.entries(FEATURE_PAGE_APP_TARGETS).map(([slug, target]) => [slug, resolveAppRoute(target)]),
  );

  assert.equal(routes.get('merge-pdf'), '/merge-pdf');
  assert.equal(routes.get('compress-pdf'), '/compress-pdf');
  assert.equal(routes.get('ocr-pdf'), '/ocr-pdf');
  assert.equal(routes.get('auto-toc-pdf'), '/auto-toc');
  assert.equal(routes.get('split-pdf'), '/studio');
  assert.equal(routes.get('sign-pdf'), '/studio/edit');
  assert.equal(routes.get('edit-pdf'), '/studio/edit');
  // The convert workspace bounces to the canvas without an open document, so the SEO page goes
  // straight there instead of flashing a redirect.
  assert.equal(routes.get('convert-pdf'), '/studio');

  const distinctRoutes = new Set(routes.values());
  assert.ok(
    distinctRoutes.size >= 5,
    `expected feature pages to spread across tools, got ${[...distinctRoutes].join(', ')}`,
  );
});
