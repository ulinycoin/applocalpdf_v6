import assert from 'node:assert/strict';
import test from 'node:test';
import { buildOriginalRect, resolveTargetRect, textElementMovedFromOriginal } from './original-rect';
import { collectOperatorsForRedaction, collectOperatorsInRect, removeOperatorsFromContent } from './stream-redaction';
import { parsePdfTextOperators } from '../pdf-content-stream-parser';
import { filterTextLayerSpansByEditedElements, dedupeStackedTextLayerSpans } from './span-filter';
import { resolveTypographyFromElement, resolveFontSizeFromElement } from './font-resolve';

test('buildOriginalRect copies merged line bounds', () => {
  const rect = buildOriginalRect({ left: 0.1, top: 0.2, width: 0.3, height: 0.04 });
  assert.deepEqual(rect, { x: 0.1, y: 0.2, w: 0.3, h: 0.04 });
});

test('resolveTargetRect prefers originalRect over live position', () => {
  const rect = resolveTargetRect({
    x: 0.5,
    y: 0.5,
    w: 0.2,
    h: 0.05,
    originalRect: { x: 0.1, y: 0.2, w: 0.3, h: 0.04 },
  });
  assert.deepEqual(rect, { x: 0.1, y: 0.2, w: 0.3, h: 0.04 });
});

test('textElementMovedFromOriginal detects position drift', () => {
  assert.equal(textElementMovedFromOriginal({
    type: 'text',
    x: 0.1001,
    y: 0.2,
    originalRect: { x: 0.1, y: 0.2, w: 0.3, h: 0.04 },
  }), false);
  assert.equal(textElementMovedFromOriginal({
    type: 'text',
    x: 0.2,
    y: 0.2,
    originalRect: { x: 0.1, y: 0.2, w: 0.3, h: 0.04 },
  }), true);
});

test('removeOperatorsFromContent strips selected text operators', () => {
  const content = 'q BT 72 700 Td /F1 24 Tf (Hello) Tj ET Q';
  const operators = parsePdfTextOperators(content);
  assert.equal(operators.length, 1);
  const updated = removeOperatorsFromContent(content, operators);
  assert.doesNotMatch(updated, /Hello/u);
  assert.equal(parsePdfTextOperators(updated).length, 0);
});

test('collectOperatorsForRedaction keeps operators on one baseline only', () => {
  const topLine = 'BT 72 700 Td /F1 24 Tf (TOP LINE) Tj ET';
  const bottomLine = 'BT 72 640 Td /F1 24 Tf (BOTTOM LINE) Tj ET';
  const content = `${topLine}\n${bottomLine}`;
  const operators = parsePdfTextOperators(content);
  const decodedByStream = [{ index: 0, content, operators }];
  const topOperator = operators.find((operator) => operator.textSegments.join('').includes('TOP'));
  assert.ok(topOperator);

  const matches = collectOperatorsForRedaction({
    decodedByStream,
    pageWidth: 612,
    pageHeight: 792,
    rect: { x: 0.1, y: 0.114, w: 0.6, h: 0.08 },
    anchorOperator: topOperator,
    fontSizeRatio: 0.03,
  });

  assert.equal(matches.length, 1);
  assert.match(matches[0]?.operator.textSegments.join(''), /TOP LINE/u);
});

test('collectOperatorsInRect finds operator inside target bbox', () => {
  const content = 'BT 72 700 Td /F1 24 Tf (Hello) Tj ET';
  const operators = parsePdfTextOperators(content);
  const decodedByStream = [{ index: 0, content, operators }];
  const matches = collectOperatorsInRect({
    decodedByStream,
    pageWidth: 612,
    pageHeight: 792,
    rect: { x: 0.1, y: 0.11, w: 0.4, h: 0.08 },
  });
  assert.equal(matches.length, 1);
});

test('dedupeStackedTextLayerSpans keeps newest overlay at same column', () => {
  const spans = [
    { id: 'old', text: 'Privacy-First PDF Processing', xRatio: 0.147, yRatio: 0.166, widthRatio: 0.34, heightRatio: 0.019 },
    { id: 'new', text: 'Privacy-First true PDF Processing', xRatio: 0.147, yRatio: 0.172, widthRatio: 0.36, heightRatio: 0.019 },
  ];
  const deduped = dedupeStackedTextLayerSpans(spans);
  assert.equal(deduped.length, 1);
  assert.equal(deduped[0]?.id, 'new');
});

test('filterTextLayerSpansByEditedElements hides spans covered by edited regions', () => {
  const spans = [
    { id: 'a', text: 'Hello', xRatio: 0.1, yRatio: 0.2, widthRatio: 0.1, heightRatio: 0.03 },
    { id: 'b', text: 'Footer', xRatio: 0.1, yRatio: 0.8, widthRatio: 0.1, heightRatio: 0.03 },
  ];
  const filtered = filterTextLayerSpansByEditedElements(spans, [{
    type: 'text',
    originalRect: { x: 0.08, y: 0.18, w: 0.2, h: 0.06 },
  }]);
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0]?.id, 'b');
});

test('resolveTypographyFromElement preserves bold italic from source font name', () => {
  const typography = resolveTypographyFromElement({
    id: 't1',
    type: 'text',
    x: 0.1,
    y: 0.2,
    w: 0.3,
    h: 0.04,
    text: 'Sample',
    color: '#000000',
    fontSize: 12,
    fontFamily: 'times',
    fontWeight: 'bold',
    fontStyle: 'italic',
    textAlign: 'left',
    opacity: 1,
    sourceFontName: 'Times-BoldItalic',
    sourceFontFamilyHint: 'Times New Roman',
  });
  assert.equal(typography.fontFamily, 'times');
  assert.equal(typography.fontWeight, 'bold');
  assert.equal(typography.fontStyle, 'italic');
});

test('resolveTypographyFromElement prefers user font settings over source metadata', () => {
  const typography = resolveTypographyFromElement({
    id: 't2',
    type: 'text',
    x: 0.1,
    y: 0.2,
    w: 0.3,
    h: 0.04,
    text: 'Sample',
    color: '#000000',
    fontSize: 12,
    fontFamily: 'mono',
    fontWeight: 'normal',
    fontStyle: 'normal',
    textAlign: 'left',
    opacity: 1,
    sourceFontName: 'Times-BoldItalic',
    sourceFontFamilyHint: 'Times New Roman',
  });
  assert.equal(typography.fontFamily, 'mono');
  assert.equal(typography.fontWeight, 'normal');
  assert.equal(typography.fontStyle, 'normal');
});

test('resolveFontSizeFromElement prefers user font size when changed in settings', () => {
  assert.equal(resolveFontSizeFromElement({
    id: 't3',
    type: 'text',
    x: 0.1,
    y: 0.2,
    w: 0.3,
    h: 0.04,
    text: 'Sample',
    color: '#000000',
    fontSize: 24,
    fontFamily: 'sora',
    fontWeight: 'normal',
    fontStyle: 'normal',
    textAlign: 'left',
    opacity: 1,
    sourceFontSizeRatio: 0.018,
  }, 842), 24);
  assert.ok(Math.abs(resolveFontSizeFromElement({
    id: 't4',
    type: 'text',
    x: 0.1,
    y: 0.2,
    w: 0.3,
    h: 0.04,
    text: 'Sample',
    color: '#000000',
    fontSize: 15.16,
    fontFamily: 'sora',
    fontWeight: 'normal',
    fontStyle: 'normal',
    textAlign: 'left',
    opacity: 1,
    sourceFontSizeRatio: 0.018,
  }, 842) - 15.156) < 0.01);
});
