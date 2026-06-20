export interface NormalizedOriginalRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function buildOriginalRect(bounds: {
  left: number;
  top: number;
  width: number;
  height: number;
}): NormalizedOriginalRect {
  return {
    x: bounds.left,
    y: bounds.top,
    w: bounds.width,
    h: bounds.height,
  };
}

export function resolveTargetRect(element: {
  x: number;
  y: number;
  w: number;
  h: number;
  originalRect?: NormalizedOriginalRect;
}): NormalizedOriginalRect {
  return element.originalRect ?? { x: element.x, y: element.y, w: element.w, h: element.h };
}

export function textElementMovedFromOriginal(element: {
  type: string;
  x: number;
  y: number;
  originalRect?: NormalizedOriginalRect;
}): boolean {
  if (element.type !== 'text' || !element.originalRect) {
    return false;
  }
  const tolerance = 0.0025;
  return (
    Math.abs(element.x - element.originalRect.x) > tolerance
    || Math.abs(element.y - element.originalRect.y) > tolerance
  );
}

export function normalizeOriginalRectInput(input: unknown): NormalizedOriginalRect | undefined {
  if (!input || typeof input !== 'object') {
    return undefined;
  }
  const rect = input as Record<string, unknown>;
  const x = rect.x;
  const y = rect.y;
  const w = rect.w;
  const h = rect.h;
  if (
    typeof x !== 'number' || !Number.isFinite(x)
    || typeof y !== 'number' || !Number.isFinite(y)
    || typeof w !== 'number' || !Number.isFinite(w)
    || typeof h !== 'number' || !Number.isFinite(h)
  ) {
    return undefined;
  }
  return {
    x: Math.max(0, Math.min(1, x)),
    y: Math.max(0, Math.min(1, y)),
    w: Math.max(0.001, Math.min(1, w)),
    h: Math.max(0.001, Math.min(1, h)),
  };
}
