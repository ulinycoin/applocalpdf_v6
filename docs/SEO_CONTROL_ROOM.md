# LocalPDF SEO Control Room

_Last updated: 2026-03-16_

## Purpose

This document is the operating dashboard for LocalPDF SEO.
Use it to answer four questions quickly:

1. What is already fixed?
2. What is already covered by canonical pages?
3. What is still weak or missing?
4. What should be done next, in order?

Working repo:
- `/Users/aleksejs/Desktop/LocalPDF_V6`

Main site:
- `https://localpdf.online/`

---

## Current status

## Foundation: in place

The site already has a solid base:
- crawlable marketing surface
- canonical tags on main pages
- robots + sitemap
- trust pages in public navigation
- feature pages for core product jobs
- blog content connected to product workflows

## SEO work completed so far

### Sprint 1 — technical + metadata cleanup
Commit: `22b3932`

Completed:
- baseline CSP added in `vercel.json`
- misleading global schema removed from `website/src/layouts/BaseLayout.astro`
- trust/company page titles and descriptions improved
- homepage copy strengthened for category intent
- first feature intent bridge added

### Sprint 2 — trust hub + feature intent expansion
Commit: `6132d66`

Completed:
- stronger feature intent coverage for convert/split/trust-sensitive flows
- stronger `security` page as trust hub
- better blog → feature internal links for selected articles

### Sprint 3 — cluster tightening + mapping
Commit: `6444b14`

Completed:
- remaining feature clusters tightened
- additional blog CTA/internal linking improvements
- practical cluster map created in `docs/SEO_SPRINT_3_MAP.md`

---

## Canonical SEO architecture

This is the current working model.

| Cluster | Canonical page | Status | Notes |
| --- | --- | --- | --- |
| Homepage / category | `/` | Stronger | Good positioning after sprint 1, but still can sharpen differentiation further |
| Edit PDF | `/features/edit-pdf` | Good | Absorbs add text / rotate / watermark style intent |
| Merge PDF | `/features/merge-pdf` | Good | Better cluster support after sprint 3 |
| OCR PDF | `/features/ocr-pdf` | Good | Strong trust-sensitive cluster |
| Compress PDF | `/features/compress-pdf` | Good | Better article support after sprint 3 |
| Split PDF | `/features/split-pdf` | Good | Absorbs extract/delete/split range intent |
| Sign PDF | `/features/sign-pdf` | Good | Tightened in sprint 3 |
| Convert PDF | `/features/convert-pdf` | Good | Absorbs word/pdf/image conversion cluster |
| Security / trust | `/security` | Good | Now acts as trust hub |
| Privacy | `/privacy` | Stable | Support/trust page, not a primary money page |
| FAQ | `/faq` | Stable | Support/trust page, not a primary money page |
| About | `/about` | Stable | Brand/support page |
| Terms | `/terms` | Stable | Legal/support page |

For cluster details, use:
- `docs/SEO_SPRINT_3_MAP.md`

---

## What is already working well

### Technical SEO
- sitemap and robots are present
- core pages are indexable
- builds are passing
- baseline CSP now exists
- schema is much cleaner than initial state

### Information architecture
- homepage → feature pages → trust pages → blog is coherent
- redirect strategy consolidates many long-tail routes into canonical pages
- trust pages are visible, not buried

### On-page / intent fit
- homepage now speaks more clearly to “private PDF editor / local-first PDF tools”
- feature pages are no longer too generic for major clusters
- trust pages have more descriptive metadata

### Internal linking
- selected blog articles now push users more clearly into canonical workflows
- security page now routes users into trust-sensitive product flows

---

## What is still weak or incomplete

## 1. CSP is baseline, not final

Current state:
- better than before
- still pragmatic rather than strict

Why:
- inline scripts / analytics dependencies still limit how strict CSP can be

Next step later:
- reduce inline dependencies
- tighten CSP away from `unsafe-inline` where feasible

Priority: **Medium**

---

## 2. Live trust/header verification still needs an external pass

Still worth checking live:
- TLS certificate chain
- whether `Access-Control-Allow-Origin: *` is still exposed on HTML
- deployed CSP behavior in production

Priority: **Medium**

---

## 3. Search surface can still expand via supporting content

Canonical pages are stronger now, but cluster depth is still limited.
That means LocalPDF has a better structure than before, but not yet a large enough content moat.

Big opportunity:
- add more cluster-supporting articles only where they clearly map into existing canonical pages

Priority: **High**

---

## 4. Route governance should stay disciplined

The current model works because it avoids random indexation.
That discipline can break if future pages are added without a cluster plan.

Rule:
- every new page must answer one of these:
  - Is it canonical?
  - Is it a supporting article?
  - Is it a redirect alias?
  - Is it intentionally noindex?

Priority: **High**

---

## 5. There is no explicit measurement loop yet in this repo

Missing operating layer:
- Search Console review rhythm
- ranking/query watchlist
- page-level SEO KPI tracking
- PostHog bridge from SEO landing pages into actual tool usage

Without that, work quality may improve while learning speed stays low.

Priority: **High**

### New evidence from PostHog (2026-03-16)

A first analytics pass now exists in:
- `docs/ANALYTICS_POSTHOG_2026-03-16.md`

What it tells us:
- traffic is not isolated to the homepage; feature/SEO pages already contribute meaningful demand
- merge and OCR are the clearest current SEO/product bridge candidates
- successful tool runs can already be tied to entry URLs in a lightweight way
- runtime telemetry exists via `duration_ms`, which makes UX/performance issues measurable, especially for OCR

Operating implication:
- SEO should no longer be managed as impressions-only work
- for priority clusters, track both:
  - search visibility / page demand
  - downstream product outcomes (tool starts, successes, errors, runtime)

---

## What to do next

## Priority order

### P1 — measurement and operating discipline
1. Create a lightweight SEO review cadence
2. Track Search Console changes by cluster
3. Track which canonical pages gain impressions vs clicks
4. Track which articles assist conversions into feature pages

### P2 — content expansion by cluster
Focus on the highest-value canonical pages and only add supporting articles that reinforce them.

Recommended first expansion candidates:
- Edit PDF cluster
- Convert PDF cluster
- OCR PDF cluster
- Security/trust cluster

### P3 — technical tightening
1. tighten CSP
2. verify TLS and response headers live
3. review whether any metadata/schema polish remains on high-value pages

---

## Recommended cluster expansion order

### Tier 1
These feel most strategically important for LocalPDF’s positioning.

1. **Edit PDF**
   - broad demand
   - high commercial relevance
   - easy bridge into privacy/local-first story

2. **Convert PDF**
   - many long-tail variants
   - strong utility demand
   - good bridge into app workflows

3. **OCR PDF**
   - strong trust-sensitive narrative
   - supports local-first differentiation well

### Tier 2
4. **Security / trust**
   - supports conversion and credibility
   - should stay factual, not bloated

5. **Split PDF**
   - practical cluster with good intent clarity

6. **Merge PDF / Compress PDF / Sign PDF**
   - useful, but slightly lower leverage unless search data says otherwise

---

## Suggested supporting article backlog

These are examples of reasonable next articles, not mandatory promises.

### Edit PDF cluster
- how to add text to a pdf without re-export chaos
- how to rotate pdf pages before sending a document
- when to watermark a pdf vs edit the original

### Convert PDF cluster
- best way to convert images to pdf without losing order
- how to convert pdf to word for editing sensitive documents
- when to use OCR before converting a scanned PDF

### OCR cluster
- how to make scanned pdfs searchable
- OCR for invoices, contracts, and archive records
- scanned PDF vs text PDF: when OCR is required

### Security / trust cluster
- when a PDF workflow should stay local-first
- what users should verify before opening an online PDF tool
- practical PDF privacy checklist for internal documents

---

## Rules for future SEO work

## Rule 1 — no fake SEO theater
Do not add:
- fake ratings
- fake reviews
- fake counts
- ecommerce properties that do not fit the product

## Rule 2 — one cluster, one canonical owner
Do not create multiple indexable pages that fight for the same intent unless there is a clear strategic reason.

## Rule 3 — supporting content must support
Every new article should strengthen a canonical page, not drift into isolated blog content.

## Rule 4 — trust claims must match implementation
LocalPDF wins when privacy/trust language feels believable and specific.
It loses when trust copy becomes vague or inflated.

## Rule 5 — no random page creation
If a route does not fit the canonical/supporting/redirect/noindex model, it should not exist yet.

---

## Weekly operating rhythm

Use this lightweight loop:

### Once per week
- review Search Console for top gaining queries
- review which canonical pages got new impressions
- review CTR drops on homepage and feature pages
- review whether any blog pages are getting impressions without clear conversion links
- review PostHog entry URLs and successful tool runs for priority pages (`/`, merge, OCR, convert)
- check whether slow/fragile flows are affecting SEO-backed traffic, especially OCR

### Every 2 weeks
- choose one cluster to strengthen
- either:
  - improve the canonical page
  - add one strong supporting article
  - improve linking between the two

### Once per month
- re-check live headers / trust surface
- review sitemap and route hygiene
- prune or redirect weak pages if necessary

---

## Control room checklist

Before starting a new SEO task, answer:

1. Which cluster does this belong to?
2. What is the canonical page?
3. Is this a canonical page improvement, a supporting article, or route governance work?
4. What existing article/page should link to it?
5. How will success be measured?
6. What PostHog event or downstream product signal should improve if this SEO work succeeds?

If those answers are fuzzy, the task is probably not ready.

---

## Source documents

Use these together:
- `docs/SEO_AUDIT_2026-03-16.md`
- `docs/SEO_SPRINT_3_MAP.md`
- `docs/SEO_CONTROL_ROOM.md`

Role split:
- **Audit** = what was wrong / what mattered
- **Sprint 3 Map** = current cluster ownership
- **Control Room** = operating system for next decisions
