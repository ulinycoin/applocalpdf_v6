/**
 * pdf.js 5.4 builds document fingerprints with `Uint8Array.prototype.toHex`, a method that only a
 * recent engine provides. On the rest it throws `a.toHex is not a function` while the file is being
 * opened, before a single page renders — the user sees a minified variable name and nothing else.
 *
 * Defining it here, before any pdf.js entry point runs, keeps the import path independent of the
 * browser build. The definition is idempotent and never replaces a native implementation.
 */
type Uint8ArrayWithHex = Uint8Array & { toHex?: () => string };

export function installByteArrayToHex(): void {
  const proto = Uint8Array.prototype as Uint8ArrayWithHex;
  if (typeof proto.toHex === 'function') {
    return;
  }
  Object.defineProperty(proto, 'toHex', {
    configurable: true,
    writable: true,
    value(this: Uint8Array): string {
      let hex = '';
      for (const byte of this) {
        hex += byte.toString(16).padStart(2, '0');
      }
      return hex;
    },
  });
}
