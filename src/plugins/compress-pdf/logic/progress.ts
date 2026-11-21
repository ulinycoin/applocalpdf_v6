/**
 * Maps the engine's per-pass image progress into a single percentage for the whole run.
 *
 * The panel shows one bar for all input files, while the engine reports passes over a preset ladder.
 * Keeping this arithmetic pure makes the division and clamping testable without a worker.
 */
export function compressProgressPercent(
  fileIndex: number,
  fileCount: number,
  progress: { pass: number; passes: number; processedImages: number; totalImages: number },
): number {
  if (fileCount <= 0) {
    return 0;
  }
  const withinPass = progress.totalImages > 0 ? progress.processedImages / progress.totalImages : 0;
  const passFraction = progress.passes > 0 ? (progress.pass - 1 + withinPass) / progress.passes : 0;
  const overall = ((fileIndex + passFraction) / fileCount) * 100;
  return Math.max(0, Math.min(99, Math.round(overall)));
}
