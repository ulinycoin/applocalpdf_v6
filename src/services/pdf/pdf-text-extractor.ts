import { extractPdfTextSegments } from './pdf-content-stream-parser';
import { inflateDeflateBytes } from './inflate-deflate';

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
  GlobalWorkerOptions?: { workerSrc?: string };
}

export interface EmbeddedPdfTextResult {
  text: string;
  pageCount: number;
}

/**
 * Text that is a byte-level guess rather than the document's characters.
 *
 * The content-stream fallback below reads operator strings as latin1 bytes, because it has no font
 * encoding or `/ToUnicode` to consult. For a subset font whose codes are not ASCII it therefore returns
 * a constant-offset shift of the real text (`LocalPDF` -> `/ R F D O 3 ' )`), one character per item.
 * Handing that to OCR is worse than not extracting at all: the file already has a text layer, the user
 * gets garbage, and nothing runs the real recogniser. So the caller treats it as "no embedded text".
 */
export function looksMisDecodedText(text: string): boolean {
  const body = text.replace(/\s+/gu, '');
  if (body.length < 40) {
    return false;
  }
  const controls = (body.match(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/gu) ?? []).length;
  if (controls / body.length > 0.02) {
    return true;
  }
  const tokens = text.split(/\s+/u).filter(Boolean);
  if (tokens.length < 20) {
    return false;
  }
  const singleChar = tokens.filter((token) => token.length === 1).length;
  return singleChar / tokens.length > 0.6;
}

async function inflateIfNeeded(raw: Uint8Array): Promise<string> {
  const direct = new TextDecoder('latin1').decode(raw);
  if (/\b(Tj|TJ)\b/u.test(direct)) {
    return direct;
  }

  // The inflated bytes may legitimately contain no text operators (an image-only page), so the text
  // check stays here rather than inside the shared helper.
  const inflated = await inflateDeflateBytes(raw);
  if (inflated) {
    const decoded = new TextDecoder('latin1').decode(inflated);
    if (/\b(Tj|TJ)\b/u.test(decoded)) {
      return decoded;
    }
  }
  return '';
}

/**
 * pdf.js refuses to start without a worker URL, and inside the tool worker it throws
 * `No "GlobalWorkerOptions.workerSrc" specified.` — the extraction then silently fell back to the
 * byte-level parser and OCR reported shifted garbage for a file that has a perfectly good text layer.
 * `?url` lets the bundler emit the worker asset and hand us its hashed path.
 */
let pdfJsWorkerConfigured = false;

async function configurePdfJsWorker(pdfjs: PdfJsLike): Promise<void> {
  if (pdfJsWorkerConfigured || !pdfjs.GlobalWorkerOptions || pdfjs.GlobalWorkerOptions.workerSrc) {
    return;
  }
  try {
    const workerModule = (await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')) as { default?: string };
    if (workerModule.default) {
      pdfjs.GlobalWorkerOptions.workerSrc = workerModule.default;
      pdfJsWorkerConfigured = true;
    }
  } catch {
    // Extraction still works in environments that do not need a worker (Node, tests).
  }
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
        chunks.push(...extractPdfTextSegments(content));
      }
      pageTexts.push(chunks.join(' ').trim());
    }

    const text = pageTexts.join('\n\n').trim();
    if (looksMisDecodedText(text)) {
      return null;
    }
    return {
      text,
      pageCount: doc.getPageCount(),
    };
  } catch {
    return null;
  }
}

export async function extractEmbeddedPdfText(pdfBlob: Blob): Promise<EmbeddedPdfTextResult | null> {
  const bytes = new Uint8Array(await pdfBlob.arrayBuffer());
  try {
    let pdfjs: PdfJsLike | null = null;
    const loaders: Array<() => Promise<unknown>> = [
      () => import('pdfjs-dist/legacy/build/pdf.mjs'),
      () => import('pdfjs-dist/build/pdf.mjs'),
      () => import('pdfjs-dist'),
    ];
    for (const load of loaders) {
      try {
        const mod = (await load()) as PdfJsLike;
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
    await configurePdfJsWorker(pdfjs);
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

    const text = pageTexts.join('\n\n').trim();
    if (text.length > 0 && !looksMisDecodedText(text)) {
      return { text, pageCount: doc.numPages };
    }
    return extractEmbeddedPdfTextViaPdfLib(bytes);
  } catch {
    return extractEmbeddedPdfTextViaPdfLib(bytes);
  }
}
