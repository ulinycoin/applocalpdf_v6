import assert from 'node:assert/strict';
import test from 'node:test';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { InMemoryFileSystem } from '../../test-utils/in-memory-fs';
import { run } from './index';

async function createTextPdf(text: string): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const page = pdf.addPage([400, 300]);
  page.drawText(text, { x: 50, y: 150, size: 14, font, color: rgb(0, 0, 0) });
  return pdf.save() as unknown as Uint8Array;
}

async function createBlankPdf(): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([400, 300]);
  page.drawRectangle({ x: 0, y: 0, width: 400, height: 300, color: rgb(1, 1, 1) });
  return pdf.save() as unknown as Uint8Array;
}

test('ocr-pdf logic returns deterministic error for PDF without rasterizer', async () => {
  const fs = new InMemoryFileSystem();
  fs.seed('f1', new Blob([new Uint8Array([1, 2, 3])], { type: 'application/pdf' }));

  await assert.rejects(
    () => run({ inputIds: ['f1'], fs }),
    (error) =>
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: unknown }).code === 'OCR_PDF_RASTERIZER_MISSING',
  );
});

test('ocr-pdf logic rejects empty input', async () => {
  const fs = new InMemoryFileSystem();
  await assert.rejects(() => run({ inputIds: [], fs }), /at least one input file/);
});

test('ocr-pdf logic uses embedded text when PDF has sufficient text', async () => {
  const pdfBytes = await createTextPdf('This is a test document with enough text to trigger the embedded text path in the OCR logic.');
  const fs = new InMemoryFileSystem();
  fs.seed('f1', new Blob([pdfBytes as BlobPart], { type: 'application/pdf' }));

  const result = await run({ inputIds: ['f1'], fs });
  assert.ok(result.outputIds.length > 0, 'should produce output');

  const output = await fs.read(result.outputIds[0]);
  const text = await output.getText();
  assert.ok(text.includes('test document'), 'should contain extracted embedded text');
  assert.ok(text.length > 20, 'should have meaningful text content');
});

test('ocr-pdf logic falls through to rasterizer for PDF with no text layer', async () => {
  const pdfBytes = await createBlankPdf();
  const fs = new InMemoryFileSystem();
  fs.seed('f1', new Blob([pdfBytes as BlobPart], { type: 'application/pdf' }));

  await assert.rejects(
    () => run({ inputIds: ['f1'], fs }),
    (error) =>
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: unknown }).code === 'OCR_PDF_RASTERIZER_MISSING',
  );
});

test('ocr-pdf logic rejects searchable-pdf format when no page layers available', async () => {
  const pdfBytes = await createBlankPdf();
  const fs = new InMemoryFileSystem();
  fs.seed('f1', new Blob([pdfBytes as BlobPart], { type: 'application/pdf' }));

  await assert.rejects(
    () => run({ inputIds: ['f1'], fs, options: { outputFormat: 'searchable-pdf' } }),
    (error) => {
      const msg = error instanceof Error ? error.message : String(error);
      return msg.includes('no page layers') || (error as { code?: unknown }).code === 'OCR_PDF_RASTERIZER_MISSING';
    },
  );
});

// Image-input path is excluded from unit tests because tesseract.js resolves
// vendor worker paths that only exist in the browser build. Integration-tested via e2e.
