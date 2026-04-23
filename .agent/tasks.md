# Active Tasks

Last updated: 2026-04-23

## Status legend
- `[ ]` — not started
- `[~]` — in progress (add agent name + date)
- `[x]` — done (add date + commit)
- `[!]` — blocked (add reason)

---

## Level 1 — Current sprint

### TASK-01: Empty state in Studio
- **Status:** `[x]` 2026-04-23
- **Role:** ENGINEER
- **File:** `src/v6/components/Studio/StudioShell.tsx`
- **Goal:** When no documents loaded, show drag-and-drop zone instead of empty dark canvas
- **Acceptance:** User sees upload prompt on first open, drag highlight works, disappears after file loaded
- **Verify:** `npm test && npm run build`

### TASK-02: Upsell → direct checkout
- **Status:** `[ ]`
- **Role:** ENGINEER
- **File:** `src/app/react/ux-feedback-overlay.tsx`
- **Goal:** "View plans" button in upsell overlay opens LemonSqueezy checkout directly (not /pricing)
- **Acceptance:** Click → LemonSqueezy checkout opens in new tab. PostHog `checkout_opened` fires with `source: upsell_overlay`
- **Env var:** `VITE_LS_CHECKOUT_URL_PRO_MONTHLY`
- **Verify:** `npm test && npm run build`

### TASK-03: OCR paywall with value preview
- **Status:** `[ ]`
- **Role:** ENGINEER
- **Files:** `src/app/react/ux-feedback-overlay.tsx`, `src/plugins/ocr-pdf/`
- **Goal:** When OCR is blocked, show what OCR would produce before showing price
- **Acceptance:** Paywall shows page count + concrete message "OCR will extract text from X pages. Unlock for $3.99/mo"
- **Verify:** `npm test && npm run build`

---

## Level 2 — Next sprint

### TASK-04: Japanese landing page
- **Status:** `[ ]`
- **Role:** CONTENT
- **File:** `website/src/pages/ja/index.astro` (new)
- **Goal:** Japanese-language entry page targeting privacy-first PDF users
- **Acceptance:** Page renders at /ja, basic Japanese copy, SEO meta in Japanese

### TASK-05: SEO articles for OCR queries
- **Status:** `[ ]`
- **Role:** CONTENT
- **Targets:** "ocr pdf without uploading", "extract text scanned pdf browser", "ocr pdf privacy"
- **Files:** `website/src/content/blog/` (new articles)

### TASK-06: Show HN post
- **Status:** `[ ]`
- **Role:** COORDINATOR
- **Goal:** Draft and publish "Show HN: PDF editor that runs entirely in your browser"
- **Angle:** Konva canvas, Web Workers, WASM, no uploads — technical audience

---

## UI Redesign — Light Theme Migration

Full plan: `.agent/redesign-plan.md`

### REDESIGN-01: CSS tokens
- **Status:** `[x]` 2026-04-23
- **Role:** ENGINEER
- **Files:** `src/styles.css`, `src/v6/components/Studio/StudioShell.tsx`
- **Goal:** (a) Replace `:root` tokens with light values. (b) Remove dark radial gradients from `body`. (c) Replace Konva canvas `Rect` dark gradient with `#f0efed`. (d) Rename old token references: `--text-main`→`--text`, `--stroke`→`--border`, `--accent-soft`→`--accent-hover`, `--ok`→`--green`.
- **Note:** After this step some components will look broken (hardcoded dark rgba still present). Expected — fixed in Steps 2–6.

### REDESIGN-02: Top Nav
- **Status:** `[x]` 2026-04-23
- **Role:** ENGINEER
- **Files:** `src/app/react/studio-top-nav.tsx`, new `StudioDownloadModal.tsx`
- **Goal:** Doc tabs, remove clutter, inline download modal (no window.prompt)
- **Depends on:** REDESIGN-01

### REDESIGN-03: Tool Rail
- **Status:** `[x]` 2026-04-23
- **Role:** ENGINEER
- **Files:** new `src/v6/components/Studio/StudioToolRail.tsx`, `StudioShell.tsx`
- **Goal:** Left vertical rail with icon + label, 220px wide
- **Depends on:** REDESIGN-01

### REDESIGN-04: Bottom Bar
- **Status:** `[x]` 2026-04-23
- **Role:** ENGINEER
- **Files:** `src/v6/components/Studio/StudioShell.tsx`, `src/styles.css`
- **Goal:** Slim 40px bar, zoom/grid/copy/history only
- **Depends on:** REDESIGN-03

### REDESIGN-05: Empty State
- **Status:** `[x]` 2026-04-23
- **Role:** ENGINEER
- **Files:** `src/v6/components/Studio/StudioShell.tsx`
- **Goal:** Light empty state matching mockup, verify after token change
- **Depends on:** REDESIGN-01

### REDESIGN-06: Tool Page Wizard
- **Status:** `[x]` 2026-04-23
- **Role:** ENGINEER
- **Files:** `src/app/react/wizard/`, `src/styles.css`
- **Goal:** Remove Upload stage, cards layout, light progress bar, result with "Also try"
- **Depends on:** REDESIGN-01

### REDESIGN-07: Canvas Doc Cards
- **Status:** `[x]` 2026-04-23
- **Role:** ENGINEER
- **Files:** `src/v6/components/Studio/StudioDocument.tsx`, `PageObject.tsx`
- **Goal:** White cards, light borders, correct dot colors
- **Depends on:** REDESIGN-01

### REDESIGN-08: Dead CSS removal
- **Status:** `[x]` 2026-04-23
- **Role:** ENGINEER
- **Files:** `src/styles.css`
- **Goal:** Delete all unused dark-theme classes and hardcoded rgba values. Confirm with grep before deleting each class.
- **Candidates:** `.app-layout`, `.sidebar*`, `.main-shell`, `.glass-card`, `.drop-zone*`, `.stage-title`, `.stage-description`, `.studio-viewport-rail*`, all remaining `rgba(28,` `rgba(20,` `rgba(10,`
- **Depends on:** REDESIGN-02 through REDESIGN-07 all complete

---

## Level 3 — Backlog

### TASK-07: LemonSqueezy webhook → PostHog
- **Status:** `[ ]`
- **Role:** ENGINEER
- **File:** `api/billing/webhook.ts` (new)

### TASK-08: Email capture
- **Status:** `[ ]`
- **Role:** ENGINEER

### TASK-09: OCR trial (3 pages/month free)
- **Status:** `[ ]`
- **Role:** ENGINEER
- **Files:** `src/plugins/ocr-pdf/definition.ts`, `src/app/platform/billing-contract.ts`
