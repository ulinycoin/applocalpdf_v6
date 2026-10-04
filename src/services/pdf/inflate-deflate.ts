/**
 * Flate inflation for PDF streams, shared by the OCR text extractor and the content-stream decoder.
 *
 * `DecompressionStream` is a `TransformStream`: awaiting `writer.write()`/`close()` before anything
 * drains `readable` deadlocks it in Chromium, because the write only settles while the readable side
 * is being consumed. Node drains eagerly, so this pattern failed *only* in the browser — it silently
 * disabled content-stream decoding (redaction stopped erasing text) and the OCR embedded-text fast
 * path, while every Node test stayed green. The read and write sides therefore run concurrently.
 *
 * Shared on purpose: the same deadlock was fixed twice in two files, so it lives in one place now.
 */
const DEFAULT_TIMEOUT_MS = 3000;

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error('INFLATE_TIMEOUT')), timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

async function inflateViaStream(bytes: Uint8Array<ArrayBuffer>, format: 'deflate' | 'deflate-raw'): Promise<Uint8Array> {
  const stream = new DecompressionStream(format);
  const writer = stream.writable.getWriter();
  const writing = writer.write(bytes).then(() => writer.close());
  // A rejected write is reported by the reader below; swallow it here to avoid an unhandled rejection.
  void writing.catch(() => undefined);

  const reader = stream.readable.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    if (value) {
      chunks.push(value);
      total += value.length;
    }
  }
  await writing;

  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

/**
 * Returns the inflated bytes, or null when no supported format could decode them (a caller may then
 * fall back to reading the bytes as latin1 text). zlib streams start with the 0x78 CMF byte; anything
 * else is a raw deflate stream. The timeout exists so a truncated stream cannot hang the worker.
 */
export async function inflateDeflateBytes(raw: Uint8Array, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<Uint8Array | null> {
  if (typeof DecompressionStream === 'undefined') {
    return null;
  }

  const looksZlib = raw.byteLength > 1 && raw[0] === 0x78;
  const formats: Array<'deflate' | 'deflate-raw'> = looksZlib ? ['deflate', 'deflate-raw'] : ['deflate-raw', 'deflate'];

  for (const format of formats) {
    try {
      const stable = new Uint8Array(raw.byteLength) as Uint8Array<ArrayBuffer>;
      stable.set(raw);
      const inflated = await withTimeout(inflateViaStream(stable, format), timeoutMs);
      if (inflated.byteLength > 0) {
        return inflated;
      }
    } catch {
      // Try the next format.
    }
  }
  return null;
}
