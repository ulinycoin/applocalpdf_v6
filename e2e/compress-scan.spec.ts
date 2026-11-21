/**
 * End-to-end guards for the Compress image paths.
 *
 * Scans are usually Flate images (often with a PNG predictor), and for a long time the engine only
 * re-encoded JPEG (`DCTDecode`), so the files users open Compress for came back almost unchanged.
 * These tests build high-resolution images in the PDF itself, run the real Studio panel in Chromium
 * and check the bytes that actually reach the user: much smaller and still loadable.
 */
import { test, expect } from '@playwright/test';
import { existsSync, unlinkSync, writeFileSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';
import { PDFDocument, PDFName, PDFNumber, PDFRawStream } from 'pdf-lib';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface ScanOptions {
  name: string;
  width?: number;
  height?: number;
  /** Store rows with a PNG `/Predictor 15` (filter "Up"), the layout HTML-to-PDF produces. */
  predictor?: boolean;
  /** Add a 1-bit bilevel image, which must survive untouched. */
  bilevel?: boolean;
}

/**
 * A one-page PDF whose only content is an 8-bit RGB image. Deterministic noise is deliberate: it is
 * what Flate cannot compress, so the test measures the re-encode rather than a lucky repeating pattern.
 */
async function createScanPdf(options: ScanOptions): Promise<{ path: string; bytes: number; bilevel?: Uint8Array }> {
  const width = options.width ?? 1600;
  const height = options.height ?? 1200;
  const path = join(__dirname, `compress-${options.name}.pdf`);

  const raw = new Uint8Array(width * height * 3);
  let state = 0x9e3779b9;
  for (let i = 0; i < raw.length; i += 1) {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    raw[i] = state & 0xff;
  }

  let stored = raw;
  if (options.predictor) {
    const rowBytes = width * 3;
    const encoded = new Uint8Array(height * (rowBytes + 1));
    for (let row = 0; row < height; row += 1) {
      encoded[row * (rowBytes + 1)] = 2;
      for (let i = 0; i < rowBytes; i += 1) {
        const up = row > 0 ? raw[(row - 1) * rowBytes + i] : 0;
        encoded[row * (rowBytes + 1) + 1 + i] = (raw[row * rowBytes + i] - up) & 0xff;
      }
    }
    stored = encoded;
  }
  const compressed = new Uint8Array(deflateSync(stored, { level: 6 }));

  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);

  const image = doc.context.stream(compressed, {});
  image.dict.set(PDFName.of('Type'), PDFName.of('XObject'));
  image.dict.set(PDFName.of('Subtype'), PDFName.of('Image'));
  image.dict.set(PDFName.of('Width'), PDFNumber.of(width));
  image.dict.set(PDFName.of('Height'), PDFNumber.of(height));
  image.dict.set(PDFName.of('ColorSpace'), PDFName.of('DeviceRGB'));
  image.dict.set(PDFName.of('BitsPerComponent'), PDFNumber.of(8));
  image.dict.set(PDFName.of('Filter'), PDFName.of('FlateDecode'));
  if (options.predictor) {
    image.dict.set(PDFName.of('DecodeParms'), doc.context.obj({
      Predictor: 15,
      Colors: 3,
      Columns: width,
    }));
  }
  const imageRef = doc.context.register(image);

  const resources = page.node.Resources() ?? doc.context.obj({});
  const xobjects = doc.context.obj({});
  xobjects.set(PDFName.of('Im0'), imageRef);
  resources.set(PDFName.of('XObject'), xobjects);
  page.node.set(PDFName.of('Resources'), resources);

  let bilevel: Uint8Array | undefined;
  if (options.bilevel) {
    // A 400x300 bilevel page: the shape of a fax-like scan, where JPEG would only make the file larger.
    const bilevelWidth = 400;
    const bilevelHeight = 300;
    const rowBytes = Math.ceil(bilevelWidth / 8);
    const packed = new Uint8Array(rowBytes * bilevelHeight);
    for (let i = 0; i < packed.length; i += 1) {
      packed[i] = (i * 53 + 17) & 0xff;
    }
    bilevel = new Uint8Array(deflateSync(packed, { level: 6 }));
    const mono = doc.context.stream(bilevel, {});
    mono.dict.set(PDFName.of('Type'), PDFName.of('XObject'));
    mono.dict.set(PDFName.of('Subtype'), PDFName.of('Image'));
    mono.dict.set(PDFName.of('Width'), PDFNumber.of(bilevelWidth));
    mono.dict.set(PDFName.of('Height'), PDFNumber.of(bilevelHeight));
    mono.dict.set(PDFName.of('ColorSpace'), PDFName.of('DeviceGray'));
    mono.dict.set(PDFName.of('BitsPerComponent'), PDFNumber.of(1));
    mono.dict.set(PDFName.of('Filter'), PDFName.of('FlateDecode'));
    xobjects.set(PDFName.of('Bi0'), doc.context.register(mono));
    const withBilevel = doc.context.stream('q 595 0 0 842 0 0 cm /Im0 Do Q q 100 0 0 75 20 20 cm /Bi0 Do Q', {});
    page.node.set(PDFName.of('Contents'), doc.context.register(withBilevel));
  } else {
    const content = doc.context.stream('q 595 0 0 842 0 0 cm /Im0 Do Q', {});
    page.node.set(PDFName.of('Contents'), doc.context.register(content));
  }

  const bytes = await doc.save({ useObjectStreams: false });
  writeFileSync(path, bytes);
  return { path, bytes: bytes.byteLength, bilevel };
}

function removeFile(path: string): void {
  if (existsSync(path)) {
    unlinkSync(path);
  }
}

async function uploadAndOpenCompress(page: import('@playwright/test').Page, path: string): Promise<void> {
  await page.goto('/app/studio');
  await page.locator('input[type="file"]').first().setInputFiles(path);
  await expect.poll(
    async () => await page.evaluate(() => {
      const store = (window as unknown as { __LOCALPDF_STUDIO_STORE__?: { getState: () => { documents: unknown[] } } }).__LOCALPDF_STUDIO_STORE__;
      return store?.getState().documents.length ?? -1;
    }),
    { timeout: 90_000 },
  ).toBe(1);
  await page.getByRole('button', { name: 'Compress', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Compress PDF', exact: true })).toBeVisible({ timeout: 30_000 });
}

async function runAndDownload(page: import('@playwright/test').Page): Promise<{ path: string; size: number; pages: number; bytes: Uint8Array }> {
  await page.getByRole('button', { name: 'Compress PDF', exact: true }).click();

  const outputRow = page.locator('.cvt-output-row');
  await expect(outputRow).toBeVisible({ timeout: 120_000 });

  const downloadStarted = page.waitForEvent('download', { timeout: 60_000 });
  await outputRow.getByRole('button', { name: 'Download', exact: true }).click();
  const download = await downloadStarted;
  const savedPath = await download.path();
  expect(savedPath).toBeTruthy();

  const savedBytes = new Uint8Array(await readFile(savedPath!));
  const parsed = await PDFDocument.load(savedBytes);
  return { path: savedPath!, size: (await stat(savedPath!)).size, pages: parsed.getPageCount(), bytes: savedBytes };
}

/** Finds the 1-bit image streams of a document, so a test can prove they were not rasterised. */
async function bilevelStreams(bytes: Uint8Array): Promise<Uint8Array[]> {
  const doc = await PDFDocument.load(bytes);
  const streams: Uint8Array[] = [];
  for (const [, object] of doc.context.enumerateIndirectObjects()) {
    if (object instanceof PDFRawStream && object.dict.get(PDFName.of('BitsPerComponent'))?.toString() === '1') {
      streams.push(object.contents.slice());
    }
  }
  return streams;
}

test('Compress shrinks a high-resolution Flate scan and leaves a bilevel image untouched', async ({ page }) => {
  const scan = await createScanPdf({ name: 'flate-scan', bilevel: true });

  try {
    await uploadAndOpenCompress(page, scan.path);
    const result = await runAndDownload(page);

    expect(result.pages).toBe(1);
    // The Flate image dominates this file, so a working re-encode must beat it by a wide margin.
    expect(result.size).toBeLessThan(scan.bytes * 0.5);

    // 1-bit pages are preserved byte-for-byte: JPEG would make them larger and a browser cannot emit CCITT.
    const preserved = await bilevelStreams(result.bytes);
    expect(preserved.length).toBe(1);
    expect(Buffer.from(preserved[0]).equals(Buffer.from(scan.bilevel!))).toBe(true);
  } finally {
    removeFile(scan.path);
  }
});

test('Compress handles a Flate image stored with a PNG predictor', async ({ page }) => {
  const scan = await createScanPdf({ name: 'predictor-scan', width: 1200, height: 900, predictor: true });

  try {
    await uploadAndOpenCompress(page, scan.path);
    const result = await runAndDownload(page);

    expect(result.pages).toBe(1);
    expect(result.size).toBeLessThan(scan.bytes * 0.5);
  } finally {
    removeFile(scan.path);
  }
});

test('a target size is met by lowering the preset, and the result says so', async ({ page }) => {
  const scan = await createScanPdf({ name: 'target-scan' });
  const targetMb = 0.1;

  try {
    await uploadAndOpenCompress(page, scan.path);
    await page.getByLabel('Target size in megabytes').fill(String(targetMb));
    const result = await runAndDownload(page);

    console.log(`target=${targetMb}MB input=${scan.bytes} output=${result.size}`);
    expect(result.pages).toBe(1);
    expect(result.size).toBeLessThan(targetMb * 1024 * 1024);
    await expect(page.getByText(/Fits the .* target\./u)).toBeVisible({ timeout: 10_000 });
  } finally {
    removeFile(scan.path);
  }
});
