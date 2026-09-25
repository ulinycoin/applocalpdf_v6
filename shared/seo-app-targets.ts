/**
 * Which in-app surface each marketing feature page opens. The website reads this map for its CTAs,
 * and src/app/routing/seo-app-targets.test.ts asserts every target resolves to a route the SPA
 * actually serves — so an SEO visitor always lands on the tool the page promises.
 */
export const FEATURE_PAGE_APP_TARGETS = {
  'edit-pdf': 'edit-pdf',
  'merge-pdf': 'merge-pdf',
  'ocr-pdf': 'ocr-pdf',
  'compress-pdf': 'compress-pdf',
  'split-pdf': 'split-pdf',
  'sign-pdf': 'sign-pdf',
  'convert-pdf': 'convert-pdf',
  'auto-toc-pdf': 'auto-toc-pdf',
} as const;

export type FeaturePageSlug = keyof typeof FEATURE_PAGE_APP_TARGETS;

export function featurePageAppTarget(slug: FeaturePageSlug): string {
  return FEATURE_PAGE_APP_TARGETS[slug];
}
