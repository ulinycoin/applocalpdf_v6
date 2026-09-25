import type { CanvasToolId } from './canvas-tools';

/**
 * Which Studio tool each marketing feature page arms. Every page lands in the canvas — that is
 * where the tools live — and the tool opens as soon as a document is loaded. `null` means the
 * canvas itself is the tool: merge and split are canvas actions (PAGES section of the rail) and
 * convert is a rail section, so there is nothing to pre-select.
 */
export const FEATURE_PAGE_CANVAS_TOOLS = {
  'edit-pdf': 'text',
  'merge-pdf': null,
  'ocr-pdf': 'ocr-pdf',
  'compress-pdf': 'compress-pdf',
  'split-pdf': null,
  'sign-pdf': 'sign',
  'convert-pdf': null,
  'auto-toc-pdf': 'auto-toc',
} as const satisfies Record<string, CanvasToolId | null>;

export type FeaturePageSlug = keyof typeof FEATURE_PAGE_CANVAS_TOOLS;

export function featurePageCanvasTool(slug: FeaturePageSlug): CanvasToolId | null {
  return FEATURE_PAGE_CANVAS_TOOLS[slug];
}
