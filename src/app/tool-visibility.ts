const HIDDEN_STANDALONE_TOOL_IDS = new Set([
  'rotate-pdf',
  'split-pdf',
  'delete-pages-pdf',
  'pdf-info',
]);

export function isStandaloneToolHidden(toolId: string): boolean {
  return HIDDEN_STANDALONE_TOOL_IDS.has(toolId);
}

