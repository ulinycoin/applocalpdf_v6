import assert from 'node:assert/strict';
import test from 'node:test';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import {
  analyzePdfInfo,
  detectEncryption,
  detectLinearized,
  parsePdfAClaimFromXmp,
  parsePdfVersion,
  extractFontsFromPdfText,
} from './pdf-info-analyzer';

async function createSamplePdf(options?: {
  title?: string;
  author?: string;
  pages?: number;
}): Promise<Blob> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  if (options?.title) doc.setTitle(options.title);
  if (options?.author) doc.setAuthor(options.author);

  const pageCount = options?.pages ?? 1;
  for (let index = 0; index < pageCount; index += 1) {
    const page = doc.addPage([400, 400]);
    page.drawText(`Page ${index + 1}`, { x: 40, y: 360, size: 14, font });
  }

  const bytes = await doc.save();
  return new Blob([new Uint8Array(bytes)], { type: 'application/pdf' });
}

test('parsePdfVersion reads PDF header version', async () => {
  const blob = await createSamplePdf();
  const bytes = new Uint8Array(await blob.arrayBuffer());
  assert.equal(parsePdfVersion(bytes), '1.7');
});

test('detectEncryption returns false for simple PDF', async () => {
  const blob = await createSamplePdf();
  const bytes = new Uint8Array(await blob.arrayBuffer());
  assert.equal(detectEncryption(bytes).encrypted, false);
});

test('detectLinearized returns false for pdf-lib output', async () => {
  const blob = await createSamplePdf();
  const bytes = new Uint8Array(await blob.arrayBuffer());
  assert.equal(detectLinearized(bytes), false);
});

test('parsePdfAClaimFromXmp extracts self-declared profile', () => {
  const claim = parsePdfAClaimFromXmp(`
    <pdfaid:part>1</pdfaid:part>
    <pdfaid:conformance>B</pdfaid:conformance>
  `);
  assert.deepEqual(claim, {
    part: '1',
    conformance: 'B',
    pdfAClaim: 'PDF/A-1b',
  });
});

test('extractFontsFromPdfText dedupes subset prefixes', () => {
  const raw = `
    /Type /Font /Subtype /Type1 /BaseFont /AAAAAA+Helvetica
    /Type /Font /Subtype /Type1 /BaseFont /BBBBBB+Helvetica
  `;
  const bytes = new Uint8Array([...raw].map((char) => char.charCodeAt(0)));
  const fonts = extractFontsFromPdfText(bytes);
  assert.equal(fonts.length, 1);
  assert.equal(fonts[0]?.name, 'Helvetica');
  assert.equal(fonts[0]?.instances, 2);
});

test('extractFontsFromPdfText ignores non-font dictionaries', () => {
  const raw = `
    /Type /XObject /Subtype /Image /BaseFont /FakeFromImage
    /Type /Font /Subtype /Type1 /BaseFont /Times-Roman
  `;
  const bytes = new Uint8Array([...raw].map((char) => char.charCodeAt(0)));
  const fonts = extractFontsFromPdfText(bytes);
  assert.equal(fonts.length, 1);
  assert.equal(fonts[0]?.name, 'Times-Roman');
});

test('analyzePdfInfo returns core document fields', async () => {
  const blob = await createSamplePdf({ title: 'Invoice', author: 'LocalPDF', pages: 2 });
  const report = await analyzePdfInfo(blob, 'invoice.pdf');

  assert.equal(report.fileName, 'invoice.pdf');
  assert.equal(report.pageCount, 2);
  assert.equal(report.pdfVersion, '1.7');
  assert.equal(report.encrypted, false);
  assert.equal(report.documentInfo.title, 'Invoice');
  assert.equal(report.documentInfo.author, 'LocalPDF');
  assert.ok(report.fonts.length >= 1);
});
