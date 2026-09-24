# Active Tasks

Last updated: 2026-09-24

## Hot
- [x] Offer model: месячная подписка $3.99 выведена из оффера, вместо неё годовая $39.99. `checkout-offers.ts` → `PRO_YEARLY_PRICE_USD` + `getYearlyCheckoutUrl()` (fallback `fe9368a5…?enabled=1442621`), `resolvePrimaryOffer` теперь lifetime→yearly, `getMonthlyCheckoutUrl` удалён. Обновлены `/pricing` (кнопка, Offer-схема, FAQ), terms, refund-policy, faq, ja, zh, обе compare-страницы, pdf-tools-without-upload, llms.txt, localpdf-ai.md, index-ai.md, CLAUDE.md, context.md, `.env.example`, `billing-preflight.mjs`
- [ ] **LemonSqueezy: месячный вариант 1442622 всё ещё `published` и продаётся.** Отключается только в дашборде (в API LS нет метода обновления варианта). Пока он живой, старые ссылки `df6ab354…` продолжают работать
- [x] Security: `/api/download-proxy` был открытым релеем (любой URL, CORS `*`, без авторизации) — теперь allowlist только `tmpfiles.org`, 403 на остальное, + `api/download-proxy.test.ts`
- [x] Monetization: webhook не маппил `pro_lifetime` → `purchase_completed` не летел для $19-оффера. Добавлены lifetime product/variant (env + fallback 1371816/2143549), тест на атрибуцию
- [x] Billing: `restore.ts` отдавал Pro-JWT без `pdf.redact.verify` → покупатель по license key упирался в paywall за оплаченную фичу. Entitlement добавлен, `refresh.ts` импортирует список из `restore.ts`, + parity-тест `src/app/platform/entitlement-parity.test.ts`
- [x] Tests: `npm test` теперь включает `api/**/*.test.ts` (billing и proxy тесты раньше не запускались вообще)
- [ ] Pricing claim: на /pricing и в FAQ-схеме заявлено «25 страниц/документ» для Free, но `plan-limits.ts` ставит `maxPagesPerDocument: Infinity`. Либо включить лимит, либо убрать цифру
- [ ] Share: ciphertext уходит на `tmpfiles.org` (файл живёт ~1 час), а главная заявляет «0 bytes uploaded / files never leave your device». Уточнить формулировку + подумать про свой storage
- [~] One-time Pro Lifetime offer ($19) — code shipped (3841fe7): trial CTAs removed, in-app CTAs use `getPrimaryPaidOffer()`, `pro_lifetime` tier + 10-year JWT, /pricing rewritten (monthly retired, yearly is the subscription anchor)
- [x] One-time Pro Lifetime offer ($19) — LIVE wiring done: LS product 1371816 / variant 2143549, checkout `.../buy/e42c57ec-d7a3-4bd9-9595-3f38f6f2a8f5`; code fallbacks mean no Vercel env change is required (commits 3841fe7 + a258156)
- [ ] Deploy + first real purchase check: verify the licence key from a $19 order restores Pro (tier `pro_lifetime`)
- [ ] Watch 14d after launch: `checkout_opened` by `variant=lifetime` vs purchases. ≥8 opens + 0 purchases → offer wrong; <5 opens → intent volume is the wall; ≥2 purchases → model validated
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
