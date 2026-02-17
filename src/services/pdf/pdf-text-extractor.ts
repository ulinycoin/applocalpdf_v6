interface PdfTextItem {
  str?: string;
}

interface PdfTextContent {
  items?: PdfTextItem[];
}

interface PdfPageLike {
  getTextContent(): Promise<PdfTextContent>;
}

interface PdfDocumentLike {
  numPages: number;
  getPage(page: number): Promise<PdfPageLike>;
}

interface PdfJsLike {
  getDocument(params: { data: ArrayBuffer; disableWorker: boolean; verbosity?: number }): { promise: Promise<PdfDocumentLike> };
  VerbosityLevel?: { ERRORS?: number };
}

export interface EmbeddedPdfTextResult {
  text: string;
  pageCount: number;
}

function decodePdfHexString(hex: string): string {
  const normalized = hex.length % 2 === 0 ? hex : `${hex}0`;
  const bytes = new Uint8Array(normalized.length / 2);
  for (let i = 0; i < normalized.length; i += 2) {
    const value = Number.parseInt(normalized.slice(i, i + 2), 16);
    bytes[i / 2] = Number.isFinite(value) ? value : 0x20;
  }
  return new TextDecoder('latin1').decode(bytes);
}

function decodePdfLiteralString(input: string): string {
  return input
    .replace(/\\n/gu, '\n')
    .replace(/\\r/gu, '\r')
    .replace(/\\t/gu, '\t')
    .replace(/\\b/gu, '\b')
    .replace(/\\f/gu, '\f')
    .replace(/\\\(/gu, '(')
    .replace(/\\\)/gu, ')')
    .replace(/\\\\/gu, '\\');
}

function extractTextOperators(content: string): string[] {
  const chunks: string[] = [];

  for (const match of content.matchAll(/<([0-9A-Fa-f]+)>\s*Tj/gu)) {
    chunks.push(decodePdfHexString(match[1] ?? ''));
  }
  for (const match of content.matchAll(/\(([^()]*)\)\s*Tj/gu)) {
    chunks.push(decodePdfLiteralString(match[1] ?? ''));
  }
  for (const match of content.matchAll(/\[([^\]]+)\]\s*TJ/gu)) {
    const body = match[1] ?? '';
    for (const hex of body.matchAll(/<([0-9A-Fa-f]+)>/gu)) {
      chunks.push(decodePdfHexString(hex[1] ?? ''));
    }
    for (const literal of body.matchAll(/\(([^()]*)\)/gu)) {
      chunks.push(decodePdfLiteralString(literal[1] ?? ''));
    }
  }

  return chunks
    .map((part) => part.replace(/\s+/gu, ' ').trim())
    .filter(Boolean);
}

async function inflateIfNeeded(raw: Uint8Array): Promise<string> {
  const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number): Promise<T> => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
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
  };

  const direct = new TextDecoder('latin1').decode(raw);
  if (/\b(Tj|TJ)\b/u.test(direct)) {
    return direct;
  }
  if (typeof DecompressionStream === 'undefined') {
    return '';
  }
  for (const format of ['deflate', 'deflate-raw'] as const) {
      try {
        const inflated = await withTimeout((async () => {
          const stream = new DecompressionStream(format);
          const writer = stream.writable.getWriter();
          await writer.write(new Uint8Array(raw));
          await writer.close();
          return new Uint8Array(await new Response(stream.readable).arrayBuffer());
        })(), 180);
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

async function extractEmbeddedPdfTextViaPdfLib(pdfBytes: Uint8Array): Promise<EmbeddedPdfTextResult | null> {
  try {
    const { PDFDocument, PDFName } = await import('pdf-lib');
    const doc = await PDFDocument.load(pdfBytes);
    const pageTexts: string[] = [];

    for (let pageIndex = 0; pageIndex < doc.getPageCount(); pageIndex += 1) {
      const page = doc.getPage(pageIndex);
      const contentsRef = page.node.get(PDFName.of('Contents'));
      if (!contentsRef) {
        pageTexts.push('');
        continue;
      }
      const resolved = doc.context.lookup(contentsRef as any) as any;
      const streams: any[] = [];
      if (resolved && typeof resolved.size === 'function' && typeof resolved.get === 'function') {
        const count = Number(resolved.size());
        for (let i = 0; i < count; i += 1) {
          streams.push(doc.context.lookup(resolved.get(i)));
        }
      } else {
        streams.push(resolved);
      }

      const chunks: string[] = [];
      for (const stream of streams) {
        if (!stream || typeof stream.getContents !== 'function') {
          continue;
        }
        const content = await inflateIfNeeded(stream.getContents() as Uint8Array);
        if (!content) {
          continue;
        }
        chunks.push(...extractTextOperators(content));
      }
      pageTexts.push(chunks.join(' ').trim());
    }

    return {
      text: pageTexts.join('\n\n').trim(),
      pageCount: doc.getPageCount(),
    };
  } catch {
    return null;
  }
}

export async function extractEmbeddedPdfText(pdfBlob: Blob): Promise<EmbeddedPdfTextResult | null> {
  const bytes = new Uint8Array(await pdfBlob.arrayBuffer());
  try {
    const candidates = [
      'pdfjs-dist/legacy/build/pdf.mjs',
      'pdfjs-dist/build/pdf.mjs',
      'pdfjs-dist',
    ] as const;
    let pdfjs: PdfJsLike | null = null;
    for (const candidate of candidates) {
      try {
        const mod = (await import(candidate)) as unknown as PdfJsLike;
        if (mod && typeof mod.getDocument === 'function') {
          pdfjs = mod;
          break;
        }
      } catch {
        // Try next candidate.
      }
    }
    if (!pdfjs) {
      return extractEmbeddedPdfTextViaPdfLib(bytes);
    }
    const verbosity = pdfjs.VerbosityLevel?.ERRORS ?? 0;
    const doc = await pdfjs.getDocument({ data: bytes.buffer, disableWorker: true, verbosity }).promise;

    const pageTexts: string[] = [];
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
      const page = await doc.getPage(pageNumber);
      const textContent = await page.getTextContent();
      const words = (textContent.items ?? [])
        .map((item) => (typeof item.str === 'string' ? item.str : ''))
        .filter(Boolean);
      pageTexts.push(words.join(' '));
    }

    const result = {
      text: pageTexts.join('\n\n').trim(),
      pageCount: doc.numPages,
    };
    if (result.text.length > 0) {
      return result;
    }
    return extractEmbeddedPdfTextViaPdfLib(bytes);
  } catch {
    return extractEmbeddedPdfTextViaPdfLib(bytes);
  }
}
