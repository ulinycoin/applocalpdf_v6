# LocalPDF V6 — Quick Context Brief

Read this before doing any work in this repo.

## Product

Canvas-based local-first PDF workspace. Files never leave the browser.
Unique: Konva canvas multi-document workspace with drag-and-drop pages.
No competitor has this. It's the main technical differentiator.

## Business model

Freemium via LemonSqueezy. **Обработка бесплатна на всех инструментах; лимит — на выходе файлов (2026-10-04).**
- Free: **все** инструменты, 3 скачивания в сутки, 3 workspace в канвасе
- Pro ($19 один раз, или $39.99/yr): без лимита на скачивания и workspace, большие файлы
- Исключения-превью (осознанно): OCR на free обрабатывает первые 3 страницы, extract-images показывает только первую картинку

Main upgrade trigger: OCR (исторически; текущее узкое место — клик по CTA пейвола, 0.86%).

## Users

~200 unique visitors/month to /app. Japan is #1 country (1553 pageviews).
Desktop 88%. Traffic: Direct + Google + gigazine.net (Japanese tech blog).

## Repo layout

```
src/          React SPA — the product (/app)
  app/        Platform bootstrap, routing, React shell
  core/       VFS, workers, telemetry, contracts, runner
  plugins/    Tool plugins (definition + logic + ui)
  services/   PDF/OCR engines
  v6/         Studio (Konva) + Wizard UI
website/      Astro — marketing site (/)
api/          Vercel serverless functions (billing)
shared/       Cross-surface constants
scripts/      Dev/build utilities
e2e/          Playwright tests
test/         Unit test fixtures
.agent/       Agent coordination files (this dir)
```

See `.agent/architecture.md` for detailed structure.

## Current status (2026-10-04)

Level 1: All done (empty state, upsell, OCR paywall, OCR trial)
Level 2: All done (JA landing, ZH landing, Auto-TOC)
Model 2026-10-04: все инструменты бесплатны, платит тот, кто выносит файлы (лимит скачиваний)

## Active tasks

See `.agent/tasks.md`

## Full memory

See `~/.claude/projects/-Users-aleksejs-Desktop-LocalPDF-V6/memory/`
