/**
 * Decoding of page content streams, shared by the text applier and the text-layer enrichment.
 *
 * A stream may be reachable through pdf-lib's unencoded accessor, through the raw pdf-lib core
 * decoder, or only by inflating the raw bytes in the browser — this keeps that chain in one place.
 */
import { inflateDeflateBytes } from './inflate-deflate';

interface PdfCore {
  decodePDFRawStream: (stream: unknown) => { decode: () => Uint8Array };
}

/**
 * `pdf-lib/es/core/index.js` re-exports every class as a *named* export (`default as X`) and has no
 * default export at all, so reading `module.default` never found the decoder. It is also imported
 * lazily — the module is large — and a raced timeout used to memoise "unavailable" for the rest of
 * the worker's life whenever the first import missed the deadline.
 */
export const getPdfCore = (() => {
  let promise: Promise<PdfCore | null> | null = null;
  return (): Promise<PdfCore | null> => {
    if (!promise) {
      promise = import('pdf-lib/es/core/index.js')
        .then((module) => {
          const typed = module as { decodePDFRawStream?: PdfCore['decodePDFRawStream']; default?: Partial<PdfCore> };
          const decode = typed.decodePDFRawStream ?? typed.default?.decodePDFRawStream;
          return decode ? { decodePDFRawStream: decode } : null;
        })
        .catch(() => null);
    }
    return promise;
  };
})();

/**
 * Compressed streams have ~50% non-printable bytes, content streams almost none. `getUnencodedContents`
 * returns the *encoded* bytes for a raw stream, and returning those as "decoded content" made the
 * operator parser find nothing, which silently disabled redaction and true-replace in the browser.
 */
function looksLikeDecodedContentStream(text: string): boolean {
  if (/\b(Tj|TJ)\b/u.test(text)) {
    return true;
  }
  if (text.length === 0) {
    return false;
  }
  let printable = 0;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if ((code >= 0x20 && code <= 0x7e) || code === 0x09 || code === 0x0a || code === 0x0d) {
      printable += 1;
    }
  }
  return printable / text.length > 0.99;
}

export async function decodePageStreamToLatin1(contentStream: unknown): Promise<string | null> {
  if (
    !contentStream
    || typeof contentStream !== 'object'
    || typeof (contentStream as { getContents?: unknown }).getContents !== 'function'
  ) {
    return null;
  }

  if (typeof (contentStream as { getUnencodedContents?: unknown }).getUnencodedContents === 'function') {
    const bytes = (contentStream as { getUnencodedContents: () => Uint8Array }).getUnencodedContents();
    const latin = new TextDecoder('latin1').decode(bytes);
    if (looksLikeDecodedContentStream(latin)) {
      return latin;
    }
  }

  const core = await getPdfCore();
  if (core?.decodePDFRawStream) {
    try {
      const decoded = core.decodePDFRawStream(contentStream);
      if (decoded && typeof decoded.decode === 'function') {
        const latin = new TextDecoder('latin1').decode(decoded.decode());
        if (looksLikeDecodedContentStream(latin)) {
          return latin;
        }
      }
    } catch {
      // Fallback to raw decode paths.
    }
  }

  const rawBytes = (contentStream as { getContents: () => Uint8Array }).getContents();
  const direct = new TextDecoder('latin1').decode(rawBytes);
  if (/\b(Tj|TJ)\b/u.test(direct)) {
    return direct;
  }

  const inflated = await inflateDeflateBytes(rawBytes);
  if (inflated) {
    const decoded = new TextDecoder('latin1').decode(inflated);
    if (looksLikeDecodedContentStream(decoded)) {
      return decoded;
    }
  }
  return '';
}
