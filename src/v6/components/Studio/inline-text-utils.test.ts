import test from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import {
  estimateInlineFontSizePt,
  findNearestTextSpan,
  fitTextToWidth,
  mergeTextLine,
  normalizeFontName,
  normalizeTextLayerSpans,
  resolveFontFamily,
} from './inline-text-utils';

test('normalizeFontName strips subset prefix and punctuation', () => {
  assert.equal(normalizeFontName('ABCDEE+Times-Roman'), 'timesroman');
  assert.equal(normalizeFontName(' Helvetica-Bold '), 'helveticabold');
});

test('resolveFontFamily uses exact and heuristic fallback mapping', () => {
  assert.equal(resolveFontFamily('ABCDEE+Times-Roman'), 'times');
  assert.equal(resolveFontFamily('CourierNewPSMT'), 'mono');
  assert.equal(resolveFontFamily('NotoSansArabic-Regular'), 'noto-arabic');
  assert.equal(resolveFontFamily('NotoSansSC-Regular'), 'noto-cjk');
  assert.equal(resolveFontFamily('NotoSansDevanagari-Regular'), 'noto-devanagari');
  assert.equal(resolveFontFamily('UnknownFont', 'sans-serif'), 'sora');
  assert.equal(resolveFontFamily(undefined, undefined), 'sora');
});

test('estimateInlineFontSizePt scales from ratio and clamps to bounds', () => {
  assert.equal(estimateInlineFontSizePt(0.02, 800), 16);
  assert.equal(estimateInlineFontSizePt(0.0001, 800), 8);
  assert.equal(estimateInlineFontSizePt(0.5, 1200), 96);
});

test('findNearestTextSpan selects closest span within threshold', () => {
  const spans = [
    { id: 'a', text: 'A', xRatio: 0.1, yRatio: 0.1, widthRatio: 0.1, heightRatio: 0.03, fontSizeRatio: 0.02 },
    { id: 'b', text: 'B', xRatio: 0.5, yRatio: 0.5, widthRatio: 0.1, heightRatio: 0.03, fontSizeRatio: 0.02 },
  ];

  const hitA = findNearestTextSpan({ x: 0.11, y: 0.11 }, spans, 0.02);
  const miss = findNearestTextSpan({ x: 0.9, y: 0.9 }, spans, 0.02);

  assert.equal(hitA?.id, 'a');
  assert.equal(miss, null);
});

test('mergeTextLine joins spans and keeps spaces for gaps', () => {
  const spans = [
    { id: '1', text: 'Hello', xRatio: 0.1, yRatio: 0.2, widthRatio: 0.09, heightRatio: 0.03, fontSizeRatio: 0.02 },
    { id: '2', text: 'World', xRatio: 0.205, yRatio: 0.2, widthRatio: 0.09, heightRatio: 0.03, fontSizeRatio: 0.02 },
  ];

  const merged = mergeTextLine(spans, spans[0]);
  assert.ok(merged);
  assert.equal(merged?.text, 'Hello World');
});

test('mergeTextLine avoids concatenating distant duplicate run on same baseline', () => {
  const spans = [
    { id: 'a1', text: 'LocalPDF', xRatio: 0.1, yRatio: 0.2, widthRatio: 0.12, heightRatio: 0.03, fontSizeRatio: 0.02 },
    { id: 'a2', text: 'Browser', xRatio: 0.23, yRatio: 0.2, widthRatio: 0.11, heightRatio: 0.03, fontSizeRatio: 0.02 },
    { id: 'a3', text: 'Extension', xRatio: 0.35, yRatio: 0.2, widthRatio: 0.13, heightRatio: 0.03, fontSizeRatio: 0.02 },
    // Simulate repeated run on same baseline after a previous save.
    { id: 'b1', text: 'LocalPDF', xRatio: 0.62, yRatio: 0.2, widthRatio: 0.12, heightRatio: 0.03, fontSizeRatio: 0.02 },
    { id: 'b2', text: 'Browser', xRatio: 0.75, yRatio: 0.2, widthRatio: 0.11, heightRatio: 0.03, fontSizeRatio: 0.02 },
  ];

  const merged = mergeTextLine(spans, spans[0]);
  assert.ok(merged);
  assert.equal(merged?.text, 'LocalPDF Browser Extension');
});

test('mergeTextLine stops on shifted restart of the same line token', () => {
  const spans = [
    { id: 'a1', text: 'Privacy-First', xRatio: 0.1, yRatio: 0.2, widthRatio: 0.14, heightRatio: 0.03, fontSizeRatio: 0.02 },
    { id: 'a2', text: 'PDF', xRatio: 0.245, yRatio: 0.2, widthRatio: 0.05, heightRatio: 0.03, fontSizeRatio: 0.02 },
    { id: 'a3', text: 'Processing', xRatio: 0.3, yRatio: 0.2, widthRatio: 0.12, heightRatio: 0.03, fontSizeRatio: 0.02 },
    // Shifted duplicate run starts with same first token, but gap is still below cluster split threshold.
    { id: 'b1', text: 'Privacy-First', xRatio: 0.45, yRatio: 0.2, widthRatio: 0.14, heightRatio: 0.03, fontSizeRatio: 0.02 },
    { id: 'b2', text: 'PDF', xRatio: 0.595, yRatio: 0.2, widthRatio: 0.05, heightRatio: 0.03, fontSizeRatio: 0.02 },
  ];

  const merged = mergeTextLine(spans, spans[0]);
  assert.ok(merged);
  assert.equal(merged?.text, 'Privacy-First PDF Processing');
});

test('mergeTextLine stops on shifted restart with repeated non-first token', () => {
  const spans = [
    { id: 'a1', text: 'Now', xRatio: 0.1, yRatio: 0.2, widthRatio: 0.08, heightRatio: 0.03, fontSizeRatio: 0.02 },
    { id: 'a2', text: 'text', xRatio: 0.185, yRatio: 0.2, widthRatio: 0.06, heightRatio: 0.03, fontSizeRatio: 0.02 },
    { id: 'a3', text: 'applies', xRatio: 0.25, yRatio: 0.2, widthRatio: 0.11, heightRatio: 0.03, fontSizeRatio: 0.02 },
    // Duplicate run starts from the second token after several edit/save passes.
    { id: 'b1', text: 'text', xRatio: 0.43, yRatio: 0.2, widthRatio: 0.06, heightRatio: 0.03, fontSizeRatio: 0.02 },
    { id: 'b2', text: 'applies', xRatio: 0.495, yRatio: 0.2, widthRatio: 0.11, heightRatio: 0.03, fontSizeRatio: 0.02 },
  ];

  const merged = mergeTextLine(spans, spans[0]);
  assert.ok(merged);
  assert.equal(merged?.text, 'Now text applies');
});

test('mergeTextLine splits medium-gap shifted duplicate run after repeated saves', () => {
  const spans = [
    { id: 'a1', text: 'LocalPDF', xRatio: 0.1, yRatio: 0.2, widthRatio: 0.11, heightRatio: 0.03, fontSizeRatio: 0.02 },
    { id: 'a2', text: 'Browser', xRatio: 0.215, yRatio: 0.2, widthRatio: 0.1, heightRatio: 0.03, fontSizeRatio: 0.02 },
    { id: 'a3', text: 'Extension', xRatio: 0.32, yRatio: 0.2, widthRatio: 0.11, heightRatio: 0.03, fontSizeRatio: 0.02 },
    // Third-cycle shifted duplicate starts after medium gap (~0.026).
    { id: 'b1', text: 'LocalPDF', xRatio: 0.456, yRatio: 0.2, widthRatio: 0.11, heightRatio: 0.03, fontSizeRatio: 0.02 },
    { id: 'b2', text: 'Browser', xRatio: 0.571, yRatio: 0.2, widthRatio: 0.1, heightRatio: 0.03, fontSizeRatio: 0.02 },
  ];

  const merged = mergeTextLine(spans, spans[0]);
  assert.ok(merged);
  assert.equal(merged?.text, 'LocalPDF Browser Extension');
});

test('mergeTextLine trims a duplicated line suffix after save-and-reselect', () => {
  const spans = [
    { id: 'a1', text: 'Edit', xRatio: 0.1, yRatio: 0.2, widthRatio: 0.06, heightRatio: 0.03, fontSizeRatio: 0.02 },
    { id: 'a2', text: 'this', xRatio: 0.165, yRatio: 0.2, widthRatio: 0.07, heightRatio: 0.03, fontSizeRatio: 0.02 },
    { id: 'a3', text: 'line', xRatio: 0.24, yRatio: 0.2, widthRatio: 0.07, heightRatio: 0.03, fontSizeRatio: 0.02 },
    { id: 'b1', text: 'Edit', xRatio: 0.36, yRatio: 0.2, widthRatio: 0.06, heightRatio: 0.03, fontSizeRatio: 0.02 },
    { id: 'b2', text: 'this', xRatio: 0.425, yRatio: 0.2, widthRatio: 0.07, heightRatio: 0.03, fontSizeRatio: 0.02 },
    { id: 'b3', text: 'line', xRatio: 0.5, yRatio: 0.2, widthRatio: 0.07, heightRatio: 0.03, fontSizeRatio: 0.02 },
  ];

  const merged = mergeTextLine(spans, spans[0]);
  assert.ok(merged);
  assert.equal(merged?.text, 'Edit this line');
});

test('mergeTextLine collapses overlapping duplicate spans from visual fallback', () => {
  const spans = [
    { id: 'a1', text: 'Edit this line', xRatio: 0.1, yRatio: 0.2, widthRatio: 0.18, heightRatio: 0.03, fontSizeRatio: 0.02 },
    { id: 'a2', text: 'Edit this line', xRatio: 0.1, yRatio: 0.2004, widthRatio: 0.18, heightRatio: 0.03, fontSizeRatio: 0.02 },
  ];

  const merged = mergeTextLine(spans, spans[0]);
  assert.ok(merged);
  assert.equal(merged?.text, 'Edit this line');
});

test('mergeTextLine stops a partial restart run that repeats the first token', () => {
  const spans = [
    { id: 'a1', text: 'LocalPDF', xRatio: 0.1, yRatio: 0.2, widthRatio: 0.08, heightRatio: 0.03, fontSizeRatio: 0.02 },
    { id: 'a2', text: 'Browser', xRatio: 0.18, yRatio: 0.2, widthRatio: 0.09, heightRatio: 0.03, fontSizeRatio: 0.02 },
    { id: 'a3', text: 'Extension', xRatio: 0.27, yRatio: 0.2, widthRatio: 0.1, heightRatio: 0.03, fontSizeRatio: 0.02 },
    { id: 'b1', text: 'LocalPDF', xRatio: 0.37, yRatio: 0.2, widthRatio: 0.08, heightRatio: 0.03, fontSizeRatio: 0.02 },
    { id: 'b2', text: 'Extension', xRatio: 0.45, yRatio: 0.2, widthRatio: 0.1, heightRatio: 0.03, fontSizeRatio: 0.02 },
  ];

  const merged = mergeTextLine(spans, spans[0]);
  assert.ok(merged);
  assert.equal(merged?.text, 'LocalPDFBrowserExtension');
});

test('normalizeTextLayerSpans removes overlapping duplicate spans', () => {
  const spans = [
    { id: 'a1', text: 'Edit this line', xRatio: 0.1, yRatio: 0.2, widthRatio: 0.18, heightRatio: 0.03, fontSizeRatio: 0.02 },
    { id: 'a2', text: 'Edit this line', xRatio: 0.1003, yRatio: 0.2002, widthRatio: 0.1802, heightRatio: 0.0301, fontSizeRatio: 0.02 },
    { id: 'b1', text: 'Other line', xRatio: 0.1, yRatio: 0.3, widthRatio: 0.12, heightRatio: 0.03, fontSizeRatio: 0.02 },
  ];

  const normalized = normalizeTextLayerSpans(spans);
  assert.equal(normalized.length, 2);
  assert.deepEqual(normalized.map((span) => span.id), ['a1', 'b1']);
});

test('mergeTextLine ignores stacked overlay duplicate at same column', () => {
  const spans = [
    { id: 'old', text: 'Privacy-First PDF Processing', xRatio: 0.147, yRatio: 0.166, widthRatio: 0.34, heightRatio: 0.019, fontSizeRatio: 0.019 },
    { id: 'new', text: 'Privacy-First true PDF Processing', xRatio: 0.147, yRatio: 0.172, widthRatio: 0.36, heightRatio: 0.019, fontSizeRatio: 0.019 },
  ];

  const mergedFromOverlay = mergeTextLine(spans, spans[1]!);
  assert.ok(mergedFromOverlay);
  assert.equal(mergedFromOverlay?.text, 'Privacy-First true PDF Processing');
});

test('fitTextToWidth reduces font size/tracking for long text', async () => {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fit = fitTextToWidth(font, 'This line is definitely too long', 100, 24, 8);

  assert.ok(fit.fontSize <= 24);
  assert.ok(fit.tracking <= 0);
});
