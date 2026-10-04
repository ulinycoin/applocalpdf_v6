import assert from 'node:assert/strict';
import test from 'node:test';
import { PDFDocument, PDFName, StandardFonts } from 'pdf-lib';
import { decodePageStreamToLatin1 } from './pdf-content-stream-decode';

async function createFlateEncodedPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText('DECODE SAMPLE LINE', { x: 80, y: 700, size: 24, font });
  const bytes = await doc.save();
  const stable = new Uint8Array(bytes.byteLength);
  stable.set(bytes);
  return stable;
}

function firstContentStream(pdf: PDFDocument): { getContents: () => Uint8Array } {
  const page = pdf.getPage(0);
  const contents = pdf.context.lookup(page.node.get(PDFName.of('Contents')) as never) as unknown as {
    size: () => number;
    get: (index: number) => unknown;
  };
  return pdf.context.lookup(contents.get(0) as never) as unknown as { getContents: () => Uint8Array };
}

test('decodes a FlateDecode page content stream to its text operators', { timeout: 20000 }, async () => {
  const pdf = await PDFDocument.load(await createFlateEncodedPdf());
  const decoded = await decodePageStreamToLatin1(firstContentStream(pdf));

  assert.ok(decoded, 'expected a decoded content stream');
  assert.match(decoded, /\bTj\b/u, 'expected the text-showing operator to survive decoding');
  // pdf-lib writes the run as a hex string, so the sample text is asserted in its encoded form.
  assert.ok(
    decoded.includes(Buffer.from('DECODE SAMPLE LINE').toString('hex').toUpperCase()),
    'expected the encoded sample text to survive decoding',
  );
});

test('ignores getUnencodedContents that returns still-compressed bytes', { timeout: 20000 }, async () => {
  const pdf = await PDFDocument.load(await createFlateEncodedPdf());
  const stream = firstContentStream(pdf);
  const compressed = stream.getContents();
  // pdf-lib exposes this accessor on decoded streams; on a raw stream it hands back the encoded bytes.
  const streamWithUnencodedAccessor = {
    getContents: () => compressed,
    getUnencodedContents: () => compressed,
  };

  const decoded = await decodePageStreamToLatin1(streamWithUnencodedAccessor);

  assert.ok(decoded, 'expected the compressed accessor result to be rejected and inflated instead');
  assert.ok(
    decoded.includes(Buffer.from('DECODE SAMPLE LINE').toString('hex').toUpperCase()),
    'expected the encoded sample text to survive decoding',
  );
});
