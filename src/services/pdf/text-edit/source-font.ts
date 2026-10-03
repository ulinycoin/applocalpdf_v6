import { PDFName, type PDFDocument, type PDFPage } from 'pdf-lib';
import type { WorkerStudioFontFamilyId } from '../../../core/types/contracts';
import type { PdfParsedTextOperator } from '../pdf-content-stream-parser';

/**
 * Font of the text run a Studio edit is replacing, resolved from the page resources.
 *
 * True Replace works by overwriting the string operand of an existing `Tj`/`TJ`, so it stays
 * inside the font that is already selected in the content stream. That is only safe for simple
 * single-byte Latin fonts: composite fonts (Type0/Identity-H) address glyphs with two-byte codes
 * and Type3 fonts use arbitrary per-document glyph names, so a Latin-1 literal written into them
 * renders as wrong glyphs or blanks.
 */
export interface SourceFontInfo {
  resourceName?: string;
  baseFont?: string;
  subtype?: string;
  encoding?: string;
  /** True when in-place literal replacement cannot be trusted for this font. */
  composite: boolean;
  /** True when patching a Latin-1 literal in place preserves the original appearance. */
  simpleLatin: boolean;
}

const EMPTY_FONT_INFO: SourceFontInfo = { composite: false, simpleLatin: false };

function stripSubsetPrefix(name: string): string {
  return name.replace(/^[A-Z]{6}\+/u, '');
}

function readName(value: unknown): string | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }
  const asString = String(value);
  return asString.startsWith('/') ? asString.slice(1) : asString;
}

export function resolveSourceFontInfo(params: {
  pdf: PDFDocument;
  page: PDFPage;
  operator?: PdfParsedTextOperator;
}): SourceFontInfo {
  const resourceName = params.operator?.fontResourceName;
  if (!resourceName) {
    return { ...EMPTY_FONT_INFO };
  }

  try {
    const { pdf, page } = params;
    const resources = pdf.context.lookup(page.node.get(PDFName.of('Resources')) as never) as
      | { get?: (key: unknown) => unknown }
      | undefined;
    const fonts = pdf.context.lookup(resources?.get?.(PDFName.of('Font')) as never) as
      | { get?: (key: unknown) => unknown }
      | undefined;
    const fontRef = fonts?.get?.(PDFName.of(resourceName.slice(1)));
    const font = pdf.context.lookup(fontRef as never) as
      | { get?: (key: unknown) => unknown }
      | undefined;
    if (!font?.get) {
      return { ...EMPTY_FONT_INFO, resourceName };
    }

    const subtype = readName(font.get(PDFName.of('Subtype')));
    const rawBaseFont = readName(font.get(PDFName.of('BaseFont')));
    const encodingRaw = font.get(PDFName.of('Encoding'));
    const encodingLooked = pdf.context.lookup(encodingRaw as never) as
      | { get?: (key: unknown) => unknown }
      | undefined;
    const encodingIsDict = typeof encodingLooked?.get === 'function';
    const hasDifferences = encodingIsDict
      ? Boolean(encodingLooked!.get!(PDFName.of('Differences')))
      : false;
    const encoding = encodingIsDict ? 'dict' : readName(encodingRaw);

    const normalizedSubtype = (subtype ?? '').toLowerCase();
    const composite = normalizedSubtype === 'type0' || normalizedSubtype === 'type3';
    const isSimple = normalizedSubtype === 'type1' || normalizedSubtype === 'truetype' || normalizedSubtype === 'mmtype1';
    const encodingName = (encoding ?? '').toLowerCase();
    const encodingIsLatin = encodingName === ''
      || encodingName === 'winansiencoding'
      || encodingName === 'macromanencoding'
      || encodingName === 'standardencoding'
      || encodingName === 'pdfdocencoding';

    return {
      resourceName,
      baseFont: rawBaseFont ? stripSubsetPrefix(rawBaseFont) : undefined,
      subtype,
      encoding: encodingIsDict || hasDifferences ? 'differences' : encoding,
      composite,
      simpleLatin: isSimple && !composite && encodingIsLatin && !hasDifferences,
    };
  } catch {
    return { ...EMPTY_FONT_INFO, resourceName };
  }
}

/**
 * Typography implied by a real PostScript font name (`Helvetica-BoldOblique`), which is far more
 * trustworthy than the generic family pdf.js reports for the same run.
 */
export function inferTypographyFromBaseFont(baseFont?: string): {
  fontFamily: WorkerStudioFontFamilyId;
  fontWeight: 'normal' | 'bold';
  fontStyle: 'normal' | 'italic';
} | undefined {
  if (!baseFont) {
    return undefined;
  }
  const name = stripSubsetPrefix(baseFont).toLowerCase().replace(/[\s_]+/gu, '');
  if (!name) {
    return undefined;
  }

  let fontFamily: WorkerStudioFontFamilyId = 'sora';
  if (/times|georgia|garamond|minion|cambria|bookman|palatino|serif/u.test(name)) {
    fontFamily = 'times';
  } else if (/courier|mono|consol|menlo|typewriter/u.test(name)) {
    fontFamily = 'mono';
  } else if (/roboto/u.test(name)) {
    fontFamily = 'roboto';
  } else if (/arabic/u.test(name)) {
    fontFamily = 'noto-arabic';
  } else if (/cjk|han|kana|hangul|japan|korea|simplified|notosanssc|notosansjp|notosanskr/u.test(name)) {
    fontFamily = 'noto-cjk';
  } else if (/devanagari|hindi/u.test(name)) {
    fontFamily = 'noto-devanagari';
  } else if (/noto/u.test(name)) {
    fontFamily = 'noto';
  }

  const fontWeight: 'normal' | 'bold' = /bold|black|heavy|semibold|demibold|[789]00/u.test(name)
    ? 'bold'
    : 'normal';
  const fontStyle: 'normal' | 'italic' = /italic|oblique/u.test(name) ? 'italic' : 'normal';

  return { fontFamily, fontWeight, fontStyle };
}
