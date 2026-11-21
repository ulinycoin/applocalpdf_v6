import assert from 'node:assert/strict';
import test from 'node:test';
import { deflateSync } from 'node:zlib';
import { PDFDocument, PDFName, PDFNumber, PDFRawStream, StandardFonts } from 'pdf-lib';
import { PdfLibCompressEngine, classifyImage, decodeFlateImageSamples, unfilterPngRows } from './compress-engine';

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

// --- Flate image path -------------------------------------------------------
// The Flate branch is what makes scanned PDFs smaller; the canvas re-encode itself only runs in a
// browser, so these tests pin the part that decides safety and sample layout.

async function makeDocument(): Promise<PDFDocument> {
  const doc = await PDFDocument.create();
  doc.addPage([400, 300]);
  return doc;
}

function samples(width: number, height: number, channels: 1 | 3): Uint8Array {
  // Deterministic noise, not a gradient: a periodic pattern deflates to almost nothing and would
  // hide the size thresholds this suite is about.
  const raw = new Uint8Array(width * height * channels);
  let state = 0x12345678;
  for (let i = 0; i < raw.length; i += 1) {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    raw[i] = state & 0xff;
  }
  return raw;
}

function imageStream(
  doc: PDFDocument,
  options: {
    width: number;
    height: number;
    channels?: 1 | 3;
    bitsPerComponent?: number;
    filter?: 'FlateDecode' | 'DCTDecode';
    bytes?: Uint8Array;
    decodeParms?: boolean | Record<string, number>;
  },
): PDFRawStream {
  const channels = options.channels ?? 3;
  const raw = samples(options.width, options.height, channels);
  const bytes = options.bytes ?? new Uint8Array(deflateSync(raw));
  const stream = doc.context.stream(bytes, {});
  stream.dict.set(PDFName.of('Subtype'), PDFName.of('Image'));
  stream.dict.set(PDFName.of('Width'), PDFNumber.of(options.width));
  stream.dict.set(PDFName.of('Height'), PDFNumber.of(options.height));
  stream.dict.set(PDFName.of('ColorSpace'), PDFName.of(channels === 1 ? 'DeviceGray' : 'DeviceRGB'));
  stream.dict.set(PDFName.of('BitsPerComponent'), PDFNumber.of(options.bitsPerComponent ?? 8));
  stream.dict.set(PDFName.of('Filter'), PDFName.of(options.filter ?? 'FlateDecode'));
  if (options.decodeParms) {
    const params = options.decodeParms === true
      ? { Predictor: 15, Colors: channels, Columns: options.width }
      : options.decodeParms;
    stream.dict.set(PDFName.of('DecodeParms'), doc.context.obj(params));
  }
  return stream;
}

test('flate samples are inflated back into the image layout', async () => {
  const doc = await makeDocument();
  const width = 64;
  const height = 32;
  const stream = imageStream(doc, { width, height });

  const decoded = await decodeFlateImageSamples(stream);
  assert.ok(decoded);
  assert.equal(decoded.width, width);
  assert.equal(decoded.height, height);
  assert.equal(decoded.channels, 3);
  assert.deepEqual(Array.from(decoded.samples), Array.from(samples(width, height, 3)));
});

test('a grayscale flate image keeps one channel', async () => {
  const doc = await makeDocument();
  const stream = imageStream(doc, { width: 32, height: 16, channels: 1 });

  const decoded = await decodeFlateImageSamples(stream);
  assert.ok(decoded);
  assert.equal(decoded.channels, 1);
  assert.equal(decoded.samples.length, 32 * 16);
});

test('a truncated flate stream is refused instead of producing a broken image', async () => {
  const doc = await makeDocument();
  const stream = imageStream(doc, { width: 64, height: 32, bytes: new Uint8Array(deflateSync(samples(8, 8, 3))) });

  assert.equal(await decodeFlateImageSamples(stream), null);
});

test('bilevel images are preserved and unsupported predictors are refused', async () => {
  const doc = await makeDocument();
  const oneBit = imageStream(doc, { width: 64, height: 32, bitsPerComponent: 1 });
  const tiffPredictor = imageStream(doc, { width: 64, height: 32, decodeParms: { Predictor: 2 } });
  const mismatchedColumns = imageStream(doc, {
    width: 64,
    height: 32,
    decodeParms: { Predictor: 15, Colors: 3, Columns: 999 },
  });

  assert.equal(classifyImage(oneBit), 'preserve');
  assert.equal(await decodeFlateImageSamples(oneBit), null);
  assert.equal(classifyImage(tiffPredictor), null);
  assert.equal(await decodeFlateImageSamples(mismatchedColumns), null);
});

test('only safe photos are classified for re-encoding', async () => {
  const doc = await makeDocument();
  const flatePhoto = imageStream(doc, { width: 200, height: 150 });
  const smallFlate = imageStream(doc, { width: 20, height: 20 });
  const oneBitFlate = imageStream(doc, { width: 200, height: 150, bitsPerComponent: 1 });
  const predictorFlate = imageStream(doc, { width: 200, height: 150, decodeParms: true });
  const jpegPhoto = imageStream(doc, {
    width: 200,
    height: 150,
    filter: 'DCTDecode',
    bytes: new Uint8Array(25 * 1024),
  });

  assert.equal(classifyImage(flatePhoto), 'flate');
  assert.equal(classifyImage(smallFlate), null);
  assert.equal(classifyImage(oneBitFlate), 'preserve');
  assert.equal(classifyImage(predictorFlate), 'flate');
  assert.equal(classifyImage(jpegPhoto), 'jpeg');
});

function encodePngRows(raw: Uint8Array, width: number, height: number, channels: 1 | 3): Uint8Array {
  const rowBytes = width * channels;
  const encoded = new Uint8Array(height * (rowBytes + 1));
  for (let row = 0; row < height; row += 1) {
    // Filter 2 (Up) on every row: the predictor a PNG-ish producer actually emits.
    encoded[row * (rowBytes + 1)] = 2;
    for (let i = 0; i < rowBytes; i += 1) {
      const up = row > 0 ? raw[(row - 1) * rowBytes + i] : 0;
      encoded[row * (rowBytes + 1) + 1 + i] = (raw[row * rowBytes + i] - up) & 0xff;
    }
  }
  return encoded;
}

test('png predictor rows are unfiltered back into the original samples', async () => {
  const doc = await makeDocument();
  const width = 48;
  const height = 24;
  const raw = samples(width, height, 3);
  const stream = imageStream(doc, {
    width,
    height,
    bytes: new Uint8Array(deflateSync(encodePngRows(raw, width, height, 3))),
    decodeParms: { Predictor: 15, Colors: 3, Columns: width },
  });

  const decoded = await decodeFlateImageSamples(stream);
  assert.ok(decoded);
  assert.deepEqual(Array.from(decoded.samples), Array.from(raw));
});

test('every PNG row filter type round-trips through the unfilter', () => {
  const width = 8;
  const channels = 1;
  const rowBytes = width * channels;
  const raw = new Uint8Array(rowBytes * 5);
  for (let i = 0; i < raw.length; i += 1) {
    raw[i] = (i * 37 + 11) & 0xff;
  }
  const paethEncoder = (left: number, up: number, upLeft: number): number => {
    const estimate = left + up - upLeft;
    const toLeft = Math.abs(estimate - left);
    const toUp = Math.abs(estimate - up);
    const toUpLeft = Math.abs(estimate - upLeft);
    if (toLeft <= toUp && toLeft <= toUpLeft) return left;
    return toUp <= toUpLeft ? up : upLeft;
  };
  const encoded = new Uint8Array(5 * (rowBytes + 1));
  for (let row = 0; row < 5; row += 1) {
    encoded[row * (rowBytes + 1)] = row; // None, Sub, Up, Average, Paeth
    for (let i = 0; i < rowBytes; i += 1) {
      const value = raw[row * rowBytes + i];
      const left = i > 0 ? raw[row * rowBytes + i - 1] : 0;
      const up = row > 0 ? raw[(row - 1) * rowBytes + i] : 0;
      const upLeft = row > 0 && i > 0 ? raw[(row - 1) * rowBytes + i - 1] : 0;
      let predicted = 0;
      if (row === 1) predicted = left;
      else if (row === 2) predicted = up;
      else if (row === 3) predicted = Math.floor((left + up) / 2);
      else if (row === 4) predicted = paethEncoder(left, up, upLeft);
      encoded[row * (rowBytes + 1) + 1 + i] = (value - predicted) & 0xff;
    }
  }

  assert.deepEqual(Array.from(unfilterPngRows(encoded, 5, rowBytes) ?? []), Array.from(raw));
});

test('a target size walks the preset ladder and never returns a bigger file', async () => {
  const engine = new PdfLibCompressEngine();
  const source = await buildPdf();
  const passes: number[] = [];

  const result = await engine.compress(new Blob([pdfPart(source)], { type: 'application/pdf' }), {
    quality: 'medium',
    targetBytes: 1,
    onProgress: (progress) => passes.push(progress.pass),
  });
  const output = new Uint8Array(await result.arrayBuffer());

  assert.ok(output.byteLength <= source.byteLength, 'a target size must never grow the file');
  const loaded = await PDFDocument.load(output);
  assert.equal(loaded.getPageCount(), 1);
  assert.deepEqual(passes, [1, 2, 3, 4, 5, 6], 'the ladder runs every preset when nothing can fit');
});
