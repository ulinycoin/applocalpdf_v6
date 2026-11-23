import assert from 'node:assert/strict';
import test from 'node:test';
import { PDFDict, PDFDocument, PDFName } from 'pdf-lib';
import { drawHiddenText } from './hidden-text';
import { readCodeFont } from './cid-text';
import { extractEmbeddedPdfText } from '../pdf-text-extractor';
import { extractTextLayerForPreview } from '../pdf-text-layer-extractor';

function toBlob(bytes: Uint8Array): Blob {
  return new Blob([bytes as BlobPart]);
}

/** A4 page with the click baseline the applier uses for overlays. */
async function pageWithHiddenRun(text: string, fontSize = 24) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]);
  const drew = drawHiddenText(pdf, page, {
    text,
    advancesPt: [...text].map((character) => (character === ' ' ? fontSize * 0.25 : fontSize)),
    fontSize,
    x: 72,
    y: 700,
  });
  assert.equal(drew, true);
  const bytes = new Uint8Array(await pdf.save());
  return { bytes, pdf, page };
}

test('hidden text is extractable and keeps its words spaced like the run', async () => {
  const { bytes } = await pageWithHiddenRun('請求書 2026 新しい');
  const text = (await extractEmbeddedPdfText(toBlob(bytes)))?.text ?? '';
  assert.equal(text, '請求書 2026 新しい');
});

test('hidden text is invisible on the page but present in the text layer', async () => {
  const { bytes } = await pageWithHiddenRun('請求書 2026');
  const layer = await extractTextLayerForPreview(bytes, 1, 1);
  const span = layer.spans.find((candidate) => candidate.text.includes('請求書'));
  assert.ok(span, 'the run must be selectable again');
  assert.equal(span.text, '請求書 2026');
  // 72pt from the left on a 595pt page; the baseline sits near the top of an 842pt page.
  assert.ok(Math.abs(span.xRatio - 72 / 595) < 0.01, `x ratio ${span.xRatio}`);
  assert.ok(span.yRatio > 0.02 && span.yRatio < 0.2, `y ratio ${span.yRatio}`);
});

test('a later edit refuses to patch the hidden font instead of erasing it', async () => {
  const { bytes, page } = await pageWithHiddenRun('日本語');
  const reloaded = await PDFDocument.load(bytes);
  const resources = reloaded.getPages()[0].node.Resources();
  assert.ok(resources, 'expected page resources');
  const fonts = resources.lookup(PDFName.of('Font'), PDFDict);
  const fontNames = fonts.keys().map((name) => name.asString().replace(/^\//u, ''));
  assert.equal(fontNames.length, 1);
  // Without a program the font is rejected on purpose: rewriting its codes would draw nothing and
  // leave the old bitmap on the page, so the applier has to fall back to the overlay path.
  assert.equal(await readCodeFont(reloaded, resources, fontNames[0]!), undefined);
  // The page dictionary still renders the run: the layer is real content, not metadata.
  assert.ok(page.node.Contents(), 'expected a content stream');
});

test('two raster runs on one page get their own font resources', async () => {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]);
  for (const [text, y] of [['請求書', 700], ['新しい', 660]] as const) {
    drawHiddenText(pdf, page, {
      text,
      advancesPt: [...text].map(() => 24),
      fontSize: 24,
      x: 72,
      y,
    });
  }
  const bytes = new Uint8Array(await pdf.save());
  const text = (await extractEmbeddedPdfText(toBlob(bytes)))?.text ?? '';
  assert.match(text, /請求書/u);
  assert.match(text, /新しい/u);

  const reloaded = await PDFDocument.load(bytes);
  const fonts = reloaded.getPages()[0].node.Resources()!.lookup(PDFName.of('Font'), PDFDict);
  assert.deepEqual(
    fonts.keys().map((name) => name.asString()).sort(),
    ['/GlyphlessText', '/GlyphlessText1'],
  );
});
