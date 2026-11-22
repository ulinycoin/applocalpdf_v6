/**
 * Colour for the cover rectangle that hides the original glyphs before an overlay replacement.
 *
 * The cover used to be white unconditionally, which painted a white patch (and, when the source text
 * was white, made the new text invisible) on any page with a coloured background. Sampling the page
 * around the run keeps the cover invisible on solid backgrounds; when no sample is available the
 * caller falls back to the previous white.
 */
export function pickCoverColor(
  samples: ReadonlyArray<string | null | undefined>,
  minShare = 0.5,
): string | null {
  const counts = new Map<string, number>();
  let valid = 0;
  for (const sample of samples) {
    if (!sample) {
      continue;
    }
    valid += 1;
    counts.set(sample, (counts.get(sample) ?? 0) + 1);
  }
  if (valid === 0) {
    return null;
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [color, count] of counts) {
    if (count > bestCount) {
      best = color;
      bestCount = count;
    }
  }
  // A split vote means the ring hit glyphs or rules, not the page: keep the safe white fallback.
  return bestCount / valid > minShare ? best : null;
}
