/**
 * Rasterises text that no embedded font can render.
 *
 * CJK and Arabic faces are not shipped with the app (bundle size and font licensing), but the browser
 * can already draw those scripts through the system fonts it has. So instead of degrading a sentence
 * to `?????`, the run is painted to a canvas and embedded as an image — the same trade-off the
 * Word/Excel importers already make. The result is visible but not selectable text.
 */

const RASTER_FONT_STACK = '"Noto Sans","Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji","Segoe UI Symbol","Arial Unicode MS","Noto Sans CJK SC","Noto Sans CJK JP","Noto Sans CJK KR","PingFang SC","Hiragino Sans","Yu Gothic","Microsoft YaHei","Noto Sans Arabic","Geeza Pro","Noto Sans Devanagari","Mangal",sans-serif';

/** Oversampling so the glyphs stay crisp when the page is zoomed or printed. */
const DEFAULT_RASTER_SCALE = 4;

export interface RasterTextResult {
  bytes: Uint8Array;
  widthPt: number;
  heightPt: number;
  /** Distance from the top of the image down to the text baseline, in points. */
  baselineOffsetPt: number;
}

type Canvas2D = {
  canvas: OffscreenCanvas | HTMLCanvasElement;
  context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
};

function create2dCanvas(width: number, height: number): Canvas2D | null {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));

  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(w, h);
    const context = canvas.getContext('2d');
    if (context) {
      return { canvas, context: context as OffscreenCanvasRenderingContext2D };
    }
    return null;
  }

  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const context = canvas.getContext('2d');
    if (context) {
      return { canvas, context };
    }
  }

  return null;
}

export function isRasterTextAvailable(): boolean {
  return typeof OffscreenCanvas !== 'undefined' || typeof document !== 'undefined';
}

function toCssColor(hex: string): string {
  const normalized = hex.trim();
  return normalized.startsWith('#') ? normalized : '#000000';
}

export async function rasterizeTextRun(params: {
  text: string;
  fontSizePt: number;
  bold: boolean;
  colorHex: string;
  scale?: number;
}): Promise<RasterTextResult | null> {
  const { text, fontSizePt, bold, colorHex } = params;
  if (!text.trim()) {
    return null;
  }
  const scale = params.scale ?? DEFAULT_RASTER_SCALE;
  const fontPx = Math.max(2, fontSizePt * scale);
  const fontWeight = bold ? '700' : '400';
  const font = `${fontWeight} ${fontPx}px ${RASTER_FONT_STACK}`;

  const probe = create2dCanvas(16, 16);
  if (!probe) {
    return null;
  }
  probe.context.font = font;
  const naturalWidth = Math.max(1, (probe.context.measureText(text).width || 0));
  const padding = Math.ceil(fontPx * 0.12);
  const imageWidth = Math.ceil(naturalWidth) + (padding * 2);
  const imageHeight = Math.ceil(fontPx * 1.4);

  const target = create2dCanvas(imageWidth, imageHeight);
  if (!target) {
    return null;
  }
  const { canvas, context } = target;
  context.clearRect(0, 0, imageWidth, imageHeight);
  context.fillStyle = toCssColor(colorHex);
  context.textBaseline = 'top';
  context.font = font;
  const drawTop = Math.ceil(fontPx * 0.08);
  context.fillText(text, padding, drawTop);
  // Browsers expose the real ascent; the 0.88em fallback matches a typical CJK/Arabic face.
  const metrics = context.measureText(text) as TextMetrics & { fontBoundingBoxAscent?: number };
  const ascentPx = typeof metrics.fontBoundingBoxAscent === 'number' && metrics.fontBoundingBoxAscent > 0
    ? metrics.fontBoundingBoxAscent
    : fontPx * 0.88;

  let blob: Blob | null = null;
  if (typeof OffscreenCanvas !== 'undefined' && canvas instanceof OffscreenCanvas) {
    blob = await canvas.convertToBlob({ type: 'image/png' });
  } else if (typeof HTMLCanvasElement !== 'undefined' && canvas instanceof HTMLCanvasElement) {
    blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  }
  if (!blob) {
    return null;
  }

  return {
    bytes: new Uint8Array(await blob.arrayBuffer()),
    widthPt: imageWidth / scale,
    heightPt: imageHeight / scale,
    baselineOffsetPt: (drawTop + ascentPx) / scale,
  };
}
