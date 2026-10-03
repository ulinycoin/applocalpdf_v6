import assert from 'node:assert/strict';
import test from 'node:test';
import type { WorkerStudioTextEditElement } from '../../core/types/contracts';
import { normalizeFontFamilyFromString } from './studio-text-edit-utils';
import { resolveRequestedFontSizeFromElement, resolveTypographyFromElement } from './text-edit/font-resolve';
import { estimateInlineFontSizePt } from '../../v6/components/Studio/inline-text-utils';

function textElement(overrides: Partial<WorkerStudioTextEditElement> = {}): WorkerStudioTextEditElement {
  return {
    id: 'text-1',
    type: 'text',
    x: 0.1,
    y: 0.1,
    w: 0.3,
    h: 0.03,
    text: 'Hello',
    color: '#000000',
    fontSize: 12,
    fontFamily: 'sora',
    fontWeight: 'normal',
    fontStyle: 'normal',
    textAlign: 'left',
    opacity: 1,
    ...overrides,
  };
}

test('normalizeFontFamilyFromString never turns a generic sans family into Times', () => {
  assert.equal(normalizeFontFamilyFromString('sans-serif'), 'sora');
  assert.equal(normalizeFontFamilyFromString('Calibri, sans-serif'), 'sora');
  assert.equal(normalizeFontFamilyFromString('sans serif'), 'sora');
  assert.equal(normalizeFontFamilyFromString('serif'), 'times');
  assert.equal(normalizeFontFamilyFromString('Times New Roman'), 'times');
  assert.equal(normalizeFontFamilyFromString('DejaVu Serif'), 'times');
  assert.equal(normalizeFontFamilyFromString('monospace'), 'mono');
  assert.equal(normalizeFontFamilyFromString('Roboto'), 'roboto');
  assert.equal(normalizeFontFamilyFromString(undefined), 'sora');
});

test('estimateInlineFontSizePt keeps small and large source sizes intact', () => {
  assert.equal(estimateInlineFontSizePt(6 / 792, 792), 6);
  assert.equal(estimateInlineFontSizePt(120 / 792, 792), 120);
  assert.equal(estimateInlineFontSizePt(400 / 792, 792), 144);
});

test('resolveTypographyFromElement prefers the real font name for an untouched line', () => {
  const element = textElement({
    sourceFontName: 'g_d0_f1',
    sourceFontFamilyHint: 'sans-serif',
    sourceFontSizeRatio: 15 / 792,
  });
  // The editor seeds sora/normal from the generic hint; the stream says Times-Bold.
  assert.deepEqual(
    resolveTypographyFromElement(element, 'TimesNewRomanPS-BoldMT'),
    { fontFamily: 'times', fontWeight: 'bold', fontStyle: 'normal' },
  );
});

test('resolveTypographyFromElement keeps a family the user changed', () => {
  const element = textElement({
    fontFamily: 'mono',
    sourceFontName: 'g_d0_f1',
    sourceFontFamilyHint: 'sans-serif',
  });
  assert.deepEqual(
    resolveTypographyFromElement(element, 'Helvetica'),
    { fontFamily: 'mono', fontWeight: 'normal', fontStyle: 'normal' },
  );
});

test('resolveTypographyFromElement uses the element for new overlay text', () => {
  const element = textElement({ fontFamily: 'times', fontWeight: 'bold' });
  assert.deepEqual(
    resolveTypographyFromElement(element),
    { fontFamily: 'times', fontWeight: 'bold', fontStyle: 'normal' },
  );
});

test('resolveRequestedFontSizeFromElement reports whether the user changed the size', () => {
  const untouched = textElement({ fontSize: 15, sourceFontSizeRatio: 15 / 792 });
  assert.deepEqual(
    resolveRequestedFontSizeFromElement(untouched, 792),
    { fontSize: 15, changedFromSource: false },
  );

  const resized = textElement({ fontSize: 30, sourceFontSizeRatio: 15 / 792 });
  assert.deepEqual(
    resolveRequestedFontSizeFromElement(resized, 792),
    { fontSize: 30, changedFromSource: true },
  );

  const footnote = textElement({ fontSize: 6, sourceFontSizeRatio: 6 / 792 });
  assert.deepEqual(
    resolveRequestedFontSizeFromElement(footnote, 792),
    { fontSize: 6, changedFromSource: false },
  );
});
