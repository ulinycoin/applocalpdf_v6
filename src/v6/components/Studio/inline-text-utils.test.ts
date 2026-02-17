import test from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import {
  estimateInlineFontSizePt,
  findNearestTextSpan,
  fitTextToWidth,
  mergeTextLine,
  normalizeFontName,
  resolveFontFamily,
} from './inline-text-utils';

test('normalizeFontName strips subset prefix and punctuation', () => {
  assert.equal(normalizeFontName('ABCDEE+Times-Roman'), 'timesroman');
  assert.equal(normalizeFontName(' Helvetica-Bold '), 'helveticabold');
});

test('resolveFontFamily uses exact and heuristic fallback mapping', () => {
  assert.equal(resolveFontFamily('ABCDEE+Times-Roman'), 'times');
  assert.equal(resolveFontFamily('CourierNewPSMT'), 'mono');
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

test('fitTextToWidth reduces font size/tracking for long text', async () => {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fit = fitTextToWidth(font, 'This line is definitely too long', 100, 24, 8);

  assert.ok(fit.fontSize <= 24);
  assert.ok(fit.tracking <= 0);
});
