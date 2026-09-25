# Completed Tasks

## 2026-04-23

### CLEANUP-01: Repo cleanup
- Removed from git: `.gemini-home/`, `.playwright-cli/`, `generate-large.js/mjs`, `test-output/`, `AGENTS.md`, `LLM_GUARD.md`, `MODEL.md`, `FAILURE_MODES.md`, `TESTING_RULES.md`, `QA_AUDIT_REPORT.md`, `MEMORY.md`, `docs/` (29 files), `skills/localpdf-seo/references/`
- Fixed `website/package.json` (IndexNow scripts had overwritten dev/build/preview scripts + Astro deps)
- Updated `.gitignore` with AI tool dirs, operational docs, IndexNow files
- Commit: pending

### ANALYSIS-01: PostHog analytics snapshot
- Pulled 30-day data: events, funnel, tools, upsell reasons, traffic sources, countries, errors
- Key finding: 70% drop-off before tool run, OCR is #1 upgrade trigger, checkout only from /pricing (0 from in-app)
- Saved to: `~/.claude/projects/-Users-aleksejs-Desktop-LocalPDF-V6/memory/analytics_snapshot.md`

### ANALYSIS-02: Product & sales audit
- Code audit: architecture, billing, security, paywall flow
- UX audit: empty state problem, toolbar issues, nav confusion
- Growth plan created with 9 tasks across 3 priority levels

## 2026-06-08

### TOC-01: Auto-TOC tool refactoring & bugs fix
- Refactored `TocTree.tsx` to use `id`-based callbacks instead of fragile array indices recursion, resolving index sync issues.
- Fixed blank Document Structure sidebar bug in PDF viewers by mapping PDF Outlines dictionaries (Type, Subtype, S, D, XYZ) to correct `PDFName` objects (instead of plain strings).
- Added `PDFHexString.fromText` to outline titles for robust UTF-16 Cyrillic/Baltic languages support in all PDF readers.
- Fixed 404 font load error in worker by utilizing `import.meta.env.BASE_URL` to dynamically construct font asset URLs.
- Removed unsupported/broken Noto Sans WOFF files, falling back to all-inclusive TrueType `Roboto` font to render Baltic and Cyrillic glyphs.
- Placed TOC button right under OCR inside the sidebar, added a custom styled red \"NEW\" badge, and added informative tooltip descriptions to all 12 tools in the rail.
- Added a \"Back to Edit\" option to the results card, wrapped the final screen layout into a clean center-aligned card, and fixed button contrast issues.
- Commit: `feat(auto-toc): refactor TOC UI, fix PDF outlines rendering, add search filter and tool descriptions`

### SEO-01: SEO Review and i18n Localization (JA & ZH)
- Performed a comprehensive SEO and technical audit of the marketing site (76 static HTML pages).
- Verified robots.txt configurations, sitemap priority/lastmod rules, and JSON-LD schema (FAQPage, SoftwareApplication, BlogPosting) to maximize rich snippets CTR.
- Fixed 10+ short Title warnings on pricing/terms/privacy pages.
- Created `website/src/pages/ja.astro` and `website/src/pages/zh.astro` translations with 100% layout and JS script parity to optimize for Google JP/ZH organic search traffic.
- Configured correct hreflangs alternates linking главных страниц (`/`, `/ja`, `/zh`) cross-references and HTML `lang` attributes.
- Implemented locale persistence using `localStorage`:
  1. Header language selectors store the chosen language preference.
  2. Root `/` page instantly auto-redirects to `/ja` or `/zh` if a preference exists.
  3. Visiting `/ja` or `/zh` directly sets the user preference key automatically.
- Removed outdated German/Japanese fallback redirects for `/ja` from `vercel.json` to allow correct path routing.
- Added `/ja` and `/zh` URLs into the `astro.config.mjs` sitemap configuration.
- Verified compilation and build merged layout success via `npm test`, `npm run audit:workerization:strict`, and `npm run build:all`.

## 2026-06-18

### STUDIO-01: Empty state CTA in Studio
- Extended `StudioShell.tsx` empty state with Upload button and top-3 tool CTAs (Compress, OCR, Merge).
- Tool CTAs navigate to wizard routes (`/compress-pdf`, `/ocr-pdf`, `/merge-pdf`); Upload reuses existing file input + U/⌘O shortcuts.
- Added telemetry event `STUDIO_EMPTY_STATE_CTA` in `contracts.ts`.
- Added styles in `styles.css` for `.studio-empty-state-actions`, upload and tool buttons.
- Preserved privacy copy and keyboard/drag hints.
- Synced agent docs: `CLAUDE.md` priorities, `.agent/tasks.md`, `.agent/done.md`, `.agent/architecture.md`, `.agent/context.md`.

### STUDIO-02: OCR paywall value preview with page thumbnails
- Enhanced `OcrPaywallOverlay` in `StudioConvertWorkspace.tsx` to show blurred page thumbnail previews alongside the text blur.
- Displays up to 6 page thumbnails in a horizontal scrollable row, each with page number label.
- Thumbnails are blurred (3px) with `userSelect: none` to prevent copying.
- Pages beyond 6 shown as "+N more" pill.
- Kept existing text blur preview (first 500 chars) and Upgrade CTA with checkout integration.
- Synced task status to `[x]` in `.agent/tasks.md` and `CLAUDE.md`.

## 2026-09-25

### P0-00: План зафиксирован в git
- `.agent/sales-plan-2026-09-25.md` + `geo-baseline-2026-08-01.md` + raw/summary JSON закоммичены (aa2c0c6) — план жил вне истории и был невидим следующей сессии.

### P0-01: Ложное обещание «25 pages» убрано
- Решение: page-лимит **не** включаем до гейтов A/B — включение добавило бы трение в окно замера активации (гейт B). Убираем обещание, а не добавляем стену.
- Сайт и AI-файлы: `pricing.astro` (schema description, FAQ-схема, список фич), `index.astro`, обе compare-страницы, `pdf-tools-without-upload.astro`, `website/public/llm.txt` + `.well-known/llm.txt`, `website/public/index-ai.md`.
- Код: вместо 9 захардкоженных строк — `freePageLimitMessage()` в `src/app/platform/plan-limits.ts`, который собирает текст из `BASIC_PLAN_LIMITS.maxPagesPerDocument` (сейчас `Infinity` → «This document exceeds the Free page limit»). 9 вызовов в 5 файлах Studio. При включении лимита в P3 текст станет «up to 25 pages» автоматически.
- Приёмка: `grep -r "25 pages" website/src src` пуст.

### P0-03: `download-moment-upsell` удалён
- Удалён `src/app/react/download-moment-upsell.tsx` (265 польз./30 дней, 0 покупок за всю жизнь, 78% всех пейвол-показов).
- Скачивание разгейчено в 5 точках: `studio-top-nav.tsx`, `wizard/stages/result-stage.tsx`, `AutoTocStudioPanel.tsx`, `StudioConvertWorkspace.tsx` (6 кнопок), v6 `WizardShell.tsx` (3 кнопки, добавлен локальный `downloadOutputs`).

### P0-04: `demoContext` заменён на реальный billing-контекст
- `ocr-pdf-test-page.tsx` больше не запускает OCR с `plan: 'pro'` — берёт `runtime.billing.getContext()`, поэтому free-пользователь упирается в реальный пейвол, а телеметрия перестаёт врать.

### P0-05: Мёртвый код удалён
- `monthlyQuota` + `usageThisMonthByTool`: убраны из `contracts.ts`, `unified-tool-runner.ts` (проверка + метод), `split-pdf/definition.ts`, фикстур двух тестов.
- Удалена вся папка `src/app/react/wizard/` (`wizard-shell.tsx` + 3 stage-файла): ноль импортов по всему репо, дубликат `v6/components/Wizard/`; вместе с ней ушёл мёртвый `DAILY_FREE_LIMIT` 3/день.

### P0-06: Гигиена репо
- `.gitignore`: `.cursor/`, `.cursorrules`, `.hermes/`, `.mimocode/`, `test/fixtures/pdfs/debug/`.
- Проверка: `npm test` (313 pass / 0 fail), `npm run build`, `npm run audit:workerization:strict`, `npm run billing:preflight` — зелёные (preflight даёт 1 warning про совпадение product id monthly/yearly — это один и тот же LS-продукт 917519, ложное срабатывание).

### Найдено при P0-2 (нужно решение фаундера)
- LS-вариант месячной подписки `1442622` всё ещё `published`: API LemonSqueezy не имеет метода обновления варианта → выключается только в дашборде. За 30 дней 4 из 10 `checkout_opened` — `variant=monthly`.
- Локальный `.env`: `LEMON_SQUEEZY_PRO_LIFETIME_PRODUCT_IDS=917519`, хотя lifetime-продукт — `1371816`. Атрибуция не ломается (вариант проверяется раньше продукта + fallback), но значение неверное — проверить в Vercel env.
