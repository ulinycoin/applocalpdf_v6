# LocalPDF V6: Design & UI Implementation Guide (Project-Aligned)

## Role
Senior Frontend Architect for this repository (`/Users/aleksejs/Desktop/LocalPDF_V6`) with focus on:
- React 18 + TypeScript strict mode
- Vite-based app shell
- Existing V6 wizard flow + worker isolation + VFS
- Dynamic Liquid Glass visual language

## Why this version
This guide is adapted to the **actual structure of the current project**. It keeps the original visual philosophy and color scheme, but replaces mismatched imports/paths and tool assumptions.

---

## 1. Current Project Mapping (Source of Truth)

### Existing key files
- Wizard shell: `src/v6/components/Wizard/WizardShell.tsx`
- Wizard types: `src/v6/components/Wizard/types.ts`
- Wizard flow hook: `src/v6/hooks/useWizardFlow.ts`
- Wizard state machine/core: `src/v6/hooks/wizard-flow-core.ts`
- Merge PDF config UI: `src/plugins/merge-pdf/ui/index.tsx`
- Global styles/tokens: `src/styles.css`
- Runner: `src/core/runner/unified-tool-runner.ts`
- VFS: `src/core/vfs/virtual-file-system.ts`

### Important architecture notes
- No `@/...` path alias configured in `tsconfig.json`
- No Tailwind config in current repo
- Styling is currently global CSS classes in `src/styles.css`
- `SmartUploadZone` currently lives inside `WizardShell.tsx` (not separate file)
- Wizard shell API currently uses `toolId`, not `toolDef`

---

## 2. Design Philosophy (Preserved)

Dynamic Liquid Glass = premium local-first product feel:
- Translucent layered surfaces
- Soft depth (multi-layer shadows)
- Responsive micro-interactions
- Clear state-driven feedback (idle / hover / processing / error / success)

Privacy framing remains explicit in copy and visuals: local processing, no cloud dependency.

---

## 3. Color System (Preserved, V3 + V6 aligned)

### Primary palette
- Ocean Blue: `#3b82f6` (main CTA/accent)
- Blue-Violet gradient: `linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)`
- Primary Navigation gradient: `linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)`
- Dark base: `#0a0a0a` to `#111827` family (zinc/gray dark)

### Glass states
- Idle: `rgba(255,255,255,0.10)` + medium blur + subtle border
- Hover/Active: `rgba(255,255,255,0.15)` + stronger blur
- Processing: cool blue tint with glow
- Error: red tint + stronger border contrast
- Success: green tint, but accents still blue-system oriented

### Accessibility
- Text contrast target: WCAG AA (4.5:1)
- Visible focus ring
- Reduced-motion fallback for animated effects

### Frozen UI tokens (2026-02-10)
- `--accent: #3b82f6`
- `--accent-soft: #2563eb`
- `btn-primary`: `linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)` + `box-shadow: 0 4px 16px rgba(59,130,246,0.3)`
- `wizard-progress-bar`: `linear-gradient(90deg, #3b82f6 0%, #8b5cf6 100%)`
- `wizard-step-chip-active`: blue gradient + glow (`0 0 20px rgba(59,130,246,0.4)`)
- `nav-link.active`: blue navigation gradient + left accent inset

State matrix (navigation/buttons/steps):
- Inactive glass: `background: rgba(255,255,255,0.10)`, `border: rgba(255,255,255,0.20)`, `text: rgba(255,255,255,0.70)`
- Hover glass: `background: rgba(59,130,246,0.12..0.15)`, `border: rgba(59,130,246,0.40..0.45)`, `text: rgba(255,255,255,0.90)`
- Active primary: `linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)`, `text: #fff`
- Completed step: `background: rgba(34,197,94,0.20)`, `border: rgba(74,222,128,0.45)`, `text: #b7f7d4`
- Disabled: `background: rgba(255,255,255,0.05)`, `border: rgba(255,255,255,0.10)`, `text: rgba(255,255,255,0.40)`, no shadow

---

## 4. Component Guidance (Adapted to Existing Files)

### A) `src/v6/components/Wizard/WizardShell.tsx`
Keep the current linear 4-step model:
1. upload
2. config
3. processing
4. result

Implementation guidance:
- Keep `useWizardFlow(toolId, options)` as orchestration source
- Keep VFS + worker flow through existing runtime services
- Maintain keyboard support for upload zone (`Enter`/`Space`)
- Improve step indicator visuals to reflect active/completed/pending more clearly
- Keep error banner inline and visually stateful

Performance guidance:
- Preserve lazy config loading (`lazy(toolDef.uiLoader)`)
- Keep preview loading isolated (`useFilePreviews`)
- Avoid unnecessary re-renders for static step UI

### B) Upload zone location
Current project uses inline component:
- `SmartUploadZone` inside `src/v6/components/Wizard/WizardShell.tsx`

Guidance:
- Keep this location unless refactor is explicitly requested
- Preserve drag-and-drop + click-to-browse behavior
- Visual states should follow Dynamic Liquid Glass palette

### C) `src/plugins/merge-pdf/ui/index.tsx`
Current component supports ordered list with up/down controls.

Guidance:
- Keep current logic/API (`inputFiles`, `onStart`, `onBack`)
- Preserve VFS metadata load from runtime
- Optionally upgrade visuals to richer glass cards without changing execution contract
- Maintain keyboard accessibility and readable action labels

---

## 5. Functional Guardrails (Must Keep)

- No Blob objects in long-lived UI state; keep IDs/metadata in state
- No direct `pdf-lib` calls in UI components
- Processing must go through existing worker/runtime pathway
- VFS operations wrapped in error handling
- Cancellation path remains supported through `AbortController`

---

## 6. Styling Strategy for This Repo

Since Tailwind is not currently wired, use `src/styles.css` with tokenized CSS variables.

Recommended token direction:
- Keep existing dark glass background layering
- Shift primary action accents to Ocean Blue system
- Keep gradient accents for active states and progress
- Use subtle animation timings (`140ms`–`300ms`) for responsiveness

If Tailwind migration is planned later, treat this file as visual spec and map classes during migration.

---

## 7. Practical Upgrade Checklist

### Visual
- Wizard active states use Ocean Blue/blue-violet gradient
- Upload hover/dragging states feel depth-aware (not flat)
- Error/success states are distinguishable at a glance

### UX
- Upload flow remains one-step obvious
- Config stage remains deterministic and easy to recover
- Result stage keeps clear download + restart actions

### Performance
- Initial render remains fast
- No heavy effect on hidden elements
- Keep animation complexity moderate for lower-end devices

### Accessibility
- Focus states visible on all interactive elements
- Buttons/interactive areas remain >=44px touch target where relevant
- Clear labels for icon-bearing actions

---

## 8. Non-Goals for This Guide

- No forced migration to React 19
- No forced Tailwind adoption
- No mandatory Framer Motion dependency
- No repository-wide FSD folder reshuffle

This guide is implementation-ready **for the current codebase** and prioritizes safe incremental enhancement.
