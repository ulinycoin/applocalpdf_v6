import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, PDFName, StandardFonts, type PDFPage } from 'pdf-lib';
import { inferTypographyFromBaseFont, resolveSourceFontInfo } from './source-font';
import type { PdfParsedTextOperator } from '../pdf-content-stream-parser';

function operatorWithFont(fontResourceName: string): PdfParsedTextOperator {
  return { operator: 'Tj', start: 0, end: 1, textSegments: ['x'], fontResourceName };
}

function firstFontResourceName(pdf: PDFDocument, page: PDFPage): string {
  const resources = pdf.context.lookup(page.node.get(PDFName.of('Resources')) as never) as unknown as {
    get: (key: unknown) => unknown;
  };
  const fonts = pdf.context.lookup(resources.get(PDFName.of('Font')) as never) as unknown as {
    keys: () => unknown[];
  };
  return String(fonts.keys()[0]);
}

test('resolveSourceFontInfo accepts a simple WinAnsi font', async () => {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([200, 200]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  page.drawText('Hello', { x: 20, y: 100, size: 12, font });
  // pdf-lib only registers embedded objects into the context on flush/save.
  await pdf.flush();

  const resourceName = firstFontResourceName(pdf, page);
  const info = resolveSourceFontInfo({ pdf, page, operator: operatorWithFont(resourceName) });
  assert.equal(info.simpleLatin, true);
  assert.equal(info.composite, false);
  assert.match(info.baseFont ?? '', /Helvetica/u);
});

test('resolveSourceFontInfo rejects a composite Identity-H font', async () => {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const page = pdf.addPage([200, 200]);
  const bytes = await readFile(join(process.cwd(), 'public/fonts/Roboto-Regular.ttf'));
  const font = await pdf.embedFont(bytes, { subset: true });
  page.drawText('Hello', { x: 20, y: 100, size: 12, font });
  await pdf.flush();

  const resourceName = firstFontResourceName(pdf, page);
  const info = resolveSourceFontInfo({ pdf, page, operator: operatorWithFont(resourceName) });
  assert.equal(info.composite, true);
  assert.equal(info.simpleLatin, false);
});

test('resolveSourceFontInfo rejects a Type3 font', async () => {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([200, 200]);
  const type3 = pdf.context.obj({
    Type: 'Font',
    Subtype: 'Type3',
    FontBBox: [0, 0, 0, 0],
    FontMatrix: [0.001, 0, 0, 0.001, 0, 0],
    CharProcs: {},
    Encoding: { Type: 'Encoding', Differences: [65, 'gA'] },
    FirstChar: 0,
    LastChar: 255,
    Widths: [],
  });
  const fontRef = pdf.context.register(type3);
  page.node.set(PDFName.of('Resources'), pdf.context.obj({ Font: { F9: fontRef } }));

  const info = resolveSourceFontInfo({ pdf, page, operator: operatorWithFont('/F9') });
  assert.equal(info.composite, true);
  assert.equal(info.simpleLatin, false);
  assert.equal(info.subtype, 'Type3');
});

test('resolveSourceFontInfo rejects a simple font with a Differences encoding', async () => {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([200, 200]);
  const fontDict = pdf.context.obj({
    Type: 'Font',
    Subtype: 'Type1',
    BaseFont: 'Custom-Simple',
    Encoding: { Type: 'Encoding', Differences: [65, 'a1'] },
  });
  const fontRef = pdf.context.register(fontDict);
  page.node.set(PDFName.of('Resources'), pdf.context.obj({ Font: { F3: fontRef } }));

  const info = resolveSourceFontInfo({ pdf, page, operator: operatorWithFont('/F3') });
  assert.equal(info.composite, false);
  assert.equal(info.simpleLatin, false);
  assert.equal(info.encoding, 'differences');
});

test('resolveSourceFontInfo reports missing resources without throwing', async () => {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([200, 200]);
  assert.deepEqual(
    resolveSourceFontInfo({ pdf, page, operator: operatorWithFont('/NOPE') }),
    { resourceName: '/NOPE', composite: false, simpleLatin: false },
  );
  assert.deepEqual(
    resolveSourceFontInfo({ pdf, page, operator: { operator: 'Tj', start: 0, end: 1, textSegments: ['x'] } }),
    { composite: false, simpleLatin: false },
  );
});

test('inferTypographyFromBaseFont reads weight, style and family from the real font name', () => {
  assert.deepEqual(
    inferTypographyFromBaseFont('ABCDEF+Helvetica-BoldOblique'),
    { fontFamily: 'sora', fontWeight: 'bold', fontStyle: 'italic' },
  );
  assert.deepEqual(
    inferTypographyFromBaseFont('TimesNewRomanPS-BoldMT'),
    { fontFamily: 'times', fontWeight: 'bold', fontStyle: 'normal' },
  );
  assert.deepEqual(
    inferTypographyFromBaseFont('Courier-Oblique'),
    { fontFamily: 'mono', fontWeight: 'normal', fontStyle: 'italic' },
  );
  assert.deepEqual(
    inferTypographyFromBaseFont('Roboto-Regular'),
    { fontFamily: 'roboto', fontWeight: 'normal', fontStyle: 'normal' },
  );
  assert.deepEqual(
    inferTypographyFromBaseFont('NotoSansSC-Regular'),
    { fontFamily: 'noto-cjk', fontWeight: 'normal', fontStyle: 'normal' },
  );
  assert.equal(inferTypographyFromBaseFont(undefined), undefined);
});
