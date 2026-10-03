/**
 * Glyph coverage checks for embedded fonts.
 *
 * pdf-lib writes a 4-hex-digit glyph id for every character of an embedded font (Identity-H) and
 * glyph 0 is always `.notdef`, so a `0000` code in the encoded string means the character is not in
 * that font and would render as a blank. Standard fonts instead throw when a character falls outside
 * their single-byte encoding.
 */
export interface EncodableFont {
  encodeText(text: string): unknown;
}

const GLYPH_CODE = /.{4}/gu;

export function countMissingGlyphs(font: EncodableFont, text: string): number {
  let hex: string;
  try {
    hex = String(font.encodeText(text || ' ')).replace(/[^0-9a-fA-F]/gu, '');
  } catch {
    return Number.POSITIVE_INFINITY;
  }
  const codes = hex.match(GLYPH_CODE);
  if (!codes) {
    return 0;
  }
  return codes.filter((code) => code === '0000').length;
}

/**
 * First candidate that can render every character of the text.
 *
 * Google font subsets cover disjoint ranges (`cyrillic` has no digits, punctuation or ASCII,
 * `latin-ext` has no ASCII), so picking one by family or by the first character silently drops part
 * of a real sentence.
 */
export function pickCoveringFont<T extends EncodableFont>(candidates: readonly T[], text: string): T | undefined {
  return candidates.find((candidate) => countMissingGlyphs(candidate, text) === 0);
}
