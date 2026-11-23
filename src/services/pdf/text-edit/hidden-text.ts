import {
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  TextRenderingMode,
  beginText,
  endText,
  setCharacterSqueeze,
  setFontAndSize,
  setTextMatrix,
  setTextRenderingMode,
  showText,
  type PDFPage,
} from 'pdf-lib';

/**
 * Invisible text under a rasterised run, so the picture stays searchable.
 *
 * A run no shipped face can render is painted to a canvas and embedded as a PNG (CJK, Thai, and
 * every other script outside the bundle). The picture is sharp and correct, but a PDF made of
 * pictures has no text: search, copy and "find in document" all lose the edit.
 *
 * The layer drawn here is a Type0 font with no embedded program and no glyphs of its own — only a
 * `/ToUnicode` map and per-code widths — painted in text rendering mode 3, which draws nothing.
 * Extractors read `/ToUnicode`, so the run becomes searchable while the page still shows the
 * bitmap. Two deliberate properties:
 *
 * - It is not a Type3 font. The applier rewrites Type3 runs by their own codes, and a run backed by
 *   empty char procedures would then be "patched" into glyphs that draw nothing. A CIDFontType0
 *   without `/FontFile3` is rejected by `readCidFontInfo`, so a later edit of this text falls back
 *   to the overlay path instead of silently erasing it.
 * - Widths come from the caller's measured advances, not from `/DW`: with 1000/1000 for every glyph
 *   the extracted words land a full em per character apart, extractors insert fake spaces, and the
 *   copy/paste result stops matching what the page shows.
 */

export interface HiddenTextParams {
  text: string;
  /** Advance of every character in points at `fontSize`, in code-point order of `text`. */
  advancesPt: readonly number[];
  fontSize: number;
  /** Baseline start of the run, in user space. */
  x: number;
  y: number;
  /** Counter-clockwise rotation in degrees, matching the page's upright direction. */
  rotationDegrees?: number;
}

const FONT_NAME = 'GlyphlessText';

/** UTF-16BE hex, four digits per code unit, as `/ToUnicode` destinations require. */
function utf16BeHex(character: string): string {
  let hex = '';
  for (let index = 0; index < character.length; index += 1) {
    hex += character.charCodeAt(index).toString(16).toUpperCase().padStart(4, '0');
  }
  return hex;
}

function codeHex(code: number): string {
  return code.toString(16).toUpperCase().padStart(4, '0');
}

function buildToUnicodeCMap(entries: ReadonlyArray<{ code: number; character: string }>): string {
  const lines = [
    '/CIDInit /ProcSet findresource begin',
    '12 dict begin',
    'begincmap',
    '/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def',
    '/CMapName /Adobe-Identity-UCS def',
    '/CMapType 2 def',
    '1 begincodespacerange',
    '<0000> <FFFF>',
    'endcodespacerange',
    `${entries.length} beginbfchar`,
  ];
  for (const entry of entries) {
    lines.push(`<${codeHex(entry.code)}> <${utf16BeHex(entry.character)}>`);
  }
  lines.push('endbfchar', 'endcmap', 'CMapName currentdict /CMap defineresource pop', 'end', 'end');
  return lines.join('\n');
}

/** The page is shared with other edits, so the resource name must stay unique. */
function uniqueFontName(page: PDFPage): string {
  // `lookup` throws when the key is absent; a page without text has no `/Font` entry yet.
  const fonts = page.node.Resources()?.lookupMaybe(PDFName.of('Font'), PDFDict);
  if (!fonts) {
    return FONT_NAME;
  }
  let name = FONT_NAME;
  let suffix = 1;
  while (fonts.has(PDFName.of(name))) {
    name = `${FONT_NAME}${suffix}`;
    suffix += 1;
  }
  return name;
}

/**
 * Draws `params.text` invisibly at the given baseline. Returns false when there is nothing to draw.
 *
 * The font is built per run: every distinct character gets one code and the average advance of its
 * occurrences becomes that code's width, so a repeated character cannot drift differently in two
 * places. A horizontal squeeze of the run makes the total width match the bitmap exactly.
 */
export function drawHiddenText(pdf: PDFDocument, page: PDFPage, params: HiddenTextParams): boolean {
  const characters = [...params.text];
  if (characters.length === 0) {
    return false;
  }
  const advances = params.advancesPt.length === characters.length
    ? params.advancesPt
    : characters.map(() => params.fontSize * 0.5);

  const order: string[] = [];
  const codeByCharacter = new Map<string, number>();
  const advanceSumByCode = new Map<number, number>();
  const countByCode = new Map<number, number>();
  let measuredTotal = 0;

  characters.forEach((character, index) => {
    let code = codeByCharacter.get(character);
    if (code === undefined) {
      code = order.length + 1;
      codeByCharacter.set(character, code);
      order.push(character);
    }
    const advance = Number.isFinite(advances[index]) ? (advances[index] as number) : 0;
    measuredTotal += advance;
    advanceSumByCode.set(code, (advanceSumByCode.get(code) ?? 0) + advance);
    countByCode.set(code, (countByCode.get(code) ?? 0) + 1);
  });

  const widths = order.map((_, index) => {
    const code = index + 1;
    const average = (advanceSumByCode.get(code) ?? 0) / (countByCode.get(code) ?? 1);
    return Math.max(0, (average / params.fontSize) * 1000);
  });
  // Codes are the glyphs of an em, so their running width is `width/1000 * fontSize` each.
  const codeTotal = widths.reduce((sum, width) => sum + width, 0) * (params.fontSize / 1000);
  const squeeze = codeTotal > 0 && measuredTotal > 0 ? (measuredTotal / codeTotal) * 100 : 100;

  const context = pdf.context;
  const toUnicode = context.flateStream(
    buildToUnicodeCMap(order.map((character, index) => ({ code: index + 1, character }))),
    {},
  );
  const descriptor = context.obj({
    Type: 'FontDescriptor',
    FontName: FONT_NAME,
    Flags: 4,
    FontBBox: [0, 0, 1000, 1000],
    ItalicAngle: 0,
    Ascent: 1000,
    Descent: 0,
    CapHeight: 1000,
    StemV: 80,
  });
  const descendant = context.obj({
    Type: 'Font',
    Subtype: 'CIDFontType0',
    BaseFont: FONT_NAME,
    CIDSystemInfo: { Registry: 'Adobe', Ordering: 'Identity', Supplement: 0 },
    FontDescriptor: descriptor,
    DW: 1000,
    W: [1, widths],
  });
  const font = context.obj({
    Type: 'Font',
    Subtype: 'Type0',
    BaseFont: FONT_NAME,
    Encoding: 'Identity-H',
    DescendantFonts: [descendant],
    ToUnicode: context.register(toUnicode),
  });

  const fontName = uniqueFontName(page);
  page.node.setFontDictionary(PDFName.of(fontName), context.register(font));

  const codes = characters.map((character) => codeHex(codeByCharacter.get(character)!)).join('');
  const radians = (params.rotationDegrees ?? 0) * (Math.PI / 180);
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);

  page.pushOperators(
    beginText(),
    setFontAndSize(PDFName.of(fontName), params.fontSize),
    // Rendering mode is text state and survives `ET`, so the default has to be put back: the page
    // content after this block (form appearances, later overlays) must stay visible.
    setTextRenderingMode(TextRenderingMode.Invisible),
    setCharacterSqueeze(squeeze),
    setTextMatrix(cos, sin, -sin, cos, params.x, params.y),
    showText(PDFHexString.of(codes)),
    setCharacterSqueeze(100),
    setTextRenderingMode(TextRenderingMode.Fill),
    endText(),
  );

  return true;
}
