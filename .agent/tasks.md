# Active Tasks

Last updated: 2026-06-19

## Status legend
- `[ ]` — not started
- `[~]` — in progress
- `[x]` — done
- `[!]` — blocked

---

## Level 1 — Growth (active)

| # | Task | Status | Notes |
|---|------|--------|-------|
| 1 | Empty state CTA in Studio | [x] | Upload + Compress/OCR/Merge CTAs, telemetry `STUDIO_EMPTY_STATE_CTA` |
| 2 | Upsell → direct checkout | [x] | `ux-feedback-overlay.tsx` opens LemonSqueezy checkout |
| 3 | OCR paywall value preview | [x] | Text blur + page thumbnails blurred, Upgrade CTA |

## Level 1.5 — Bug fix (active)

| # | Task | Status | Notes |
|---|------|--------|-------|
| 4 | Fix protect-pdf encrypted error | [ ] | 4/5 падают: `Input document to PDFDocument.load is encrypted`. Пользователь ставит пароль на уже зашифрованный PDF. Ловить и давать нормальное сообщение. |
| 5 | OCR trial (3 pages per run) | [x] | 3 стр. OCR бесплатно за запуск. Paywall после 3 стр. Убран дневной лимит для OCR. |

## Level 2 — Next

| # | Task | Status | Notes |
|---|------|--------|-------|
| 6 | Japanese landing page | [x] | `website/src/pages/ja.astro` + hreflang |
| 7 | SEO articles for OCR queries | [ ] | Not started |
| 8 | Show HN post | [ ] | Not started |

## Level 3 — Later

| # | Task | Status |
|---|------|--------|
| 9 | LemonSqueezy webhook → PostHog | [ ] |
| 10 | Email capture | [ ] |
