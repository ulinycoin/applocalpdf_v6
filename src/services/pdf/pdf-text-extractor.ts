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

export async function extractEmbeddedPdfText(pdfBlob: Blob): Promise<EmbeddedPdfTextResult | null> {
  try {
    const pdfjs = (await import('pdfjs-dist/legacy/build/pdf.mjs')) as unknown as PdfJsLike;
    const bytes = await pdfBlob.arrayBuffer();
    const verbosity = pdfjs.VerbosityLevel?.ERRORS ?? 0;
    const doc = await pdfjs.getDocument({ data: bytes, disableWorker: true, verbosity }).promise;

    const pageTexts: string[] = [];
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
      const page = await doc.getPage(pageNumber);
      const textContent = await page.getTextContent();
      const words = (textContent.items ?? [])
        .map((item) => (typeof item.str === 'string' ? item.str : ''))
        .filter(Boolean);
      pageTexts.push(words.join(' '));
    }

    return {
      text: pageTexts.join('\n\n').trim(),
      pageCount: doc.numPages,
    };
  } catch {
    return null;
  }
}

