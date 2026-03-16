---
name: localpdf-seo
description: Audit, plan, and implement SEO improvements for the LocalPDF website and marketing surface. Use when working on LocalPDF search visibility, metadata, schema, sitemap/robots, redirects, trust-page SEO, internal linking, content clusters, or feature-page intent matching. Use for both audits and concrete repo changes inside website/, vercel.json, and related marketing content.
---

# LocalPDF SEO

Use this skill to keep LocalPDF SEO work consistent, evidence-based, and tied to the product's local-first positioning.

## Core workflow

1. Start with the live surface.
   - Check homepage, robots, sitemap, and one representative feature page.
   - Confirm current titles, descriptions, canonicals, robots tags, and visible positioning.

2. Check the source of truth in the repo.
   - Review `website/src/layouts/`
   - Review `website/src/pages/`
   - Review `website/src/components/marketing/`
   - Review `website/astro.config.mjs`
   - Review `vercel.json`

3. Classify findings into four buckets.
   - Technical SEO
   - Structured data
   - Information architecture / internal linking
   - Content / search-intent fit

4. Prefer fixes that improve both trust and rankings.
   - LocalPDF is a privacy-first product.
   - Trust signals are part of SEO because they affect CTR and conversion.

5. When implementing, change the smallest stable layer.
   - Prefer shared layout/components for metadata fixes.
   - Prefer page-level edits for positioning and intent targeting.
   - Prefer config-level edits for redirects, headers, robots, and sitemap behavior.

## LocalPDF-specific rules

- Treat `website/` as the marketing SEO surface.
- Treat `/app` as the product shell, not the primary SEO landing surface.
- Keep canonical marketing pages indexable.
- Keep legacy utility aliases either redirected, noindexed, or intentionally retired; do not let them drift.
- Avoid inflated trust claims. Match copy to real product behavior.
- Avoid schema spam. Only publish structured data that is page-relevant and defensible.

## What to inspect first

### Technical SEO
- `website/astro.config.mjs`
- `website/public/robots.txt`
- generated sitemap output
- `vercel.json` redirects, rewrites, headers
- canonical host behavior
- robots/noindex behavior on legacy pages

### Metadata and templates
- `website/src/layouts/BaseLayout.astro`
- `website/src/layouts/MarketingLayout.astro`
- `website/src/components/marketing/SEOHead.astro`

### Money pages
- `website/src/pages/index.astro`
- `website/src/pages/features/*.astro`
- `website/src/pages/security.astro`
- `website/src/pages/privacy.astro`
- `website/src/pages/faq.astro`

### Content engine
- `website/src/pages/blog/*.astro`
- `website/src/content/blog/*.mdx`
- `website/src/data/featurePages.ts`

## Decision rules

### Canonical vs redirect vs noindex
- Use **canonical indexable pages** for core workflows and high-value search intents.
- Use **308 redirects** when an old or variant route has a clear replacement.
- Use **noindex** only if the page still has user value but should not compete in search.
- Use **410** later for retired pages with no replacement if removal speed matters.

### Feature-page strategy
When long-tail routes redirect into a broad feature page, ensure the destination page explicitly covers that intent.

Examples:
- `edit-pdf` should absorb: add text, rotate, watermark, organize, forms
- `convert-pdf` should absorb: pdf-to-word, word-to-pdf, images-to-pdf, pdf-to-images
- `split-pdf` should absorb: extract pages, delete pages
- `security` should absorb: protect pdf, unlock pdf if that is the chosen canonical cluster

### Structured data
Prefer:
- `WebSite` for homepage
- `Organization` for brand/company context
- `SoftwareApplication` for relevant product pages
- `FAQPage` only where the questions are visible on-page
- `BlogPosting` for articles
- `BreadcrumbList` where useful

Avoid:
- fake aggregate ratings
- ecommerce shipping/return fields for the web app
- globally injecting the same schema block everywhere without page fit

## Output expectations

When reporting SEO work:
- separate findings by severity: high / medium / low
- cite exact files to change
- propose concrete next actions, not generic advice
- when possible, tie each recommendation to one of:
  - crawl/indexation
  - query intent match
  - CTR/snippet quality
  - trust/conversion

## Resources

- Read `references/checklist.md` for the execution checklist and route policy.
