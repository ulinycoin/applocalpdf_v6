# LocalPDF V6 — Quick Context Brief

Read this before doing any work in this repo.

## Product

Canvas-based local-first PDF workspace. Files never leave the browser.
Unique: Konva canvas multi-document workspace with drag-and-drop pages.
No competitor has this. It's the main technical differentiator.

## Business model

Freemium via LemonSqueezy.
- Free: merge, split, compress (up to 25 pages, 3 workspaces)
- Pro ($3.99/mo): OCR, edit, convert, protect/unlock (unlimited)

Main upgrade trigger: OCR (31 upsell hits/month out of 63 total).

## Users

~200 unique visitors/month to /app. Japan is #1 country (1553 pageviews).
Desktop 88%. Traffic: Direct + Google + gigazine.net (Japanese tech blog).

## Repo layout

```
src/          React SPA — the product (/app)
website/      Astro — marketing site (/)
api/          Vercel serverless functions (billing)
shared/       Cross-surface constants
scripts/      Dev/build utilities
e2e/          Playwright tests
test/         Unit test fixtures
.agent/       Agent coordination files (this dir)
```

## Active tasks

See `.agent/tasks.md`

## Full memory

See `~/.claude/projects/-Users-aleksejs-Desktop-LocalPDF-V6/memory/`
