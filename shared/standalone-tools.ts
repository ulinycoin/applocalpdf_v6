/**
 * Tools whose wizard can run without the Studio canvas: upload → configure → run → download.
 * Everything else renders the canvas-first notice on its standalone route and forwards the user
 * into Studio with the tool armed (see WizardShell), so a deep link never dead-ends.
 */
export const STANDALONE_WIZARD_TOOL_IDS = new Set<string>([
  'word-to-pdf',
  'excel-to-pdf',
]);

export function canRunStandalone(toolId: string): boolean {
  return STANDALONE_WIZARD_TOOL_IDS.has(toolId);
}
