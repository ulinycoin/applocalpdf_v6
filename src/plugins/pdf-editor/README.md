# pdf-editor plugin

`pdf-editor` is the legacy standalone PDF editing screen. It edits PDF content in-browser and writes
the output back to VFS, reusing the same applier and validator as the Studio canvas.

> **Not reachable through a deep link.** `/app/pdf-editor` renders the WizardShell "Studio-first"
> notice, because `canRunStandalone()` (`shared/standalone-tools.ts`) only allows `word-to-pdf` and
> `excel-to-pdf`; the canvas is the editing surface. The logic below is therefore defense in depth,
> not a live user path — if you touch it, keep it consistent with the canvas rather than assuming
> traffic. Deleting the plugin entirely is an open option (route, wizard branches, sidebar, categories
> and `e2e/pdf-editor-p0-flow.spec.ts`).

## Scope

- Inline text replacement/editing.
- New text block insertion.
- Shape overlays: `rect`, `circle`, `line`, `whiteout`.
- Undo/redo history in the UI.
- Redaction safety gate: when the payload contains a cover the user drew, the result is verified with
  `verifyRedactedPdf`; a cover whose text is still extractable fails the run instead of returning a
  file that only looks redacted (this screen has no warning dialog to fall back on).

## Files

- `definition.ts`: metadata, feature tier, limits.
- `logic/index.ts`: normalizes the UI payload, validates it through the shared
  `normalizeAndValidateStudioEditRequest` (element cap, per-field ranges), groups elements by page and
  applies them in the worker runtime via `applyStudioTextEditsToPdfBytes`.
- `ui/index.tsx`: upload, preview, editing controls, history, save/download flow. It reads previews and
  the text layer through the worker commands `GET_PDF_PAGE_COUNT` / `GET_PDF_TEXT_LAYER`.

## Input payload contract

The UI sends:

- `elements`: preferred, mixed edit payload.
- `edits`: backward-compatible text-only subset.

Supported element kinds (`x/y/width/height` are percentages of the displayed page, 0–100):

- `text`
  - `pageIndex`, `text`, `xRatio`, `yRatio`, `widthRatio`, `heightRatio`
  - optional formatting: `fontSize`, `fontFamily`, `color`, `bold`, `italic`, `opacity`, `textAlign`,
    `horizontalScaling`
  - optional source hints: `ascentRatio`, `descentRatio`, `sourceFontSizeRatio`, `originalRect`
- `line`
  - `pageIndex`, `x1Ratio`, `y1Ratio`, `x2Ratio`, `y2Ratio`, `color`, `strokeWidth`, `opacity`
- `rect`, `circle`, and `whiteout`
  - `pageIndex`, `xRatio`, `yRatio`, `widthRatio`, `heightRatio`, `color`, `strokeWidth`, `opacity`

An empty `text` element is dropped. `whiteout` is applied as an opaque white rectangle with no stroke;
an unpainted or outlined shape is decoration and never removes the text underneath.

## Test coverage

- Unit: `src/plugins/pdf-editor/logic/index.test.ts` (edits + progress, empty input, shared element
  cap, redaction-check rule)
- E2E: `e2e/pdf-editor-p0-flow.spec.ts`
