import { clamp01 } from '../../utils/studio-edit-math';

export interface BaselineSpanLike {
  yRatio: number;
  heightRatio: number;
  ascentRatio?: number;
  pageHeightPt?: number;
}

export function spanBaselineRatio(span: BaselineSpanLike): number {
  return clamp01(span.yRatio + (span.ascentRatio ?? span.heightRatio * 0.8));
}

/** CSS/PDF shared estimate: distance from box top to alphabetic baseline, in page ratios. */
export function estimateBaselineOffsetRatio(
  fontSizePt: number,
  lineHeight: number,
  pageHeightPt: number,
): number {
  const safePage = Math.max(1, pageHeightPt);
  const lineBox = fontSizePt * Math.max(1, lineHeight);
  const halfLeading = Math.max(0, (lineBox - fontSizePt) / 2);
  const emAscent = fontSizePt * 0.8;
  return clamp01((halfLeading + emAscent) / safePage);
}

export function collectNearbyBaselineGuides(
  spans: BaselineSpanLike[],
  aroundBaseline: number,
  maxDistance = 0.035,
  limit = 6,
): number[] {
  const buckets = new Map<number, number>();
  for (const span of spans) {
    const baseline = spanBaselineRatio(span);
    if (Math.abs(baseline - aroundBaseline) > maxDistance) {
      continue;
    }
    // Quantize to merge near-identical baselines from glyph runs.
    const key = Math.round(baseline * 2000) / 2000;
    buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }
  return [...buckets.entries()]
    .sort((left, right) => right[1] - left[1] || Math.abs(left[0] - aroundBaseline) - Math.abs(right[0] - aroundBaseline))
    .slice(0, limit)
    .map(([baseline]) => baseline)
    .sort((left, right) => left - right);
}

export function snapOverlayTextToBaselines(params: {
  y: number;
  fontSize: number;
  lineHeight: number;
  pageHeightPt: number;
  spans: BaselineSpanLike[];
  threshold?: number;
}): {
  y: number;
  baselineRatio?: number;
  guides: number[];
  snapped: boolean;
} {
  const threshold = params.threshold ?? 0.012;
  const offset = estimateBaselineOffsetRatio(params.fontSize, params.lineHeight, params.pageHeightPt);
  const currentBaseline = clamp01(params.y + offset);
  const guides = collectNearbyBaselineGuides(params.spans, currentBaseline);
  if (guides.length === 0) {
    return { y: clamp01(params.y), guides, snapped: false };
  }

  let best = guides[0]!;
  let bestDistance = Math.abs(best - currentBaseline);
  for (const guide of guides) {
    const distance = Math.abs(guide - currentBaseline);
    if (distance < bestDistance) {
      best = guide;
      bestDistance = distance;
    }
  }

  if (bestDistance > threshold) {
    return { y: clamp01(params.y), baselineRatio: undefined, guides, snapped: false };
  }

  return {
    y: clamp01(best - offset),
    baselineRatio: best,
    guides,
    snapped: true,
  };
}
