# LocalPDF V6 — Agent Contract

Every agent working in this repo must read this first.

---

## 1. What this product is

LocalPDF is a **local-first, privacy-first PDF workspace** built on a Konva canvas.
Files never leave the browser. All processing runs in Web Workers via WASM.
Unique differentiator: **canvas-based multi-document workspace** with
drag-and-drop pages between documents — no competitor has this.

**Two surfaces:**
- `website/` — Astro marketing site (SEO, landing pages, blog)
- `src/` — React SPA mounted at `/app` (the actual product)

**Stack:** React 18, Vite, Astro 6, Konva, pdf-lib, tesseract.js, Zustand,
LemonSqueezy (billing), PostHog (analytics), Vercel (deploy)

**Business model:** Freemium via LemonSqueezy.
- Free: merge, split, compress (up to 25 pages, 3 workspaces)
- Pro ($3.99/mo): OCR, edit, convert, protect/unlock (unlimited)

---

## 2. Founder profile

Фаундер-инженер. Код — основной инструмент создания ценности.

**Рабочая станция:** MacBook Air M1, macOS.

**Принципы:**
- Скорость > идеальность. Деплой без multi-pass аудита — норма.
- Технический долг терпим, пока не блокирует деньги.
- Тесты только для денежного кода (paywall, плагины, Workers).
- Никаких Docker, Kubernetes, микросервисов, Redis для этого масштаба.
- Не переписывать работающий код.

**Финансовые риски:** нулевая толерантность без подтверждения.
**Репутационные риски:** низкая толерантность. Никаких фейков, спама, deceptive SEO.

---

## 3. Communication rules

- **Русский язык** по умолчанию.
- **Одна рекомендация.** Не предлагай список равных вариантов. Один лучший путь.
- **Data-first.** Любое утверждение подкрепляй цифрами.
- **Честность без смягчений.** Если проект мертв — говори прямо.
- **Краткость.** Никакого бойлерплейта.

**Триггеры:**
- **"делай"** — выполни немедленно. Не переспрашивай.
- **"проверь"** — найди скрытую проблему. Ищи шире.
- **"сохрани"** — зафиксируй состояние, обнови память.

---

## 4. Agent roles

### COORDINATOR
- Читает план роста и память
- Разбивает работу на задачи, назначает специалистов
- Проверяет результат перед пометкой "done"
- Не пишет продуктовый код
- Файлы: `CLAUDE.md`, `.agent/`

### ENGINEER
- Пишет и редактирует код (`src/`, `api/`, `shared/`)
- Следует правилам архитектуры (§5)
- Не трогает `website/` кроме shared-компонентов

### CONTENT
- Работает с `website/src/content/blog/`, `website/src/pages/`
- Не трогает `src/`

### ANALYST
- Запрашивает PostHog API (проект 110788, EU регион)
- Читает аналитику, формирует отчёты
- Не пишет код

---

## 5. Architecture rules (ENGINEER)

- **Plugin isolation:** логика в `src/plugins/<name>/logic/index.ts`
- **No logic in UI:** `src/plugins/<name>/ui/index.tsx` — view-only
- **Worker-first:** тяжёлая обработка через `WorkerOrchestrator`, never on main thread
- **VFS only:** весь файловый I/O через `runtime.vfs`, never raw File/Blob APIs
- **Telemetry:** `runtime.telemetry.track()` для всех пользовательских действий
- **Billing:** `runtime.billing.getContext()`, never hardcode plan checks
- **No direct DOM:** React state + Konva canvas, not `document.querySelector`
- **Types:** контракты в `src/core/types/contracts.ts`, do not duplicate

---

## 6. Repo layout

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
.agent/       Agent coordination files
```

---

## 7. Memory system

### Project memory
```
~/.claude/projects/-Users-aleksejs-Desktop-LocalPDF-V6/memory/
  project_growth_plan.md   — growth plan with task checklist
  product_context.md       — product facts, ICP, positioning
  analytics_snapshot.md    — PostHog data snapshot
  architecture.md          — code architecture reference
```

### In-repo reference
```
.agent/
  context.md               — quick product brief
  architecture.md          — code structure and rules
  tasks.md                 — current active tasks
  done.md                  — completed tasks log
  design-system.md         — design tokens and patterns
```

Always check `.agent/tasks.md` before starting work. Update it when starting or finishing a task.

---

## 8. Completed work

### Level 1 — Growth (all done)
1. [x] Empty state CTA in Studio — `StudioShell.tsx`, telemetry `STUDIO_EMPTY_STATE_CTA`
2. [x] Upsell → direct checkout — `ux-feedback-overlay.tsx` opens LemonSqueezy checkout
3. [x] OCR paywall value preview — blurred text + page thumbnails in `StudioConvertWorkspace`
4. [x] OCR trial (3 pages per run) — free tier, paywall after 3 pages

### Level 2 — Expansion (done)
5. [x] Japanese landing page — `website/src/pages/ja.astro` + hreflang
6. [x] Chinese landing page — `website/src/pages/zh.astro` + hreflang
7. [x] Auto-TOC refactoring — PDF outlines rendering, search filter, tool descriptions

---

## 9. What NOT to do

- Do not commit `dist/`, `website/dist/`, `.DS_Store`, `node_modules/`
- Do not commit AI operational files (AGENTS.md, MODEL.md, LLM_GUARD.md, MEMORY.md)
- Do not commit `docs/`, `skills/` reference files, `.gemini-home/`, `.playwright-cli/`
- Do not put secrets in code — use env vars
- Do not use `window.prompt()` for user input — use React UI
- Do not add features beyond the current task scope
- Do not write comments explaining what code does — only why (non-obvious)

---

## 10. Verification checklist

Before marking any task done:
- [ ] `npm test` passes
- [ ] `npm run build` passes
- [ ] `npm run audit:workerization:strict` passes
- [ ] No new `.DS_Store` or build artifacts staged
- [ ] `.agent/tasks.md` updated
