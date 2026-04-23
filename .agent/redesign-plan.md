# UI Redesign — Migration Plan

**Direction:** Notion-inspired light theme  
**Approach:** Incremental — replace existing components one by one, never rewrite all at once  
**Design reference:** `mockup.html` (Studio), `mockup-tool.html` (Tool page)  
**Design system:** `.agent/design-system.md`

---

## Principles

- Each step is independently shippable and reversible
- No logic changes — only UI/CSS
- Run `npm run build` after every step
- Canvas (Konva) logic is never touched

---

## CSS audit findings

`src/styles.css` is 5 492 lines. Three categories of old code to handle:

**A. Tokens in `:root`** — 26 usages of old names (`--bg-1`, `--surface`, `--stroke`, `--text-main`, `--accent-soft`, etc.)  
→ Fixed in Step 1 by replacing `:root` values and renaming tokens.

**B. Hardcoded dark colours** — 51 places with inline `rgba(28, 52, ...)`, `backdrop-filter: blur()`, `radial-gradient` dark fills, `glass-card` styles.  
→ These do NOT change with token swap. Must be found and rewritten per component in Steps 2–6.  
→ Quick search: `grep -n "rgba(28\|rgba(20\|rgba(10\|backdrop-filter\|glass-card" src/styles.css`

**C. Dead classes** — `.app-layout`, `.sidebar`, `.sidebar-collapsed`, `.main-shell`, `.glass-card`, `.drop-zone` (old wizard).  
→ These are leftover from the old sidebar layout no longer used in Studio.  
→ Delete in Step 8 after all components are migrated. Do not delete earlier — confirm with grep first.

---

## Step 1 — CSS tokens  `src/styles.css`

**1a. Replace `:root` block** with new light tokens:

```css
:root {
  --font-display: 'Inter', -apple-system, sans-serif;
  --font-mono:    'JetBrains Mono', monospace;

  --bg:            #ffffff;
  --bg-1:          #f7f7f5;
  --bg-2:          #f1f1ef;
  --surface:       #ffffff;
  --surface-hover: #f7f7f5;
  --border:        #e9e9e7;
  --border-strong: #d3d3cf;

  --text:          #1a1a18;
  --text-muted:    #6b6b68;
  --text-dim:      #b3b3af;

  --accent:        #2383e2;
  --accent-hover:  #1a6fc4;
  --accent-dim:    rgba(35,131,226,0.1);

  --green:         #0f7b6c;
  --green-bg:      rgba(15,123,108,0.08);
  --red:           #e03e3e;
  --warn:          #dfab01;

  --radius-sm:     4px;
  --radius-md:     6px;
  --radius-lg:     8px;
  --radius-xl:     10px;

  --shadow-sm:     0 1px 3px rgba(0,0,0,0.08);
  --shadow:        0 4px 16px rgba(0,0,0,0.10);
}
```

**1b. Update `body` background** — remove dark radial gradients:
```css
body {
  background: var(--bg);
  color: var(--text);
}
```

**1c. Update Konva canvas background** in `StudioShell.tsx` — Konva `Rect` fill:
```tsx
// Replace dark gradient color stops with:
fill="#f0efed"
// (remove fillLinearGradientStartPoint / EndPoint / ColorStops entirely)
```

**1d. Rename old token references** in CSS — find and replace:
- `var(--text-main)` → `var(--text)`
- `var(--accent-soft)` → `var(--accent-hover)`
- `var(--stroke)` → `var(--border)`
- `var(--ok)` → `var(--green)`
- `var(--surface-strong)` → `var(--surface)`

**Files:** `src/styles.css`, `src/v6/components/Studio/StudioShell.tsx`  
**Risk:** Low — visual only  
**Verify:** `npm run build`, open app, check for white-on-white text issues  
**Note:** After this step many components will look broken (dark rgba still hardcoded). That's expected — fixed in Steps 2–6.

---

## Step 2 — Top Nav  `src/app/react/studio-top-nav.tsx`

Replace current nav with redesigned version from mockup.

**Remove from nav:**
- Website button
- Pricing button
- New Space button → move to bottom of Tool Rail (Step 3)
- Delete Space button → move to doc tab context menu

**Add to nav:**
- Document tabs (one per open doc, unsaved dot `--warn`, saved dot `--border-strong`)
- Tab close button (triggers delete with confirm)

**Keep:**
- Download button → replace `window.prompt()` with new `StudioDownloadModal`
- Pro badge / Upgrade button

**New component:** `src/app/react/StudioDownloadModal.tsx`  
- Input for filename, Cancel + Download buttons  
- Replaces `window.prompt()` call in `handleDownload()`

**CSS to rewrite in this step:**  
- `.studio-top-nav` — remove `backdrop-filter`, set `background: var(--bg)`, `border-bottom: 1px solid var(--border)`
- `.studio-tab-btn` — replace with tab styles from design system
- `.studio-logo` — keep structure, update colours
- `.studio-badge-pro` — keep, update gradient if needed

**Files:** `src/app/react/studio-top-nav.tsx`, new `src/app/react/StudioDownloadModal.tsx`, `src/styles.css`  
**Risk:** Medium  
**Verify:** Tabs render, download modal opens, no window.prompt

---

## Step 3 — Tool Rail  `src/v6/components/Studio/StudioShell.tsx`

Extract tool buttons from floating bottom bar into a new left vertical rail.

**New component:** `src/v6/components/Studio/StudioToolRail.tsx`  
- Upload button at top (triggers existing `openUploadDialog`)
- Edit tools section: Text, Annotate, Sign, Whiteout, Watermark, Forms, Protect
- Convert tools section: OCR, PDF to JPG, Compress, Extract Images
- Divider
- History toggle at bottom
- New Space button at bottom (moved from nav)
- Each item: icon 20×20 + label, hover/active states

**CSS to rewrite in this step:**  
- `.studio-viewport-rail` and `.studio-viewport-rail-*` — remove entirely, replaced by rail component
- New `.studio-tool-rail` classes matching design system
- Remove `glass-card` usage from any rail-adjacent styles

**Update `StudioShell.tsx`:**  
- Remove inline edit/convert tool button rendering
- Import and place `<StudioToolRail />` 
- Pass `onToolClick`, `onUpload`, `hasFiles` props

**Files:** new `StudioToolRail.tsx`, `StudioShell.tsx`, `src/styles.css`  
**Risk:** Medium — extract only, zero logic change  
**Verify:** All tools still clickable, overlays still open

---

## Step 4 — Bottom Bar  `src/v6/components/Studio/StudioShell.tsx`

Simplify the existing `.studio-viewport-toolbar` — tools are now in the rail.

**Keep:**
- Zoom −, %, +, Fit
- Grid toggle (3col / 5col)
- Copy, Paste (disabled when no selection)
- Selection count indicator
- History toggle

**Remove:**
- Edit tool buttons (now in rail)
- Convert tool buttons (now in rail)
- Group labels ("Selection", "View")

**CSS:**  
- `.studio-viewport-controls` → height 40px, `background: var(--bg)`, `border-top: 1px solid var(--border)`
- Remove `backdrop-filter`, `rgba` dark fills from toolbar classes
- Remove `.studio-viewport-rail*` classes (emptied in Step 3)

**Files:** `StudioShell.tsx`, `src/styles.css`  
**Risk:** Low  
**Verify:** Zoom works, grid toggle works, copy/paste works

---

## Step 5 — Empty State  `src/v6/components/Studio/StudioShell.tsx`

Verify and update empty state to match light theme (TASK-01 partially done).

**Check:**
- Icon: dashed border box, muted text, no dark backgrounds
- Text: "Drop a PDF to get started"
- Privacy line: "Files never leave your device"
- Keyboard hints: `U`, `⌘O`, `drag & drop`

**CSS:** any remaining dark fills in `.studio-empty-state` or equivalent → replace with light values

**Files:** `StudioShell.tsx`, `src/styles.css`  
**Risk:** Low

---

## Step 6 — Tool Page Wizard

Update wizard to match `mockup-tool.html`. Three stages only: Configure → Processing → Result.

**wizard-shell.tsx:**
- Remove Upload stage entirely (`step === 'upload'` branch)
- Start at `'config'` step by default
- File context (`inputIds`) passed in as prop from Studio, not collected in wizard
- Error display: replace inline red div with styled card

**processing-stage.tsx:**
- Replace hardcoded light colours (`#e2e8f0`, `var(--primary)`) with design system tokens
- Progress bar: `height: 4px`, track `var(--bg-2)`, fill `var(--accent)`
- Add shimmer animation
- Privacy note: "0 bytes sent to server"
- Remove old spinner `div` styles, use token-based version

**result-stage.tsx:**
- Checkmark circle with `var(--green-bg)` background
- Output file row: icon + name + meta + Download button
- "Run again" + "Back to Studio" actions
- "Also try" section with related tools

**CSS to rewrite in this step:**
- `.wizard-container` — remove `glass-card`, set `background: var(--bg-1)`
- `.drop-zone`, `.drop-zone-*` — remove (Upload stage gone)
- `.stage-title`, `.stage-description` — update typography to design system
- `glass-card` class — after this step it should be unused → mark for deletion in Step 8

**Files:** `wizard-shell.tsx`, `processing-stage.tsx`, `result-stage.tsx`, `upload-stage.tsx` (delete or keep dormant), `src/styles.css`  
**Risk:** Medium — removing Upload stage requires file context wired from canvas  
**Verify:** Tool opens at Configure, processes, result downloads correctly

---

## Step 7 — Document Cards on Canvas

Update Konva document card headers and page thumbnails.

**StudioDocument.tsx:**
- Doc header background: `#ffffff`, border `var(--border)`, shadow `var(--shadow-sm)`
- Unsaved dot: `var(--warn)` (#dfab01)
- Saved dot: `var(--green)` (#0f7b6c)
- Page count text: `var(--text-dim)`

**PageObject.tsx:**
- Thumbnail background: white (`#ffffff`)
- Default border: `var(--border)` (#e9e9e7) → in Konva: `#e9e9e7`
- Selected border: `var(--accent)` (#2383e2)
- Selected glow: Konva `shadowColor: '#2383e2', shadowBlur: 6, shadowOpacity: 0.25`
- Page number: `var(--text-dim)`

**Files:** `StudioDocument.tsx`, `PageObject.tsx`  
**Risk:** Low — visual only  
**Verify:** Pages render white, selection highlight visible

---

## Step 8 — CSS dead code removal  `src/styles.css`

Only after Steps 2–7 are complete and verified.

**Confirm unused before deleting** (grep for className in all `.tsx`):
- `.app-layout`, `.app-layout.sidebar-collapsed`
- `.sidebar`, `.sidebar.collapsed`, `.sidebar-toggle`, `.sidebar-*`
- `.main-shell`
- `.glass-card`
- `.drop-zone`, `.drop-zone-*`, `.drop-zone-icon`, `.drop-zone-title`, `.drop-zone-hint`
- `.stage-title`, `.stage-description` (if wizard rewritten)
- `.studio-viewport-rail`, `.studio-viewport-rail-*`
- All remaining `rgba(28,` `rgba(20,` `rgba(10,` hardcoded dark values

**Files:** `src/styles.css` only  
**Risk:** Low if grep confirms no usages  
**Verify:** `npm run build` — no visual regressions

---

## Order of execution

| Step | What | Key files | Risk | Est. |
|------|------|-----------|------|------|
| 1 | CSS tokens + body + Konva bg | `styles.css`, `StudioShell.tsx` | Low | 1–2h |
| 2 | Top Nav + Download modal | `studio-top-nav.tsx`, new `StudioDownloadModal.tsx` | Medium | 3–4h |
| 3 | Tool Rail (new component) | new `StudioToolRail.tsx`, `StudioShell.tsx` | Medium | 3–4h |
| 4 | Bottom Bar (simplify) | `StudioShell.tsx`, `styles.css` | Low | 1–2h |
| 5 | Empty State (verify) | `StudioShell.tsx` | Low | 1h |
| 6 | Tool Wizard (3 stages) | `wizard-shell.tsx`, stage files | Medium | 4–6h |
| 7 | Canvas doc cards | `StudioDocument.tsx`, `PageObject.tsx` | Low | 2h |
| 8 | Dead CSS removal | `styles.css` | Low | 1–2h |

**Total estimate:** ~16–23h  
**Hard rule: do not start Step 2 until Step 1 is visually verified in the browser.**
