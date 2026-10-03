import { parsePdfTextOperators } from './pdf-content-stream-parser';

/**
 * Decoding of page content streams, shared by the text applier and the text-layer enrichment.
 *
 * A stream may be reachable through pdf-lib's unencoded accessor, through the raw pdf-lib core
 * decoder, or only by inflating the raw bytes in the browser — this keeps that chain in one place.
 */

export const getPdfCore = (() => {
  let promise: Promise<{ decodePDFRawStream?: (stream: unknown) => { decode: () => Uint8Array } } | null> | null = null;
  return (): Promise<{ decodePDFRawStream?: (stream: unknown) => { decode: () => Uint8Array } } | null> => {
    if (!promise) {
      promise = Promise.race([
        import('pdf-lib/es/core/index.js')
          .then((module) => {
            const maybeCore = (module as { default?: { decodePDFRawStream?: (stream: unknown) => { decode: () => Uint8Array } } }).default;
            return maybeCore ?? null;
          })
          .catch(() => null),
        new Promise<null>((resolve) => {
          setTimeout(() => resolve(null), 300);
        }),
      ]);
    }
    return promise;
  };
})();

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
    return new TextDecoder('latin1').decode(bytes);
  }

  const core = await getPdfCore();
  if (core?.decodePDFRawStream) {
    try {
      const decoded = core.decodePDFRawStream(contentStream);
      if (decoded && typeof decoded.decode === 'function') {
        return new TextDecoder('latin1').decode(decoded.decode());
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
  if (typeof DecompressionStream === 'undefined') {
    return '';
  }
  const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number): Promise<T> => {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        promise,
        new Promise<T>((_, reject) => {
          timeoutId = setTimeout(() => reject(new Error('DECOMPRESS_TIMEOUT')), timeoutMs);
        }),
      ]);
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  };
  for (const format of ['deflate', 'deflate-raw'] as const) {
    try {
      const inflated = await withTimeout((async () => {
        const stream = new DecompressionStream(format);
        const writer = stream.writable.getWriter();
        const safeBytes = new Uint8Array(rawBytes.byteLength);
        safeBytes.set(rawBytes);
        await writer.write(safeBytes);
        await writer.close();
        return new Uint8Array(await new Response(stream.readable).arrayBuffer());
      })(), 250);
      const decoded = new TextDecoder('latin1').decode(inflated);
      if (/\b(Tj|TJ)\b/u.test(decoded)) {
        return decoded;
      }
    } catch {
      // Try next format.
    }
  }
  return '';
}

