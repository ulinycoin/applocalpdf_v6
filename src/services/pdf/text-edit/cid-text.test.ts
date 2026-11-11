import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { PDFDict, PDFDocument, PDFName, PDFNumber } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import {
  cidHexString,
  encodeCidText,
  parseToUnicodeMap,
  parseWidthsArray,
  glyphWidth,
  programWidth,
  readCidFontInfo,
  type CidFontInfo,
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
