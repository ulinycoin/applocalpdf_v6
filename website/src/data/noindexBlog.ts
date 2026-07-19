/** Blog slugs with high GSC impressions and ~0 clicks — noindex + sitemap block. */
export const NOINDEX_BLOG_SLUGS = [
  'edit-text-in-pdf-guide',
  'create-fillable-pdf-forms-guide',
  'ocr-pdf-extract-text',
  'how-to-merge-pdf-files',
  'convert-word-pdf-guide',
] as const;

export const NOINDEX_BLOG_SLUG_SET = new Set<string>(NOINDEX_BLOG_SLUGS);

export const NOINDEX_BLOG_SITEMAP_URLS = NOINDEX_BLOG_SLUGS.map(
  (slug) => `https://localpdf.online/blog/${slug}`,
);
