/**
 * Blog posts that absorb Search impressions without converting to /app.
 * GSC 28d (2026-06-24→07-22): high impressions / near-zero CTR, or thin
 * posts that only live via sitemap while /blog hub is already noindex.
 * Keep pages live for old links; block indexing + sitemap.
 */
export const NOINDEX_BLOG_SLUGS = [
  // Wave 1–2 (high impressions, ~0 clicks)
  'edit-text-in-pdf-guide',
  'create-fillable-pdf-forms-guide',
  'ocr-pdf-extract-text',
  'how-to-merge-pdf-files',
  'convert-word-pdf-guide',
  // Wave 3 — remaining indexed posts (cannibals / zero-app funnel)
  'best-pdf-editors-that-dont-upload-files',
  'best-pdf-workflow-for-accountants-handling-invoices-privately',
  'browser-based-pdf-converter-with-local-processing',
  'add-watermark-to-pdf',
  'cloud-vs-local-pdf-ocr-for-sensitive-scans',
  'compress-pdf-without-losing-quality',
  'convert-pdf-to-images-guide',
  'how-to-edit-a-contract-pdf-without-uploading-it',
  'how-to-generate-pdf-table-of-contents',
  'how-to-merge-pdfs-locally-for-legal-and-finance-teams',
  'how-to-sign-pdf-digitally',
  'how-to-split-pdf-files',
  'pdf-privacy-checklist-before-sharing-contracts-or-invoices',
  'pdf-security-best-practices',
  'smart-merge-ai-pdf-sorting',
  'smart-organize-ai-page-analysis',
  'what-is-a-local-first-pdf-editor',
] as const;

export const NOINDEX_BLOG_SLUG_SET = new Set<string>(NOINDEX_BLOG_SLUGS);

export const NOINDEX_BLOG_SITEMAP_URLS = NOINDEX_BLOG_SLUGS.map(
  (slug) => `https://localpdf.online/blog/${slug}`,
);
