export function isStudioTextEditV2Enabled(): boolean {
  try {
    const env = (import.meta as ImportMeta & { env?: Record<string, string | boolean> }).env;
    if (env?.VITE_STUDIO_TEXT_EDIT_V2 === '0' || env?.VITE_STUDIO_TEXT_EDIT_V2 === 'false') {
      return false;
    }
  } catch {
    // Non-Vite runtime (node tests, workers).
  }

  if (typeof globalThis !== 'undefined') {
    const locationRef = (globalThis as typeof globalThis & { location?: Location }).location;
    if (locationRef?.search) {
      const query = new URLSearchParams(locationRef.search);
      if (query.get('textEditV2') === '0') {
        return false;
      }
    }
  }

  return true;
}
