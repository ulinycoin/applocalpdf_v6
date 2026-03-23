# LocalPDF SEO Execution Plan — 2026 Q2

**Date:** 2026-03-23  
**Source:** `docs/SEO_RESEARCH_2026-03-23.md`

---

# Goal

Turn LocalPDF into the clearest search and AI-answer fit for:
- private PDF editor
- PDF tools without upload
- local-first PDF workflows
- sensitive-document browser PDF work

---

# Workstreams

## 1. Technical SEO

### Done
- Add `noindex` to `/app/`
- Add `X-Robots-Tag` to `/app` routes
- Expand homepage schema
- Expand feature-page schema

### Next
- Validate production headers after deploy
- Re-check sitemap contents in production
- Confirm no accidental indexing of app-shell routes
- Validate OG/Twitter previews on new pages
- Run real CWV check with GSC / CrUX / Lighthouse

---

## 2. Page architecture

### Done
- `/compare/localpdf-vs-smallpdf`
- `/compare/localpdf-vs-ilovepdf`
- `/compare/localpdf-vs-sejda`
- `/use-cases/lawyers`
- `/use-cases/accountants`
- `/private-pdf-editor`
- `/pdf-tools-without-upload`
- `/how-local-pdf-processing-works`

### Next recommended pages
- `/client-side-pdf-editor`
- `/secure-pdf-editor`
- `/compare/localpdf-vs-adobe-acrobat-online`
- `/compare/localpdf-vs-canva-pdf-editor`

### Newly completed in this batch
- `/use-cases/internal-operations`
- `/use-cases/hr-sensitive-documents`
- `/compare/localpdf-vs-pdf24`
- `/compare/localpdf-vs-pdfescape`

---

# URL → intent map

| URL | Target keyword | Intent | Page type | Priority |
|---|---|---|---|---|
| `/private-pdf-editor` | private pdf editor | BOFU / category | Category page | P0 |
| `/pdf-tools-without-upload` | pdf tools without upload | BOFU / trust | Category page | P0 |
| `/how-local-pdf-processing-works` | local pdf processing | TOFU / GEO | Explainer | P1 |
| `/compare/localpdf-vs-smallpdf` | smallpdf alternative privacy | BOFU | Comparison | P0 |
| `/compare/localpdf-vs-ilovepdf` | ilovepdf alternative privacy | BOFU | Comparison | P0 |
| `/compare/localpdf-vs-sejda` | sejda alternative privacy | BOFU | Comparison | P1 |
| `/use-cases/lawyers` | pdf editor for lawyers | BOFU | Use case | P0 |
| `/use-cases/accountants` | pdf editor for accountants | BOFU | Use case | P0 |
| `/use-cases/internal-operations` | private pdf workflow for operations | MOFU / BOFU | Use case | P1 |
| `/use-cases/hr-sensitive-documents` | secure pdf tool for hr documents | BOFU | Use case | P1 |

---

# Content publishing queue

## Batch 1 — highest priority
1. Best PDF editors that don’t upload files
2. What is a local-first PDF editor?
3. How to edit a contract PDF without uploading it
4. Best PDF workflow for accountants handling invoices privately

## Batch 2
5. Cloud vs local PDF OCR for sensitive scans
6. How to merge PDFs locally for legal and finance teams
7. PDF privacy checklist before sharing contracts or invoices
8. Browser-based PDF converter with local processing

## Batch 3
9. LocalPDF vs PDF24
10. LocalPDF vs PDFescape
11. Secure PDF workflows for HR teams
12. Client-side PDF editor explained

---

# Internal linking rules

## Homepage should link to
- `/private-pdf-editor`
- `/pdf-tools-without-upload`
- top comparison pages
- top use-case pages
- key feature pages

## Blog should link to
- related feature page
- one category page
- one use-case page when relevant
- one comparison page when commercial intent is present

## Use-case pages should link to
- security
- privacy
- relevant feature pages
- relevant comparison pages

## Comparison pages should link to
- security
- category pages
- relevant use-case pages
- homepage / app CTA

---

# Schema checklist by page type

## Homepage
- WebSite
- Organization
- SoftwareApplication
- FAQPage

## Feature pages
- SoftwareApplication
- WebPage
- BreadcrumbList
- FAQPage
- HowTo

## Blog pages
- Article / BlogPosting
- BreadcrumbList
- FAQPage when applicable

## Comparison pages
- Article
- FAQPage
- BreadcrumbList

## Use-case pages
- WebPage
- Audience
- FAQPage

---

# GEO formatting checklist

Every strategic page should include:
- one clear definition paragraph
- 2–4 short factual claims
- one comparison table or decision block
- FAQ section
- “best for” language
- explicit audience/use-case statement

---

# Deployment checklist

Before/after publish:
1. Build passes
2. New pages in sitemap
3. Canonicals correct
4. Noindex only on `/app/`
5. Internal links visible from homepage/header/footer where needed
6. Social preview tags render properly
7. Request indexing in GSC for high-priority pages

---

# Success metrics

Track in GSC / analytics:
- impressions for privacy-first keywords
- clicks to comparison pages
- clicks to use-case pages
- assisted conversions from blog → use-case / comparison → app
- branded + non-branded growth for “private pdf editor” cluster

---

# Immediate next implementation order

1. Ship current page batch to production
2. Validate production indexing behavior and headers
3. Publish 4 highest-priority blog articles
4. Add internal-operations and HR use-case pages
5. Add 2 more competitor comparison pages
6. Run live CWV / indexing review after deployment
