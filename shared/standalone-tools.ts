/**
 * Tools whose wizard can run without the Studio canvas: upload → configure → run → download.
 * Everything else shows a "Studio-first" notice on its standalone route, so marketing links must
 * not point at those tool paths (see src/app/routing/seo-app-targets.test.ts).
 */
export const STANDALONE_WIZARD_TOOL_IDS = new Set<string>([
  'word-to-pdf',
  'excel-to-pdf',
  'merge-pdf',
  'compress-pdf',
  'auto-toc',
]);

export function canRunStandalone(toolId: string): boolean {
  return STANDALONE_WIZARD_TOOL_IDS.has(toolId);
}
