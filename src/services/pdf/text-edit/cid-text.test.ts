import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFNumber } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import {
  cidHexString,
  encodeCidText,
  parseToUnicodeMap,
  parseWidthsArray,
  glyphWidth,
  programWidth,
  readCidFontInfo,
  readCodeFont,
  type CidFontInfo,
  type CodeFontInfo,
} from './cid-text';

test('cidHexString writes two bytes per CID, upper case', () => {
  assert.equal(cidHexString([0, 1, 26, 4095]), '<00000001001A0FFF>');
  assert.equal(cidHexString([]), '<>');
});

test('parseWidthsArray handles c [w…] and cFirst cLast w together', async () => {
  const doc = await PDFDocument.create();
  const ctx = doc.context;
  const values: unknown[] = [
    PDFNumber.of(1), ctx.obj([PDFNumber.of(500), PDFNumber.of(600)]),
    PDFNumber.of(10), PDFNumber.of(12), PDFNumber.of(700),
    PDFNumber.of(20), ctx.obj([PDFNumber.of(800)]),
  ];
  const widths = parseWidthsArray(values, (value) => ctx.lookup(value as never));
  assert.deepEqual(
    [...widths.entries()].sort((a, b) => a[0] - b[0]),
    [[1, 500], [2, 600], [10, 700], [11, 700], [12, 700], [20, 800]],
  );
});

const CMAP = `
/CIDInit /ProcSet findresource begin
12 dict begin begincmap
1 begincodespacerange <0000> <FFFF> endcodespacerange
3 beginbfchar
<0003> <0061>
<0004> <0062>
<0005> <0101>
endbfchar
2 beginbfrange
<0010> <0012> <0030>
<0020> <0021> [<0100> <0113>]
endbfrange
endcmap end end
`;

test('parseToUnicodeMap reads bfchar and both bfrange forms, and inverts them', () => {
  const { cidToText, textToCid } = parseToUnicodeMap(CMAP);
  assert.equal(cidToText.get(3), 'a');
  assert.equal(cidToText.get(5), 'ā');
  assert.equal(cidToText.get(0x10), '0');
  assert.equal(cidToText.get(0x12), '2');
  assert.equal(cidToText.get(0x20), 'Ā');
  assert.equal(cidToText.get(0x21), 'ē');
  assert.equal(textToCid.get('a'.codePointAt(0)!), 3);
  assert.equal(textToCid.get('2'.codePointAt(0)!), 0x12);
  assert.equal(textToCid.get('z'.codePointAt(0)!), undefined);
});

/** A real composite font, as pdf-lib writes one: Identity-H, CIDFontType2, /W plus /ToUnicode. */
async function readCompositeInfo(): Promise<CidFontInfo> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const page = doc.addPage([595, 842]);
  const font = await doc.embedFont(
    await readFile(join(process.cwd(), 'public', 'fonts', 'Roboto-Regular.ttf')),
    { subset: true },
  );
  page.drawText('Rekins 2026', { x: 40, y: 760, size: 12, font });
  const bytes = new Uint8Array(await doc.save());

  const reloaded = await PDFDocument.load(bytes, { updateMetadata: false });
  const resources = reloaded.getPages()[0].node.lookup(PDFName.of('Resources'), PDFDict);
  const fonts = resources.lookup(PDFName.of('Font'), PDFDict);
  const resourceName = fonts.keys()[0].asString().replace(/^\//u, '');
  const info = await readCidFontInfo(reloaded, resources, resourceName);
  assert.ok(info, 'expected an Identity-H CIDFontType2 font');
  return info;
}

test('readCidFontInfo describes a composite font pdf-lib wrote', async () => {
  const info = await readCompositeInfo();
  assert.equal(info.descendantSubtype, 'CIDFontType2');
  assert.equal(info.identityCidToGid, true);
  assert.ok(info.widths.size > 0, 'pdf-lib writes a /W array');
  assert.ok(info.toUnicode.size > 0, 'pdf-lib writes a /ToUnicode CMap');
  assert.equal(info.charToCid.has('R'.codePointAt(0)!), true);
});

test('encodeCidText reuses CIDs for characters the subset has and reports the rest', async () => {
  const info = await readCompositeInfo();
  const drawn = encodeCidText(info, 'Rekins 2026');
  assert.deepEqual(drawn.missing, []);
  assert.equal(drawn.cids.length, [...'Rekins 2026'].length);

  // A character the subset never contained is reported, not silently mapped to .notdef.
  const absent = encodeCidText(info, 'Rekins ē');
  assert.deepEqual(absent.missing, ['ē']);
  assert.equal(absent.cids.length, [...'Rekins '].length);
});

test('glyph width and the declared /W agree for a CID the document already uses', async () => {
  const info = await readCompositeInfo();
  const cid = info.charToCid.get('R'.codePointAt(0)!)!;
  const width = glyphWidth(info.font, cid);
  assert.ok(width && width > 0, 'advance width comes from the program, by glyph id, in 1/1000 em');
  assert.equal(Math.abs((info.widths.get(cid) ?? 0) - width) <= 1, true, 'declared width matches the program');
  // A subset usually has no cmap, so the code-point lookup cannot be the source of widths.
  assert.equal(programWidth(info.font, 'R'.codePointAt(0)!), undefined);
});

/**
 * A real CFF composite: PingFang from macOS print. It has an empty `/W` (every advance is `/DW`)
 * and no TrueType program, so the file itself is the only source of codes.
 */
async function readCffCompositeInfo(): Promise<CidFontInfo> {
  const bytes = await readFile(join(process.cwd(), 'test', 'fixtures', 'pdfs', 'fonts', 'cff-pingfang-ja.pdf'));
  const pdf = await PDFDocument.load(bytes, { updateMetadata: false });
  const resources = pdf.getPages()[0].node.lookup(PDFName.of('Resources'), PDFDict);
  assert.ok(resources, 'expected page resources');
  const fonts = resources.lookup(PDFName.of('Font'), PDFDict);
  for (const [name] of fonts.entries()) {
    const resourceName = name.asString().replace(/^\//u, '');
    const info = await readCidFontInfo(pdf, resources, resourceName);
    if (info?.descendantSubtype === 'CIDFontType0') {
      return info;
    }
  }
  throw new Error('expected a CIDFontType0 font in the fixture');
}

test('a CFF composite is addressable by its own CIDs without a charset lookup', async () => {
  const info = await readCffCompositeInfo();
  assert.equal(info.descendantSubtype, 'CIDFontType0');
  assert.equal(info.identityCidToGid, true, 'the written code is the CID');
  assert.equal(info.usesDefaultWidthForAll, true, 'the fixture declares /W [] and relies on /DW');
  assert.ok(info.toUnicode.size > 0, 'ToUnicode is what maps a character to its CID');

  const drawn = encodeCidText(info, 'テキスト');
  assert.deepEqual(drawn.missing, []);
  assert.equal(drawn.cids.length, [...'テキスト'].length);

  // A character outside the subset must stay missing, not silently become .notdef.
  assert.deepEqual(encodeCidText(info, '日本語').missing, ['日']);
});

/**
 * A real CIDFontType2 whose `/W` deliberately omits the characters it can type, exactly like the
 * fonts in `test/fixtures/font-corpus` (not committed; the corpus is generated locally) where a
 * subset's `/W` covers only part of its subset.
 * `dwShift` moves `/DW` off the glyph's true advance.
 */
async function readCodeFontWithWidthGap(
  characters: string,
  dwShift = 0,
): Promise<{ codeFont: CodeFontInfo; cids: number[] } | undefined> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const page = doc.addPage([595, 842]);
  const font = await doc.embedFont(
    await readFile(join(process.cwd(), 'public', 'fonts', 'Roboto-Regular.ttf')),
    { subset: true },
  );
  page.drawText(characters, { x: 40, y: 760, size: 12, font });

  const reloaded = await PDFDocument.load(await doc.save(), { updateMetadata: false });
  const resources = reloaded.getPages()[0].node.lookup(PDFName.of('Resources'), PDFDict);
  assert.ok(resources, 'expected page resources');
  const fonts = resources.lookup(PDFName.of('Font'), PDFDict);
  const resourceName = fonts.keys()[0].asString().replace(/^\//u, '');
  const fontDict = fonts.lookup(PDFName.of(resourceName), PDFDict);
  const descendant = fontDict.lookup(PDFName.of('DescendantFonts'), PDFArray).lookup(0, PDFDict);

  const info = await readCidFontInfo(reloaded, resources, resourceName);
  assert.ok(info?.font, 'expected a parsed CIDFontType2 program');
  const cids = [...characters].map((character) => info.charToCid.get(character.codePointAt(0)!)!);
  const width = glyphWidth(info.font, cids[0]!);
  assert.ok(width !== undefined, 'the program supplies the advance');

  // `/W` still exists (so `/DW` is not the font-wide rule) but no longer lists these CIDs.
  const context = reloaded.context;
  descendant.set(PDFName.of('DW'), PDFNumber.of(width + dwShift));
  descendant.set(
    PDFName.of('W'),
    context.obj([PDFNumber.of(cids[0] === 0 ? 1 : 0), context.obj([PDFNumber.of(100)])]),
  );

  const codeFont = await readCodeFont(reloaded, resources, resourceName);
  return codeFont ? { codeFont, cids } : undefined;
}

test('a CID missing from /W stays writable when the glyph advance equals /DW', async () => {
  const fixture = await readCodeFontWithWidthGap('2026');
  assert.ok(fixture, 'expected an Identity-H code font');

  // "2062" uses only glyphs the subset already has; every one of them misses /W and is positioned
  // by /DW, which is exactly the glyph's own advance — so the run cannot drift.
  const encoded = fixture.codeFont.encode('2062');
  assert.deepEqual(encoded.missing, []);
  assert.equal(
    encoded.hex,
    cidHexString([...'2062'].map((character) => fixture.codeFont.charToCode.get(character.codePointAt(0)!)!)).slice(1, -1),
  );
});

test('a CID missing from /W is rejected when its advance differs from /DW', async () => {
  const fixture = await readCodeFontWithWidthGap('2026', 1);
  assert.ok(fixture, 'expected an Identity-H code font');

  // Writing it anyway would advance the viewer by /DW, i.e. one unit off per glyph; the caller has
  // to fall back instead of building a visibly mis-spaced line.
  assert.deepEqual(fixture.codeFont.encode('2062').missing, [...'2062']);
});
