import type { PDFPage } from 'pdf-lib';

export interface SearchablePdfPageInput {
  imageBlob: Blob;
  /**
   * Single-page PDF rendered by Tesseract for the same image (`pdfTextOnly`). It carries a glyph-less
   * font with a ToUnicode map for every character, which keeps the text layer searchable for any
   * script — pdf-lib's standard/Noto fonts could only encode Latin and Cyrillic and silently skipped
   * everything else.
   */
  textPdfBytes?: Uint8Array;
}

/**
 * Builds a searchable PDF from the original page image plus the invisible OCR text layer.
 *
 * The visible page is the original image; the text page is copied underneath it (Tesseract renders
 * its text with `3 Tr`, so it is invisible). Copying the page keeps the exact text positions instead
 * of re-drawing words through pdf-lib, and the image is stretched to the text page's box so both stay
 * aligned even when OCR ran on an upscaled copy.
 */
export async function buildSearchablePdfFromImages(pages: SearchablePdfPageInput[]): Promise<Blob> {
  const { PDFDocument } = await import('pdf-lib');
  const pdf = await PDFDocument.create();

  for (const pageData of pages) {
    const bytes = new Uint8Array(await pageData.imageBlob.arrayBuffer());
    const mime = pageData.imageBlob.type;
    const isPng = mime === 'image/png';
    const isJpeg = mime === 'image/jpeg' || mime === 'image/jpg';
    if (!isPng && !isJpeg) {
      throw new Error(`Searchable PDF supports PNG/JPEG image pages, received: ${mime || 'unknown'}`);
    }
    const image = isPng ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);

    let page: PDFPage | null = null;
    if (pageData.textPdfBytes) {
      try {
        const textPdf = await PDFDocument.load(pageData.textPdfBytes);
        const [copied] = await pdf.copyPages(textPdf, [0]);
        if (copied) {
          page = pdf.addPage(copied);
        }
      } catch {
        // A malformed text page must not lose the image: fall back to an image-only page below.
        page = null;
      }
    }
    if (!page) {
      page = pdf.addPage([image.width, image.height]);
    }

    page.drawImage(image, { x: 0, y: 0, width: page.getWidth(), height: page.getHeight() });
  }

  const output = await pdf.save();
  const normalized = new Uint8Array(output.byteLength);
  normalized.set(output);
  return new Blob([normalized], { type: 'application/pdf' });
}
