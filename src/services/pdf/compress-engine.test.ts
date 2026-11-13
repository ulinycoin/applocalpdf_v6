import assert from 'node:assert/strict';
import test from 'node:test';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { PdfLibCompressEngine } from './compress-engine';

function pdfPart(bytes: Uint8Array): BlobPart {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy;
}

async function buildPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([400, 300]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText('COMPRESS ME', { x: 40, y: 200, size: 18, font });
  return new Uint8Array(await doc.save());
}

test('compressing a text PDF yields a loadable document with the same pages', async () => {
  const engine = new PdfLibCompressEngine();
  const source = await buildPdf();
  const result = await engine.compress(new Blob([pdfPart(source)], { type: 'application/pdf' }), { quality: 'medium' });
  const loaded = await PDFDocument.load(new Uint8Array(await result.arrayBuffer()));
  assert.equal(loaded.getPageCount(), 1);
});

test('a document that cannot be made smaller is returned unchanged', async () => {
  const engine = new PdfLibCompressEngine();
  const source = await buildPdf();
  const result = await engine.compress(new Blob([pdfPart(source)], { type: 'application/pdf' }), { quality: 'high' });
  assert.ok(new Uint8Array(await result.arrayBuffer()).byteLength <= source.byteLength, 'output must never be larger');
});

test('every preset works without a canvas runtime (the worker may not have one)', async () => {
  const engine = new PdfLibCompressEngine();
  const source = await buildPdf();
  for (const quality of ['low', 'medium', 'high'] as const) {
    const result = await engine.compress(new Blob([pdfPart(source)], { type: 'application/pdf' }), { quality });
    const loaded = await PDFDocument.load(new Uint8Array(await result.arrayBuffer()));
    assert.equal(loaded.getPageCount(), 1, `${quality} must stay loadable`);
  }
});
