# Design System — Notion-inspired Light Theme

Approved direction for LocalPDF UI redesign.
Reference mockups: `mockup.html` (Studio), `mockup-tool.html` (Tool page)

---

## Rationale

LocalPDF is used in office environments during the day, with white PDF documents.
A dark UI creates constant contrast-switching between document and interface — fatiguing over hours.
Notion's approach: the interface disappears, leaving only content.
Default is **light**. Dark mode can be offered as an option, not the default.

---

## Color tokens

```css
--bg:            #ffffff;   /* page background */
--bg-1:          #f7f7f5;   /* sidebar, rail */
--bg-2:          #f1f1ef;   /* active tab, segmented control bg */
--surface:       #ffffff;   /* cards, modals */
--surface-hover: #f7f7f5;   /* hover state */
--border:        #e9e9e7;   /* default borders */
--border-strong: #d3d3cf;   /* inputs, strong dividers */

--text:          #1a1a18;   /* primary text */
--text-muted:    #6b6b68;   /* secondary text, labels */
--text-dim:      #b3b3af;   /* placeholders, hints, page numbers */

--accent:        #2383e2;   /* primary action, links */
--accent-hover:  #1a6fc4;
--accent-dim:    rgba(35,131,226,0.1);  /* icon backgrounds, highlights */

--green:         #0f7b6c;   /* success, privacy badge, saved state */
--green-bg:      rgba(15,123,108,0.08);

--red:           #e03e3e;   /* destructive actions */
--warn:          #dfab01;   /* unsaved indicator */

--radius-sm:     4px;
--radius-md:     6px;
--radius-lg:     8px;

--shadow-sm:     0 1px 3px rgba(0,0,0,0.08);
--shadow:        0 4px 16px rgba(0,0,0,0.10);
```

---

## Typography

- Font: `Inter`, fallback `-apple-system, sans-serif`
- Base size: `13.5px`
- Smoothing: `-webkit-font-smoothing: antialiased`
- Page title: `20px / 700 / letter-spacing -0.3px`
- Section header: `13px / 600`
- Body: `13.5px / 400`
- Label: `12px / 500 / color: --text-muted`
- Hint/meta: `11.5px / color: --text-dim`
- Uppercase label: `11px / 600 / letter-spacing 0.5px / text-transform uppercase`

---

## Layout

### Studio (canvas app)
```
┌─ Nav 48px ──────────────────────────────────┐
│ Logo / Doc tabs / Download  Upgrade         │
├─ Rail 220px ─┬─ Canvas ────────────────────┤
│ Upload btn   │  grid bg #f0efed            │
│ Edit tools   │  doc cards (white, shadow)  │
│ Convert      │  empty state centered       │
│ History      │                             │
├──────────────┴─ Bottom bar 40px ───────────┤
│ zoom  grid  copy/paste        selected hist│
└─────────────────────────────────────────────┘
```

### Tool page (wizard)
- Max-width: `680px`, centered
- Tool header: icon + title + desc + privacy badge
- Steps: 3 stages — Configure → Processing → Result (no Upload — file comes from Studio canvas)
- Cards stack vertically with `10px` gap
- Actions row: primary btn left, ghost btn right

---

## Components

### Nav
- Height: `48px`, `border-bottom: 1px solid --border`
- Logo: icon 22×22 blue square + name
- Doc tabs: pill style, unsaved dot (--warn), saved dot (--border-strong)
- Active tab: `background: --bg-2`

### Tool Rail (sidebar)
- Width: `220px`, background `--bg-1`
- Upload button: bordered, `background: --bg`
- Tool buttons: icon 20×20 + label, no background by default
- Active tool: `background: --bg-2`, icon color `--accent`
- Section labels: uppercase, `--text-dim`

### Cards
- `background: --bg`, `border: 1px solid --border`, `border-radius: 8px`
- Card header: `14px padding`, `border-bottom`, icon + title
- Card body: `18px padding`

### Buttons
- Primary: `background: --accent`, white text, `border-radius: 4px`
- Ghost: `border: 1px solid --border-strong`, `color: --text-muted`
- Hover states: primary darkens to `--accent-hover`, ghost fills `--surface-hover`

### Inputs / Selects
- `border: 1px solid --border-strong`, `border-radius: 4px`
- Focus: `border-color: --accent`
- Background: `--bg`

### Segmented control
- Container: `background: --bg-1`, `border: 1px solid --border-strong`
- Active segment: `background: --bg`, border, `box-shadow: --shadow-sm`

### Toggle
- Off: `background: --border-strong`
- On: `background: --accent`
- Knob: white circle, `box-shadow: 0 1px 2px rgba(0,0,0,0.2)`

### Privacy badge
- `color: --green`, `background: --green-bg`
- `border: 1px solid rgba(15,123,108,0.15)`, pill shape
- Always shown in tool header

### Upsell (inline, non-blocking)
- `background: #f0f7ff`, `border: 1px solid rgba(35,131,226,0.2)`
- Title + description + Upgrade button
- Never use full-screen overlay as default — only for hard limits

### Progress bar
- Track: `height: 4px`, `background: --bg-2`
- Fill: `background: --accent`, shimmer animation
- Labels: status text left, percentage right

---

## Canvas

- Background: `#f0efed` with subtle dot/grid pattern
- Doc cards: white background, `border: 1px solid --border`, `box-shadow: --shadow-sm`
- Page thumbnails: white, `border: 1px solid --border`
- Selected page: `border-color: --accent`, `box-shadow: 0 0 0 2px rgba(35,131,226,0.25)`
- Empty state: centered, dashed icon border, muted text, keyboard shortcuts

---

## Principles

1. **Interface disappears** — white on white, document is the focus
2. **Accent only on actions** — blue only for buttons and interactive elements
3. **No decorative shadows** — only functional depth (cards, modals)
4. **Privacy is visible** — green badge in every tool header, not hidden in footer
5. **Upsell is calm** — inline banners, not aggressive overlays
6. **Notion-like density** — comfortable padding, not cramped, not airy
