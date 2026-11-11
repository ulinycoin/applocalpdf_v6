import { PDFArray, PDFDict, PDFName, PDFNumber, PDFRawStream, type PDFDocument } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { getPdfCore } from '../pdf-content-stream-decode';

/**
 * Drawing text with the composite font a PDF already contains.
 *
 * Re-embedding a program only works while the program's own character map knows the characters
 * (`.agent/tasks.md`, 2026-11-11: 43% of parsing programs have no ASCII cmap). An Identity-H
 * composite font does not need that map at all: the bytes in the content stream are CIDs, the glyph
 * is `CIDToGIDMap[CID]` (usually `/Identity`, so the glyph id *is* the CID), and the link between a
 * Unicode character and its CID is recorded in the file's own `/ToUnicode` CMap.
 *
 * So the same character can be typed again in the document's own typeface — as long as the subset
 * still contains the glyph, which this module checks and never assumes. Widths are the second half:
 * a viewer positions a CID using `/W`, and an unknown CID silently falls back to `/DW` (usually
 * 1000/1000 em), which would space the new text wrong even though the glyph is right.
 */

export interface CidFontInfo {
  resourceName: string;
  baseFont?: string;
  descendantSubtype?: string;
  /** `/Identity` means glyph id = CID, so a program cmap lookup yields a CID directly. */
  identityCidToGid: boolean;
  defaultWidth: number;
  /** CID -> advance width in 1/1000 em, from the font's `/W`. */
  widths: ReadonlyMap<number, number>;
  /** CID -> the text it stands for, from the font's `/ToUnicode` (single characters only). */
  toUnicode: ReadonlyMap<number, string>;
  /** Reverse of `toUnicode`, the direction an editor needs. */
  charToCid: ReadonlyMap<number, number>;
  numGlyphs?: number;
  /** Live font object of the embedded program, when it parsed; used for widths of new CIDs. */
  font?: Awaited<ReturnType<typeof fontkit.create>>;
  widthArrayEntries: number;
}

export interface EncodedCidText {
  /** CIDs in draw order. */
  cids: number[];
  /** Characters the font cannot render — the caller must fall back for those. */
  missing: string[];
  /** CIDs whose width had to be taken from the program because `/W` did not have them. */
  widthsFromProgram: Array<{ cid: number; width: number }>;
}

/** Hex string operand for `Tj`, two bytes per CID, as Identity-H expects. */
export function cidHexString(cids: readonly number[]): string {
  return `<${cids.map((cid) => cid.toString(16).toUpperCase().padStart(4, '0')).join('')}>`;
}

/**
 * PDF `/W` array: either `c [w1 w2 …]` or `cFirst cLast w`, mixed freely. Missing CIDs are not an
 * error — they mean the viewer would use `/DW`.
 */
export function parseWidthsArray(values: readonly unknown[], lookup: (value: unknown) => unknown): Map<number, number> {
  const widths = new Map<number, number>();
  let index = 0;
  while (index < values.length) {
    const first = toNumber(lookup(values[index])) ?? toNumber(values[index]);
    index += 1;
    if (first === undefined) {
      break;
    }
    const next = values[index];
    const resolvedNext = lookup(next) ?? next;
    const second = toNumber(resolvedNext);
    if (second !== undefined) {
      const width = toNumber(lookup(values[index + 1]) ?? values[index + 1]);
      if (width === undefined) {
        break;
      }
      for (let cid = first; cid <= second && cid - first < 65_535; cid += 1) {
        widths.set(cid, width);
      }
      index += 2;
      continue;
    }
    const array = resolvedNext instanceof PDFArray ? resolvedNext : undefined;
    if (!array) {
      break;
    }
    array.asArray().forEach((entry, offset) => {
      const width = toNumber(lookup(entry) ?? entry);
      if (width !== undefined) {
        widths.set(first + offset, width);
      }
    });
    index += 1;
  }
  return widths;
}

function toNumber(value: unknown): number | undefined {
  if (value instanceof PDFNumber) {
    return value.asNumber();
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (value && typeof (value as { asNumber?: unknown }).asNumber === 'function') {
    const number = (value as { asNumber: () => number }).asNumber();
    return Number.isFinite(number) ? number : undefined;
  }
  return undefined;
}

/**
 * `/ToUnicode` CMap as two maps. Multi-character destinations (ligatures, contextual forms) are
 * skipped on purpose: an editor cannot decide which character to type to get them.
 */
export function parseToUnicodeMap(source: string): { cidToText: Map<number, string>; textToCid: Map<number, number> } {
  const cidToText = new Map<number, string>();
  const textToCid = new Map<number, number>();

  const utf16 = (hex: string): string => {
    let out = '';
    for (let i = 0; i + 4 <= hex.length; i += 4) {
      out += String.fromCharCode(parseInt(hex.slice(i, i + 4), 16));
    }
    return out;
  };
  const add = (cid: number, text: string) => {
    if ([...text].length !== 1) {
      return;
    }
    cidToText.set(cid, text);
    const codePoint = text.codePointAt(0)!;
    // First CID wins: a subset may map several codes to one character, and any of them draws.
    if (!textToCid.has(codePoint)) {
      textToCid.set(codePoint, cid);
    }
  };

  for (const block of source.matchAll(/beginbfchar([\s\S]*?)endbfchar/gu)) {
    for (const pair of block[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/gu)) {
      add(parseInt(pair[1], 16), utf16(pair[2]));
    }
  }
  for (const block of source.matchAll(/beginbfrange([\s\S]*?)endbfrange/gu)) {
    for (const range of block[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*(?:<([0-9a-fA-F]+)>|\[([\s\S]*?)\])/gu)) {
      const low = parseInt(range[1], 16);
      const high = parseInt(range[2], 16);
      if (range[3]) {
        const start = parseInt(range[3].slice(0, 4), 16);
        for (let offset = 0; offset <= high - low && offset < 65_536; offset += 1) {
          add(low + offset, String.fromCharCode(start + offset));
        }
      } else if (range[4]) {
        let offset = 0;
        for (const destination of range[4].matchAll(/<([0-9a-fA-F]+)>/gu)) {
          add(low + offset, utf16(destination[1]));
          offset += 1;
        }
      }
    }
  }
  return { cidToText, textToCid };
}

/**
 * Decoded bytes of a stream, whatever runtime we are in.
 *
 * `DecompressionStream` first, `pdf-lib/es/core` second: the core build decodes correctly in the
 * browser but under Node it has been seen to hand back the *encoded* bytes unchanged, so its output is
 * only accepted when the length actually changed. An undecoded `/ToUnicode` would silently report
 * "this font can type nothing", which is the one failure mode that must not happen quietly.
 */
async function decodeStreamBytes(stream: PDFRawStream): Promise<Uint8Array | undefined> {
  const raw = stream.getContents();
  const filter = stream.dict.get(PDFName.of('Filter'))?.toString() ?? '';
  if (!filter) {
    return raw;
  }
  if (!filter.includes('FlateDecode')) {
    return undefined;
  }
  try {
    // Copy into a buffer this module owns: a view over a possibly shared buffer is not a BlobPart.
    const owned = new Uint8Array(raw.byteLength);
    owned.set(raw);
    const inflated = new Uint8Array(await new Response(
      new Blob([owned.buffer]).stream().pipeThrough(new DecompressionStream('deflate')),
    ).arrayBuffer());
    if (inflated.length > 0) {
      return inflated;
    }
  } catch {
    // fall through to the pdf-lib decoder
  }
  const core = await getPdfCore();
  if (core) {
    try {
      const decoded = core.decodePDFRawStream(stream).decode();
      if (decoded.length !== raw.length) {
        return decoded;
      }
    } catch {
      // nothing else to try
    }
  }
  return undefined;
}

/** A `/ToUnicode` stream is Flate-compressed in most real files. */
async function streamText(ctx: PDFDocument['context'], ref: unknown): Promise<string | undefined> {
  if (!ref) {
    return undefined;
  }
  try {
    const stream = asStream(ctx, ref);
    if (!stream) {
      return undefined;
    }
    const bytes = await decodeStreamBytes(stream);
    return bytes ? new TextDecoder('latin1').decode(bytes) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Everything needed to type new text in a page's existing composite font, or `undefined` when the
 * font is not an Identity-H `CIDFontType2` (CFF/CIDFontType0 resolves glyphs through its own charset,
 * which this module does not implement).
 */
export async function readCidFontInfo(
  pdf: PDFDocument,
  resources: PDFDict | undefined,
  resourceName: string,
): Promise<CidFontInfo | undefined> {
  const ctx = pdf.context;
  const fonts = resources ? asDict(ctx, resources.get(PDFName.of('Font'))) : undefined;
  if (!fonts) {
    return undefined;
  }
  const fontDict = asDict(ctx, fonts.get(PDFName.of(resourceName)));
  if (!fontDict) {
    return undefined;
  }
  if (fontDict.get(PDFName.of('Subtype'))?.toString() !== '/Type0') {
    return undefined;
  }
  const encoding = fontDict.get(PDFName.of('Encoding'))?.toString();
  if (encoding !== '/Identity-H') {
    return undefined;
  }
  const descendants = asArray(ctx, fontDict.get(PDFName.of('DescendantFonts')));
  const descendant = descendants ? asDict(ctx, descendants.get(0)) : undefined;
  if (!descendant) {
    return undefined;
  }
  const descendantSubtype = descendant.get(PDFName.of('Subtype'))?.toString().replace(/^\//u, '');
  if (descendantSubtype !== 'CIDFontType2') {
    return undefined;
  }
  const cidToGid = descendant.get(PDFName.of('CIDToGIDMap'))?.toString();

  // The embedded program supplies two facts the PDF does not state: how many glyphs exist (a CID
  // beyond that is a blank) and the advance width of a CID that `/W` never listed.
  const descriptor = asDict(ctx, descendant.get(PDFName.of('FontDescriptor')));
  const { font, numGlyphs } = await readProgram(ctx, descriptor);

  const widthsArray = asArray(ctx, descendant.get(PDFName.of('W')));
  const widths = widthsArray
    ? parseWidthsArray(widthsArray.asArray(), (value) => resolve(ctx, value))
    : new Map<number, number>();

  const toUnicodeSource = await streamText(ctx, fontDict.get(PDFName.of('ToUnicode')));
  const { cidToText, textToCid } = toUnicodeSource
    ? parseToUnicodeMap(toUnicodeSource)
    : { cidToText: new Map<number, string>(), textToCid: new Map<number, number>() };

  return {
    resourceName,
    baseFont: fontDict.get(PDFName.of('BaseFont'))?.toString().replace(/^\//u, ''),
    descendantSubtype,
    identityCidToGid: cidToGid === '/Identity' || cidToGid === undefined,
    defaultWidth: toNumber(ctx.lookup(descendant.get(PDFName.of('DW')) as never)) ?? 1000,
    widths,
    toUnicode: cidToText,
    charToCid: textToCid,
    numGlyphs,
    font,
    widthArrayEntries: widthsArray?.size() ?? 0,
  };
}

/**
 * Parses the embedded TrueType program. When wave 1 lands its `font-program.ts`, this should call it
 * instead — the rules for which streams are readable must live in one place.
 */
async function readProgram(
  ctx: PDFDocument['context'],
  descriptor: PDFDict | undefined,
): Promise<{ font: CidFontInfo['font'] | undefined; numGlyphs: number | undefined }> {
  const fileRef = descriptor?.get(PDFName.of('FontFile2'));
  if (!fileRef) {
    return { font: undefined, numGlyphs: undefined };
  }
  try {
    const stream = asStream(ctx, fileRef);
    if (!stream) {
      return { font: undefined, numGlyphs: undefined };
    }
    const bytes = await decodeStreamBytes(stream);
    if (!bytes || bytes.length === 0) {
      return { font: undefined, numGlyphs: undefined };
    }
    const font = fontkit.create(bytes) as CidFontInfo['font'];
    return { font, numGlyphs: font?.numGlyphs };
  } catch {
    // An unreadable program still allows reusing the *existing* CIDs, whose widths are in /W.
    return { font: undefined, numGlyphs: undefined };
  }
}

function resolve(ctx: PDFDocument['context'], value: unknown): unknown {
  if (!value) {
    return undefined;
  }
  try {
    return ctx.lookup(value as never) ?? undefined;
  } catch {
    return undefined;
  }
}

function asStream(ctx: PDFDocument['context'], value: unknown): PDFRawStream | undefined {
  const resolved = resolve(ctx, value);
  return resolved instanceof PDFRawStream ? resolved : undefined;
}

function asDict(ctx: PDFDocument['context'], value: unknown): PDFDict | undefined {
  const resolved = resolve(ctx, value);
  return resolved instanceof PDFDict ? resolved : undefined;
}

function asArray(ctx: PDFDocument['context'], value: unknown): PDFArray | undefined {
  const resolved = resolve(ctx, value);
  return resolved instanceof PDFArray ? resolved : undefined;
}

/**
 * Advance width of a *glyph id* in 1/1000 em.
 *
 * Under `/Identity` the CID is the glyph id, and most subsets ship without a usable cmap — asking for
 * a code point there returns `.notdef`. The glyph id is what the CID already is, so widths must be
 * read by id.
 */
export function glyphWidth(font: CidFontInfo['font'], glyphId: number): number | undefined {
  if (!font) {
    return undefined;
  }
  try {
    const glyph = font.getGlyph(glyphId);
    if (!glyph) {
      return undefined;
    }
    const upem = font.unitsPerEm ?? 1000;
    return Math.round((glyph.advanceWidth / upem) * 1000);
  } catch {
    return undefined;
  }
}

/** Advance width of a code point in 1/1000 em, taken from the program itself. */
export function programWidth(font: CidFontInfo['font'], codePoint: number): number | undefined {
  if (!font) {
    return undefined;
  }
  try {
    const glyph = font.glyphForCodePoint(codePoint);
    if (!glyph || glyph.id === 0) {
      return undefined;
    }
    const upem = font.unitsPerEm ?? 1000;
    return Math.round((glyph.advanceWidth / upem) * 1000);
  } catch {
    return undefined;
  }
}

/**
 * Characters this font can draw *and* keep extractable.
 *
 * A CID is usable when `/ToUnicode` maps it back to the character (otherwise the text renders but
 * stops being searchable) and the glyph exists in the program. Widths are reported separately because
 * they can be added to a private `/W` copy — a missing width is a layout problem, not a blocker.
 */
export function encodeCidText(info: CidFontInfo, text: string): EncodedCidText {
  const cids: number[] = [];
  const missing: string[] = [];
  const widthsFromProgram: Array<{ cid: number; width: number }> = [];

  for (const character of text) {
    const codePoint = character.codePointAt(0)!;
    const cid = info.charToCid.get(codePoint);
    if (cid === undefined) {
      missing.push(character);
      continue;
    }
    if (info.numGlyphs !== undefined && cid >= info.numGlyphs) {
      missing.push(character);
      continue;
    }
    cids.push(cid);
    if (!info.widths.has(cid)) {
      const width = programWidth(info.font, codePoint) ?? glyphWidth(info.font, cid);
      if (width !== undefined) {
        widthsFromProgram.push({ cid, width });
      }
    }
  }
  return { cids, missing, widthsFromProgram };
}

/**
 * A font whose glyphs can be addressed by the codes the file already uses — the two shapes that
 * matter in practice: Identity-H composites (two-byte CIDs) and Type3 (one-byte codes into CharProcs).
 *
 * Type3 is how browsers print CJK: Chrome emits one Type3 font per batch of glyphs, each with its own
 * `/Widths` and `/ToUnicode`, so a Japanese or Chinese character that already appears in the document
 * can be typed again without touching the font at all.
 */
export interface CodeFontInfo {
  resourceName: string;
  baseFont?: string;
  kind: 'identity-cid' | 'type3';
  codeBytes: 1 | 2;
  toUnicode: ReadonlyMap<number, string>;
  charToCode: ReadonlyMap<number, number>;
  /** Hex string operand for `Tj`, plus the characters the font cannot address. */
  encode(text: string): { hex: string; missing: string[] };
}

/** Absent `/Widths` entries fall back to `/DW`, which would space the new text wrong. */
function widthLookupForIdentity(info: CidFontInfo): (code: number) => boolean {
  return (code) => info.widths.has(code) || info.defaultWidth === programWidth(info.font, code);
}

async function readIdentityCodeFont(
  pdf: PDFDocument,
  resources: PDFDict | undefined,
  resourceName: string,
): Promise<CodeFontInfo | undefined> {
  const info = await readCidFontInfo(pdf, resources, resourceName);
  if (!info || !info.identityCidToGid) {
    return undefined;
  }
  const hasWidth = widthLookupForIdentity(info);
  return {
    resourceName: info.resourceName,
    baseFont: info.baseFont,
    kind: 'identity-cid',
    codeBytes: 2,
    toUnicode: info.toUnicode,
    charToCode: info.charToCid,
    encode(text: string) {
      const codes: number[] = [];
      const missing: string[] = [];
      for (const character of text) {
        const code = info.charToCid.get(character.codePointAt(0)!);
        if (code === undefined || (info.numGlyphs !== undefined && code >= info.numGlyphs) || !hasWidth(code)) {
          missing.push(character);
          continue;
        }
        codes.push(code);
      }
      return { hex: cidHexString(codes).slice(1, -1), missing };
    },
  };
}

async function readType3CodeFont(
  pdf: PDFDocument,
  resources: PDFDict | undefined,
  resourceName: string,
): Promise<CodeFontInfo | undefined> {
  const ctx = pdf.context;
  const fonts = resources ? asDict(ctx, resources.get(PDFName.of('Font'))) : undefined;
  const fontDict = fonts ? asDict(ctx, fonts.get(PDFName.of(resourceName))) : undefined;
  if (!fontDict || fontDict.get(PDFName.of('Subtype'))?.toString() !== '/Type3') {
    return undefined;
  }
  if (!fontDict.get(PDFName.of('CharProcs'))) {
    return undefined;
  }
  const firstChar = toNumber(resolve(ctx, fontDict.get(PDFName.of('FirstChar')))) ?? 0;
  const widthsArray = asArray(ctx, fontDict.get(PDFName.of('Widths')));
  if (!widthsArray) {
    return undefined;
  }
  const widthValues = widthsArray.asArray().map((entry) => toNumber(resolve(ctx, entry)));
  const hasWidth = (code: number): boolean => {
    const offset = code - firstChar;
    return offset >= 0 && offset < widthValues.length && widthValues[offset] !== undefined;
  };

  const source = await streamText(ctx, fontDict.get(PDFName.of('ToUnicode')));
  if (!source) {
    return undefined;
  }
  const { cidToText, textToCid } = parseToUnicodeMap(source);
  return {
    resourceName,
    baseFont: fontDict.get(PDFName.of('BaseFont'))?.toString().replace(/^\//u, ''),
    kind: 'type3',
    codeBytes: 1,
    toUnicode: cidToText,
    charToCode: textToCid,
    encode(text: string) {
      const codes: number[] = [];
      const missing: string[] = [];
      for (const character of text) {
        const code = textToCid.get(character.codePointAt(0)!);
        if (code === undefined || !hasWidth(code) || code > 255) {
          missing.push(character);
          continue;
        }
        codes.push(code);
      }
      return { hex: codes.map((code) => code.toString(16).toUpperCase().padStart(2, '0')).join(''), missing };
    },
  };
}

/**
 * Reads whichever code-addressed font the page has under this name. `undefined` means the caller must
 * fall back: a font this module cannot address (CFF composites, broken dictionaries, missing widths).
 */
export async function readCodeFont(
  pdf: PDFDocument,
  resources: PDFDict | undefined,
  resourceName: string,
): Promise<CodeFontInfo | undefined> {
  return (await readIdentityCodeFont(pdf, resources, resourceName))
    ?? (await readType3CodeFont(pdf, resources, resourceName));
}
