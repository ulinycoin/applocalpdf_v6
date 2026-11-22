import assert from 'node:assert/strict';
import test from 'node:test';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { buildSearchablePdfFromImages } from './searchable-pdf';
import { extractEmbeddedPdfText } from '../pdf/pdf-text-extractor';

// 1x1 transparent PNG — enough for pdf-lib to embed as a page image.
const ONE_PIXEL_PNG = Uint8Array.from(
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
    'base64',
  ),
);

async function textLayerPdf(text: string): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const page = pdf.addPage([300, 120]);
  page.drawText(text, { x: 20, y: 50, size: 14, font, color: rgb(0, 0, 0) });
  return pdf.save();
}

test('searchable PDF keeps the OCR text layer under the page image', async () => {
  const output = await buildSearchablePdfFromImages([
    {
      imageBlob: new Blob([ONE_PIXEL_PNG as BlobPart], { type: 'image/png' }),
      textPdfBytes: await textLayerPdf('HELLO SEARCH LAYER'),
    },
  ]);

  const extracted = await extractEmbeddedPdfText(output);
  assert.ok(extracted, 'text layer should be extractable');
  assert.equal(extracted.pageCount, 1);
  assert.ok(extracted.text.includes('HELLO SEARCH LAYER'), `unexpected text: ${extracted.text}`);

  const doc = await PDFDocument.load(new Uint8Array(await output.arrayBuffer()));
  assert.equal(doc.getPageCount(), 1);
  assert.equal(doc.getPage(0).getWidth(), 300);
});

test('a missing text page still yields an image-only page', async () => {
  const output = await buildSearchablePdfFromImages([
    { imageBlob: new Blob([ONE_PIXEL_PNG as BlobPart], { type: 'image/png' }) },
  ]);
  const doc = await PDFDocument.load(new Uint8Array(await output.arrayBuffer()));
  assert.equal(doc.getPageCount(), 1);
  assert.equal(doc.getPage(0).getWidth(), 1);
});
