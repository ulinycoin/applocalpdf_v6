import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import fontkit from '@pdf-lib/fontkit';
import {
  metricTwinAssetFile,
  metricTwinAssetFiles,
  metricTwins,
  normalizePdfFontName,
  resolveMetricTwin,
} from './metric-twin';
import { resolveTypographyFromElement } from './font-resolve';

test('subset prefixes and decoration are stripped before matching', () => {
  assert.equal(normalizePdfFontName('BCDEEE+Calibri-Bold'), 'calibribold');
  assert.equal(normalizePdfFontName('AAAAAB+Arial,BoldItalic'), 'arialbolditalic');
  assert.equal(normalizePdfFontName(undefined), '');
});

test('real PostScript names resolve to their metric twin', () => {
  const cases: Array<[string, string | undefined]> = [
    ['ArialMT', 'arimo'],
    ['Arial-BoldMT', 'arimo'],
    ['Helvetica', 'arimo'],
    ['HelveticaNeue-Bold', 'arimo'],
    ['Liberation Sans', 'arimo'],
    ['TimesNewRomanPSMT', 'tinos'],
    ['Times-BoldItalic', 'tinos'],
    ['CourierNewPSMT', 'cousine'],
    ['Calibri', 'carlito'],
    ['BCDFEE+Calibri-Bold', 'carlito'],
    ['Cambria', 'caladea'],
    ['Cambria-Bold', 'caladea'],
    // No metric-compatible OFL face was shipped for these, and guessing one would be worse than
    // keeping the ordinary fallback.
    ['Verdana', undefined],
    ['Tahoma', undefined],
    ['Wingdings-Regular', undefined],
    ['PingFangSC-Regular', undefined],
  ];
  for (const [baseFont, expected] of cases) {
    assert.equal(resolveMetricTwin(baseFont)?.id, expected, `twin for ${baseFont}`);
  }
});

test('every twin declares the slices it actually ships with', () => {
  const ids = metricTwins().map((twin) => twin.id);
  assert.deepEqual(ids, ['arimo', 'tinos', 'cousine', 'carlito', 'caladea']);
  for (const twin of metricTwins()) {
    assert.ok(twin.subsets.includes('latin'), `${twin.id} has a latin slice`);
    assert.ok(twin.metricFor.length > 0, `${twin.id} documents what it replaces`);
  }
  const caladea = metricTwins().find((twin) => twin.id === 'caladea')!;
  assert.ok(!caladea.subsets.includes('cyrillic'), 'Caladea ships no Cyrillic slice');
});

test('slices are ordered by what the text needs', () => {
  const carlito = resolveMetricTwin('Calibri')!;
  assert.deepEqual(metricTwinAssetFiles(carlito, 'normal', 'normal', 'Invoice 2026').slice(0, 1), ['fonts/carlito-latin-400-normal.woff']);
  assert.deepEqual(metricTwinAssetFiles(carlito, 'bold', 'normal', 'Rēķins')[0], 'fonts/carlito-latin-ext-700-normal.woff');
  assert.deepEqual(metricTwinAssetFiles(carlito, 'normal', 'italic', 'Договор')[0], 'fonts/carlito-cyrillic-400-italic.woff');
  assert.equal(metricTwinAssetFile(carlito, 'latin', 'bold', 'italic'), 'fonts/carlito-latin-700-italic.woff');
});

test('a family the user picked wins over the document face', () => {
  const element = {
    id: 'e1',
    type: 'text' as const,
    x: 0.1,
    y: 0.1,
    w: 0.2,
    h: 0.05,
    text: 'Invoice',
    color: '#000000',
    fontSize: 12,
    fontFamily: 'sora' as const,
    fontWeight: 'normal' as const,
    fontStyle: 'normal' as const,
    textAlign: 'left' as const,
    lineHeight: 1.2,
    letterSpacing: 0,
    opacity: 1,
    sourceFontName: 'Calibri',
    sourceFontFamilyHint: 'Calibri' as const,
  };
  // Untouched: the editor seeded the family, so the document's own face is what the user sees.
  assert.equal(resolveTypographyFromElement(element as never, 'Calibri').familyCustomized, false);
  // Picked serif in the panel: a twin would silently undo that.
  assert.equal(resolveTypographyFromElement({ ...element, fontFamily: 'times' } as never, 'Calibri').familyCustomized, true);
});

/**
 * The twins are only worth their download if they carry the characters Latvian and Russian documents
 * need; the metric claim is tested on the corpus by `scripts/measure-metric-twins.mjs`, this guards
 * the shipped bytes themselves.
 */
test('shipped twin slices cover Latvian diacritics and Cyrillic', async () => {
  const load = async (file: string) => fontkit.create(await readFile(join(process.cwd(), 'public', 'fonts', file)));
  const has = (font: { hasGlyphForCodePoint: (cp: number) => boolean }, chars: string) =>
    [...chars].every((ch) => font.hasGlyphForCodePoint(ch.codePointAt(0)!));

  const carlitoLatinExt = await load('carlito-latin-ext-400-normal.woff');
  assert.ok(has(carlitoLatinExt, 'āēīūķļņģšžč'), 'Carlito latin-ext carries the Latvian diacritics');

  const arimoCyrillic = await load('arimo-cyrillic-400-normal.woff');
  assert.ok(has(arimoCyrillic, 'ДоговорОплатаАдресПодпись'), 'Arimo Cyrillic slice');

  const tinosLatin = await load('tinos-latin-400-normal.woff');
  assert.ok(has(tinosLatin, 'Invoice'), 'Tinos latin slice');
});
