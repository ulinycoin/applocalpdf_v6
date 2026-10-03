/**
 * Splitting text into runs that can be drawn with different fonts.
 *
 * Every face available to the editor covers a *range* of characters, and the ranges do not line up
 * with sentences: the Cyrillic subset has no digits, the Latin-Ext subset has no ASCII at all. Picking
 * one font for the whole string either drops characters or forces a transliteration of text the
 * document could have rendered — so the string is planned per grapheme and drawn run by run.
 */

export interface SegmentedTextRun<TFont> {
  text: string;
  /** Font that can render every character of this run, or null when no candidate can. */
  font: TFont | null;
}

function splitGraphemes(text: string): string[] {
  if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
    const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
    return Array.from(segmenter.segment(text), (entry) => entry.segment);
  }
  return Array.from(text);
}

/**
 * Plans `text` as runs. Adjacent graphemes that resolve to the same font are merged, and runs no
 * candidate can render are returned with `font: null` so the caller can decide how to degrade them
 * (transliteration) instead of losing them silently.
 */
export function planTextSegments<TFont>(params: {
  text: string;
  fonts: readonly TFont[];
  canRender: (font: TFont, text: string) => boolean;
}): Array<SegmentedTextRun<TFont>> {
  const { text, fonts, canRender } = params;
  const runs: Array<SegmentedTextRun<TFont>> = [];

  for (const grapheme of splitGraphemes(text)) {
    // Graphemes stay intact: a combining mark or an Indic cluster must not be split from its base.
    const last = runs[runs.length - 1];
    // Keep the face already in use whenever it still covers the next character: switching fonts
    // mid-sentence costs a separate draw call and looks like a glitch.
    const current = last && last.font && canRender(last.font, grapheme) ? last.font : undefined;
    const font = current ?? fonts.find((candidate) => canRender(candidate, grapheme)) ?? null;
    if (last && last.font === font) {
      last.text += grapheme;
      continue;
    }
    runs.push({ text: grapheme, font });
  }

  return runs;
}

/** Total width of a planned run list, measured run by run. */
export function measureSegments<TFont>(
  runs: ReadonlyArray<SegmentedTextRun<TFont>>,
  measure: (font: TFont, text: string) => number,
  fallbackFont: TFont,
): number {
  return runs.reduce((total, run) => total + measure(run.font ?? fallbackFont, run.text), 0);
}
