import type { PDFPage } from 'pdf-lib';
import { PDFName } from 'pdf-lib';

export type PageRotation = 0 | 90 | 180 | 270;

export interface RatioRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Geometry of a page as the user sees it.
 *
 * pdf-lib works in the unrotated MediaBox coordinate system, while the editor works in the space
 * pdf.js reports — the *displayed* page, where `/Rotate 90` swaps the axes. Every ratio that comes
 * from the editor is a ratio of the displayed page, so it has to be converted before it can be
 * matched against content-stream coordinates or drawn.
 *
 * The mapping mirrors `page.getViewport({scale: 1}).transform`:
 *   0°   → dx = x,            dy = H - y
 *   90°  → dx = y,            dy = x
 *   180° → dx = W - x,        dy = y
 *   270° → dx = H - y,        dy = W - x
 * where (dx, dy) are display pixels (y down) and (x, y) are user-space points (y up).
 */
export interface PageGeometry {
  rotation: PageRotation;
  mediaWidth: number;
  mediaHeight: number;
  displayWidth: number;
  displayHeight: number;
  /** Rotation to give text and images so they appear upright on the displayed page. */
  uprightRotationDegrees: number;
  /** Display-space ratio point (y down) → user-space point (y up). */
  toUserPoint(xRatio: number, yRatio: number): { x: number; y: number };
  /** Display-space ratio rect → user-space rect with a bottom-left origin (for pdf-lib drawing). */
  toUserRect(rect: RatioRect): { x: number; y: number; w: number; h: number };
  /** Display-space ratio rect → user-space ratio rect with a top-down origin (for content stream matching). */
  toUserRatiosTopDown(rect: RatioRect): RatioRect;
}

/** Placement arguments an AcroForm widget needs so it survives a page rotation. */
export interface WidgetPlacement {
  x: number;
  y: number;
  width: number;
  height: number;
  /** Rotation to hand to pdf-lib's `rotate` option; it equals the page rotation. */
  rotate: PageRotation;
}

/**
 * Placement for an AcroForm widget on a rotated page.
 *
 * Annotation appearance streams are written in unrotated user space and the viewer then rotates them
 * together with the page, so a field on a `/Rotate 90/180/270` page shows its value sideways unless
 * the widget itself counter-rotates. pdf-lib expresses that through the widget `/MK /R` entry: it
 * lays the value out for the *displayed* box and emits `rotateInPlace` into the appearance stream.
 * Its rect maths, however, assume the caller already passes the rotated rectangle, so the box handed
 * to `addToPage` has to be pre-compensated — this returns exactly that box, such that the emitted
 * `/Rect` still equals `geometry.toUserRect(rect)`.
 */
export function resolveWidgetPlacement(params: {
  geometry: PageGeometry;
  rect: RatioRect;
  /** Widget border width in points; the appearance box grows by it, like `addToPage` does. */
  borderWidth: number;
}): WidgetPlacement {
  const { geometry, rect, borderWidth } = params;
  const box = geometry.toUserRect(rect);
  if (geometry.rotation === 0) {
    // Exactly what pdf-lib computes for a plain `addToPage` on an unrotated page.
    return { x: box.x, y: box.y, width: box.w, height: box.h, rotate: 0 };
  }
  const half = borderWidth / 2;
  const swapsAxes = geometry.rotation === 90 || geometry.rotation === 270;
  const width = Math.max(0.01, (swapsAxes ? box.h : box.w) - borderWidth);
  const height = Math.max(0.01, (swapsAxes ? box.w : box.h) - borderWidth);
  // pdf-lib rotates the rect around the passed corner, so each direction has to start from the
  // corner its rotation leaves fixed.
  if (geometry.rotation === 90) {
    return { x: box.x + box.w - half, y: box.y + half, width, height, rotate: 90 };
  }
  if (geometry.rotation === 180) {
    return { x: box.x + box.w - half, y: box.y + box.h - half, width, height, rotate: 180 };
  }
  return { x: box.x + half, y: box.y + box.h - half, width, height, rotate: 270 };
}

export function normalizeRotation(value: unknown): PageRotation {
  const angle = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  const normalized = ((Math.round(angle / 90) * 90) % 360 + 360) % 360;
  return (normalized === 90 || normalized === 180 || normalized === 270 ? normalized : 0) as PageRotation;
}

export function resolvePageGeometry(page: PDFPage): PageGeometry {
  const rotation = normalizeRotation(readPageRotation(page));
  const mediaWidth = page.getWidth();
  const mediaHeight = page.getHeight();
  const swapsAxes = rotation === 90 || rotation === 270;
  const displayWidth = swapsAxes ? mediaHeight : mediaWidth;
  const displayHeight = swapsAxes ? mediaWidth : mediaHeight;

  const toUserPoint = (xRatio: number, yRatio: number) => {
    const dx = xRatio * displayWidth;
    const dy = yRatio * displayHeight;
    if (rotation === 90) {
      return { x: dy, y: dx };
    }
    if (rotation === 180) {
      return { x: mediaWidth - dx, y: dy };
    }
    if (rotation === 270) {
      return { x: mediaWidth - dy, y: mediaHeight - dx };
    }
    return { x: dx, y: mediaHeight - dy };
  };

  const toUserRect = (rect: RatioRect) => {
    const corners = [
      toUserPoint(rect.x, rect.y),
      toUserPoint(rect.x + rect.w, rect.y),
      toUserPoint(rect.x, rect.y + rect.h),
      toUserPoint(rect.x + rect.w, rect.y + rect.h),
    ];
    const xs = corners.map((point) => point.x);
    const ys = corners.map((point) => point.y);
    const left = Math.min(...xs);
    const bottom = Math.min(...ys);
    return {
      x: left,
      y: bottom,
      w: Math.max(...xs) - left,
      h: Math.max(...ys) - bottom,
    };
  };

  return {
    rotation,
    mediaWidth,
    mediaHeight,
    displayWidth,
    displayHeight,
    uprightRotationDegrees: rotation,
    toUserPoint,
    toUserRect,
    toUserRatiosTopDown: (rect) => {
      const user = toUserRect(rect);
      return {
        x: user.x / mediaWidth,
        y: 1 - (user.y + user.h) / mediaHeight,
        w: user.w / mediaWidth,
        h: user.h / mediaHeight,
      };
    },
  };
}

function readPageRotation(page: PDFPage): number {
  try {
    const rotation = page.getRotation();
    return typeof rotation?.angle === 'number' ? rotation.angle : 0;
  } catch {
    // Fall back to the raw attribute for documents pdf-lib cannot normalise.
    try {
      const raw = page.node.get(PDFName.of('Rotate'));
      const value = Number(String(raw));
      return Number.isFinite(value) ? value : 0;
    } catch {
      return 0;
    }
  }
}
