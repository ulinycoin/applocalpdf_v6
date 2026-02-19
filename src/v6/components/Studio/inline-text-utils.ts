import type { PDFFont } from 'pdf-lib';

export type FontFamilyId = 'sora' | 'times' | 'mono';

export interface TextLayerSpanLike {
  id: string;
  text: string;
  xRatio: number;
  yRatio: number;
  widthRatio: number;
  heightRatio: number;
  fontSizeRatio: number;
  fontName?: string;
  fontFamilyHint?: string;
  pageHeightPt?: number;
  ascentRatio?: number;
}

export interface PointRatio {
  x: number;
  y: number;
}

export interface MergedTextLine {
  left: number;
  top: number;
  width: number;
  height: number;
  text: string;
  fontSizeRatio: number;
  fontName?: string;
  fontFamilyHint?: string;
  pageHeightPt?: number;
  ascentRatio?: number;
}

const FONT_EXACT_MAP: Record<string, FontFamilyId> = {
  helvetica: 'sora',
  arial: 'sora',
  sans: 'sora',
  freesans: 'sora',
  timesroman: 'times',
  timesnewroman: 'times',
  times: 'times',
  serif: 'times',
  courier: 'mono',
  couriernew: 'mono',
  mono: 'mono',
  monospace: 'mono',
};

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function normalizeFontName(fontName?: string | null): string {
  if (!fontName) {
    return '';
  }
  const normalized = fontName.trim().replace(/^[A-Z]{6}\+/u, '').toLowerCase();
  return normalized.replace(/[^a-z0-9]+/gu, '');
}

export function resolveFontFamily(fontName?: string, fontFamilyHint?: string): FontFamilyId {
  const candidates = [normalizeFontName(fontName), normalizeFontName(fontFamilyHint)].filter(Boolean);

  for (const candidate of candidates) {
    if (FONT_EXACT_MAP[candidate]) {
      return FONT_EXACT_MAP[candidate];
    }
    if (candidate.includes('courier') || candidate.includes('mono') || candidate.includes('code')) {
      return 'mono';
    }
    if (candidate.includes('times') || (candidate.includes('serif') && !candidate.includes('sans'))) {
      return 'times';
    }
    if (candidate.includes('helvetica') || candidate.includes('arial') || candidate.includes('sans')) {
      return 'sora';
    }
  }

  return 'sora';
}

export function sanitizeInlineText(value: string): string {
  // Remove null characters and other problematic controls, normalize newlines to spaces
  return value.replace(/\0/g, '').replace(/[\r\n]+/gu, ' ');
}

function distanceToRect(point: PointRatio, span: TextLayerSpanLike): number {
  const left = span.xRatio;
  const right = span.xRatio + span.widthRatio;
  const top = span.yRatio;
  const bottom = span.yRatio + span.heightRatio;

  const dx = point.x < left ? left - point.x : point.x > right ? point.x - right : 0;
  const dy = point.y < top ? top - point.y : point.y > bottom ? point.y - bottom : 0;
  return Math.hypot(dx, dy);
}

export function findNearestTextSpan(
  point: PointRatio,
  spans: TextLayerSpanLike[],
  maxDistance = 0.018,
): TextLayerSpanLike | null {
  let best: TextLayerSpanLike | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const span of spans) {
    const distance = distanceToRect(point, span);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = span;
    }
  }

  if (!best || bestDistance > maxDistance) {
    return null;
  }

  return best;
}

export function mergeTextLine(spans: TextLayerSpanLike[], anchor: TextLayerSpanLike): MergedTextLine | null {
  const lineThreshold = Math.max(0.0025, anchor.heightRatio * 0.55);
  const lineSpans = spans
    .filter((candidate) => (
      Math.abs(candidate.yRatio - anchor.yRatio) <= lineThreshold
      || Math.abs((candidate.yRatio + candidate.heightRatio) - (anchor.yRatio + anchor.heightRatio)) <= lineThreshold
    ))
    .sort((a, b) => a.xRatio - b.xRatio);

  if (lineSpans.length === 0) {
    return null;
  }

  const left = Math.min(...lineSpans.map((item) => item.xRatio));
  const top = Math.min(...lineSpans.map((item) => item.yRatio));
  const right = Math.max(...lineSpans.map((item) => item.xRatio + item.widthRatio));
  const bottom = Math.max(...lineSpans.map((item) => item.yRatio + item.heightRatio));

  let mergedText = '';
  for (let i = 0; i < lineSpans.length; i += 1) {
    const current = lineSpans[i];
    if (i > 0) {
      const prev = lineSpans[i - 1];
      const gap = current.xRatio - (prev.xRatio + prev.widthRatio);
      if (gap > Math.max(0.0015, current.heightRatio * 0.2) && !mergedText.endsWith(' ') && !current.text.startsWith(' ')) {
        mergedText += ' ';
      }
    }
    mergedText += current.text;
  }

  const text = mergedText.replace(/\s+/gu, ' ').trim();
  if (!text) {
    return null;
  }

  const fontSizeRatio = lineSpans.reduce((acc, current) => Math.max(acc, current.fontSizeRatio), anchor.fontSizeRatio);

  return {
    left,
    top,
    width: right - left,
    height: bottom - top,
    text,
    fontSizeRatio,
    fontName: anchor.fontName,
    fontFamilyHint: anchor.fontFamilyHint,
    pageHeightPt: anchor.pageHeightPt,
    ascentRatio: anchor.ascentRatio,
  };
}

export function estimateInlineFontSizePt(fontSizeRatio: number, pageHeightPt: number): number {
  const size = fontSizeRatio * pageHeightPt;
  return Number(clamp(size, 8, 96).toFixed(2));
}

function measureTextWidthWithTracking(font: PDFFont, text: string, fontSize: number, tracking: number): number {
  if (!text) {
    return 0;
  }
  return font.widthOfTextAtSize(text, fontSize) + tracking * Math.max(0, text.length - 1);
}

export interface FittedTextLayout {
  fontSize: number;
  tracking: number;
  overflow: boolean;
}

export function fitTextToWidth(
  font: PDFFont,
  text: string,
  targetWidth: number,
  preferredFontSize: number,
  minFontSize = 8,
): FittedTextLayout {
  const safeText = text || ' ';
  let fontSize = preferredFontSize;
  let tracking = 0;

  const fitAtSize = (size: number) => {
    const baseWidth = font.widthOfTextAtSize(safeText, size);
    if (baseWidth <= targetWidth || safeText.length <= 1) {
      return { size, tracking: 0, width: baseWidth };
    }
    const minTracking = -0.08 * size;
    const neededTracking = (targetWidth - baseWidth) / (safeText.length - 1);
    const nextTracking = clamp(neededTracking, minTracking, 0);
    const width = measureTextWidthWithTracking(font, safeText, size, nextTracking);
    return { size, tracking: nextTracking, width };
  };

  let fitted = fitAtSize(fontSize);
  while (fitted.width > targetWidth && fontSize > minFontSize) {
    fontSize = Math.max(minFontSize, fontSize - 0.5);
    fitted = fitAtSize(fontSize);
  }

  tracking = fitted.tracking;

  return {
    fontSize,
    tracking,
    overflow: fitted.width > targetWidth,
  };
}
