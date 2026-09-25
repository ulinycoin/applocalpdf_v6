/**
 * Tools the Studio canvas can open from its rail. Shared because the canvas deep link
 * (`/studio?tool=<id>`) and the marketing pages must agree on what can be armed.
 */
export const CANVAS_EDIT_TOOL_IDS = [
  'text',
  'annotate',
  'sign',
  'whiteout',
  'watermark',
  'forms',
  'protect',
] as const;

export const CANVAS_CONVERT_TOOL_IDS = [
  'ocr-pdf',
  'pdf-to-jpg',
  'extract-images',
  'compress-pdf',
  'auto-toc',
  'pdf-info',
] as const;

export type CanvasEditToolId = typeof CANVAS_EDIT_TOOL_IDS[number];
export type CanvasConvertToolId = typeof CANVAS_CONVERT_TOOL_IDS[number];
export type CanvasToolId = CanvasEditToolId | CanvasConvertToolId;

export const CANVAS_TOOL_IDS: ReadonlySet<string> = new Set<string>([
  ...CANVAS_EDIT_TOOL_IDS,
  ...CANVAS_CONVERT_TOOL_IDS,
]);

export function isCanvasTool(toolId: string): toolId is CanvasToolId {
  return CANVAS_TOOL_IDS.has(toolId);
}

/**
 * Tools whose home is the canvas but that are not a rail entry: merge and split are actions on the
 * PAGES section (drag a page between workspaces, or the rail buttons).
 */
export const CANVAS_ACTION_TOOL_IDS: ReadonlySet<string> = new Set<string>(['merge-pdf', 'split-pdf']);

export function hasCanvasSurface(toolId: string): boolean {
  return isCanvasTool(toolId) || CANVAS_ACTION_TOOL_IDS.has(toolId);
}
