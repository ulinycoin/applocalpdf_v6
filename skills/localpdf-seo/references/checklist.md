# LocalPDF SEO Checklist

## 1. Live checks
- Homepage returns 200
- `robots.txt` exists and points to sitemap
- `sitemap-index.xml` exists
- representative feature page is indexable
- representative blog article is indexable
- canonical host redirects are correct

## 2. Metadata checks
For homepage, one feature page, one trust page, one blog article:
- title present and specific
- meta description present and useful
- canonical present
- one H1
- OG/Twitter tags present
- robots tag matches strategy

## 3. Schema checks
- homepage schema is brand-appropriate
- feature-page schema is feature-appropriate
- blog uses `BlogPosting`
- no fake ratings or ecommerce-only properties unless backed by reality

## 4. Route governance
Use this table when deciding route handling:

- Core feature / strategic keyword -> indexable canonical page
- Alias with clear replacement -> 308 redirect
- User-helpful but non-canonical utility page -> noindex
- Retired page with no replacement -> consider 410

## 5. Long-tail cluster map
- edit-pdf <- add-text, rotate, watermark, organize, forms
- merge-pdf <- merge variants and ordering topics
- ocr-pdf <- scanned PDF, searchable PDF, extract text
- split-pdf <- split, delete pages, extract pages
- convert-pdf <- word/pdf/images conversions
- security <- protect/unlock/privacy/trust questions

## 6. Trust-first checks
Because LocalPDF sells privacy and local-first handling, always review:
- security headers
- TLS chain health
- consistency between marketing claims and actual implementation
- Security / Privacy / FAQ discoverability

## 7. Repo hotspots
- `website/src/layouts/BaseLayout.astro`
- `website/src/layouts/MarketingLayout.astro`
- `website/src/components/marketing/SEOHead.astro`
- `website/src/pages/index.astro`
- `website/src/pages/features/*.astro`
- `website/src/pages/blog/*.astro`
- `website/astro.config.mjs`
- `vercel.json`
