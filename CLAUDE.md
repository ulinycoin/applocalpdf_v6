# LocalPDF V6 — Agent Contract

This file is loaded automatically by Claude Code at session start.
Every agent, model, and assistant working in this repo must read this first.

---

## 1. What this product is

LocalPDF is a **local-first, privacy-first PDF workspace** built on a Konva canvas.
Files never leave the browser. All processing runs in Web Workers via WASM.
The unique technical differentiator: **canvas-based multi-document workspace** with
drag-and-drop pages between documents — no competitor has this.

**Two surfaces:**
- `website/` — Astro marketing site (SEO, landing pages, blog)
- `src/` — React SPA mounted at `/app` (the actual product)

**Stack:** React 18, Vite, Astro 6, Konva, pdf-lib, tesseract.js, Zustand,
LemonSqueezy (billing), PostHog (analytics), Vercel (deploy)

---

## 2. Agent roles

There are four agent roles. Each session should declare its role at start.

### COORDINATOR
- Reads the growth plan and memory
- Breaks work into tasks, assigns to specialist roles
- Reviews and verifies output before marking done
- Never writes product code directly
- Files: `CLAUDE.md`, `memory/`

### ENGINEER
- Writes and edits product code (`src/`, `api/`, `shared/`)
- Follows architecture rules (see §4)
- Reports back with file paths and line numbers changed
- Does not touch `website/` unless it's a shared component

### CONTENT
- Works on `website/src/content/blog/`, `website/src/pages/`
- Uses `skills/localpdf-seo/` as reference
- Does not touch `src/` application code

### ANALYST
- Queries PostHog API (project 110788, EU region)
- Reads analytics, produces structured reports
- PostHog read key stored in memory — ask COORDINATOR
- Does not write code

---

## 3. Memory system

All persistent context lives in two places:

### Project memory (this session's Claude instance)
```
~/.claude/projects/-Users-aleksejs-Desktop-LocalPDF-V6/memory/
  project_growth_plan.md   — growth plan with task checklist
  product_context.md       — product facts, ICP, positioning
  analytics_snapshot.md    — PostHog data snapshot
  architecture.md          — code architecture reference
```

### In-repo reference (for agents without global memory access)
```
.agent/
  context.md               — quick product brief (read first)
  architecture.md          — code structure and rules
  tasks.md                 — current active tasks
  done.md                  — completed tasks log
```

Always check `.agent/tasks.md` for current work before starting anything.
Always update `.agent/tasks.md` when starting or finishing a task.

---

## 4. Architecture rules (ENGINEER must follow)

- **Plugin isolation:** tool logic goes in `src/plugins/<name>/logic/index.ts` only
- **No logic in UI:** `src/plugins/<name>/ui/index.tsx` is view-only
- **Worker-first:** heavy processing via `WorkerOrchestrator`, never on main thread
- **VFS only:** all file I/O through `runtime.vfs`, never raw File/Blob APIs
- **Telemetry:** use `runtime.telemetry.track()` for all user actions
- **Billing:** access via `runtime.billing.getContext()`, never hardcode plan checks
- **No direct DOM:** use React state and Konva canvas, not `document.querySelector`
- **Types:** all contracts in `src/core/types/contracts.ts`, do not duplicate

---

## 5. Current priorities (from growth plan)

In order. Do not skip levels.

**Level 1 — Active:**
1. [ ] Empty state in Studio (`src/v6/components/Studio/StudioShell.tsx`)
2. [ ] Upsell → direct checkout (`src/app/react/ux-feedback-overlay.tsx`)
3. [ ] OCR paywall with value preview

**Level 2 — Next:**
4. [ ] Japanese landing page (`website/src/pages/ja/`)
5. [ ] SEO articles for OCR queries
6. [ ] Show HN post

**Level 3 — Later:**
7. [ ] LemonSqueezy webhook → PostHog
8. [ ] Email capture
9. [ ] OCR trial (3 pages/month free)

Full plan: `~/.claude/projects/-Users-aleksejs-Desktop-LocalPDF-V6/memory/project_growth_plan.md`

---

## 6. Key metrics (PostHog snapshot, April 2026)

- 4 900 pageviews/month
- 58 tool runs/month (only 58 out of ~200 /app visitors)
- 33 successful runs (57% success rate)
- 25 upsell shown, 7 checkout opened, ~0 from in-app upsell
- Top tools: compress-pdf (77), ocr-pdf (52), pdf-to-jpg (24)
- Top countries: Japan (1553), USA (624), China (417), India (356)
- Top traffic: Direct, Google, gigazine.net (304)

---

## 7. What NOT to do

- Do not commit `dist/`, `website/dist/`, `.DS_Store`, `node_modules/`
- Do not commit AI operational files (AGENTS.md, MODEL.md, LLM_GUARD.md, MEMORY.md)
- Do not commit `docs/`, `skills/` reference files, `.gemini-home/`, `.playwright-cli/`
- Do not put secrets in code — use env vars
- Do not use `window.prompt()` for user input — use React UI
- Do not add features beyond the current task scope
- Do not write comments explaining what code does — only why (non-obvious)

---

## 8. Verification checklist (COORDINATOR runs after each task)

Before marking any task done:
- [ ] `npm test` passes
- [ ] `npm run build` passes
- [ ] `npm run audit:workerization:strict` passes
- [ ] No new `.DS_Store` or build artifacts staged
- [ ] `.agent/tasks.md` updated
