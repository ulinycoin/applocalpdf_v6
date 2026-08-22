# Active Tasks

Last updated: 2026-08-06

## Hot
- [x] AI crawler markdown fork `/localpdf` (c1dedf6) — middleware + localpdf-ai.md; cache private/no-store + Vary UA; Googlebot/Bingbot → HTML
- [x] Push c1dedf6 → origin/main (18808e4..c1dedf6); Vercel Ready `localpdf-v6-kgaomcf5i`
- [x] Live curl matrix OK — Chrome/Googlebot HTML 24801; ClaudeBot/OAI/Perplexity markdown 4782 + private/no-store + Vary UA + noindex
- [ ] LLM probe retest web-enabled 1–2d after deploy (Q1/Q3/TECH; parametric не ждать)
- [x] Disambiguation page `/localpdf` live (16b10c1) — name+domain, parked .tech/.com, FAQ for LLM probe
- [x] GEO baseline AI answers — `.agent/geo-baseline-2026-08-01.md` (2026-08-01)
- [x] LLM brand probe baseline — 7 models × 4 questions (OpenRouter) → `/tmp/llm_probe_baseline.json`, Desktop report
- [x] Disambiguation page `/localpdf` — official product + twin domains table + FAQ + schema (2026-08-01)
- [x] Inline text edit regression — opaque whiteout for PDF spans; click opens editor, drag still moves overlay
- [ ] OCR UX: time estimates + chunked processing — 3/5 errors = таймауты (WORKER_TIMEOUT / PAGE_COUNT_CHECK_TIMEOUT). Успешные OCR до 147s. Пользователи не дожидаются.

## Status legend
- `[ ]` — not started
- `[~]` — in progress
- `[x]` — done
- `[!]` — blocked

---

## Level 1 — Growth (all done)

| # | Task | Status | Notes |
|---|------|--------|-------|
| 1 | Empty state CTA in Studio | [x] | Upload + Compress/OCR/Merge CTAs, telemetry `STUDIO_EMPTY_STATE_CTA` |
| 2 | Upsell → direct checkout | [x] | `ux-feedback-overlay.tsx` opens LemonSqueezy checkout |
| 3 | OCR paywall value preview | [x] | Text blur + page thumbnails blurred, Upgrade CTA |
| 4 | OCR trial (3 pages per run) | [x] | 3 стр. OCR бесплатно за запуск. Paywall после 3 стр. |

## Level 2 — Expansion (all done)

| # | Task | Status | Notes |
|---|------|--------|-------|
| 5 | Japanese landing page | [x] | `website/src/pages/ja.astro` + hreflang |
| 6 | Chinese landing page | [x] | `website/src/pages/zh.astro` + hreflang |
| 7 | Auto-TOC refactoring | [x] | PDF outlines rendering, search filter, tool descriptions |

---

## Future candidates (not started)

| # | Task | Priority | Notes |
|---|------|----------|-------|
| 8 | SEO articles for OCR queries | Medium | Content marketing for organic traffic |
| 8a | Noindex dead blog wave 2 | [x] | ocr-extract, how-to-merge, convert-word + /blog hub; sitemap + internal links → features |
| 8b | Fix audit orphans + Offer validFrom | [x] | 2026-07-24: hub links /features /compare /auto-toc /three-way; trim long metas; pricing Offer.validFrom; drop fake AggregateRating |
| 8c | Link 4 orphan blog posts | [x] | superseded by 8d — blog noindex wave 3 |
| 8d | Noindex all blog cannibals | [x] | 2026-07-24: all 22 blog posts noindex+sitemap drop; internal links → features |
| 9 | Show HN post | Low | Product Hunt / Hacker News launch |
| 10 | LemonSqueezy webhook → PostHog | Medium | Revenue attribution in analytics |
| 11 | Email capture | Low | Lead nurture for free users |
| 12 | Fix protect-pdf encrypted error | Medium | 4/5 fail: `Input document to PDFDocument.load is encrypted` |
| 13 | PDF Info tool | [x] | Local PDF inspector: pages, version, encryption, fonts, XMP self-declared claim |
| 14 | PDF/A Converter (Pro) | [ ] | Ghostscript → PDF/A-1b → VeraPDF validate → download. Server opt-in |
| 15 | Verified Redact + Certificate (engine) | [x] | Worker verify after text edits; `redact-verify/` 4 checks + cert v1; entitlement `pdf.redact.verify`; telemetry types. Non-blocking on fail. |
| 15a | Redact verify UI + block download | [x] | Download modal 4/4 + fail blocks export/share; Pro cert JSON; Free paywall `REDACT_CERT_*`; store `lastRedactVerify` on doc |
| 15b | SEO /features/verify-pdf-redaction | [ ] | After 15a ships and we see verify runs in PostHog |
