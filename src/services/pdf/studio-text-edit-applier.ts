import { PDFDocument, StandardFonts, rgb, type PDFFont } from 'pdf-lib';
import type { WorkerStudioEditElement, WorkerStudioFontFamilyId } from '../../core/types/contracts';

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function sanitizeInlineText(value: string): string {
  return value.replace(/[\r\n]+/gu, ' ');
}

function measureTextWidthWithTracking(font: PDFFont, text: string, fontSize: number, tracking: number): number {
  if (!text) {
    return 0;
  }
  return font.widthOfTextAtSize(text, fontSize) + tracking * Math.max(0, text.length - 1);
}

function fitTextToWidth(
  font: PDFFont,
  text: string,
  targetWidth: number,
  preferredFontSize: number,
  minFontSize = 8,
): { fontSize: number; tracking: number; overflow: boolean } {
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

function hexToRgb(color: string): { r: number; g: number; b: number } {
  const normalized = color.replace('#', '').trim();
  const safe = normalized.length === 3
    ? normalized
      .split('')
      .map((ch) => ch + ch)
      .join('')
    : normalized.padEnd(6, '0').slice(0, 6);
  const intValue = Number.parseInt(safe, 16);
  if (Number.isNaN(intValue)) {
    return { r: 0, g: 0, b: 0 };
  }
  return {
    r: ((intValue >> 16) & 255) / 255,
    g: ((intValue >> 8) & 255) / 255,
    b: (intValue & 255) / 255,
  };
}

function getPdfFontName(
  fontFamily: WorkerStudioFontFamilyId,
  fontWeight: 'normal' | 'bold',
  fontStyle: 'normal' | 'italic',
) {
  if (fontFamily === 'times') {
    if (fontWeight === 'bold' && fontStyle === 'italic') {
      return StandardFonts.TimesRomanBoldItalic;
    }
    if (fontWeight === 'bold') {
      return StandardFonts.TimesRomanBold;
    }
    if (fontStyle === 'italic') {
      return StandardFonts.TimesRomanItalic;
    }
    return StandardFonts.TimesRoman;
  }

  if (fontFamily === 'mono') {
    if (fontWeight === 'bold') {
      return StandardFonts.CourierBold;
    }
    return StandardFonts.Courier;
  }

  if (fontWeight === 'bold' && fontStyle === 'italic') {
    return StandardFonts.HelveticaBoldOblique;
  }
  if (fontWeight === 'bold') {
    return StandardFonts.HelveticaBold;
  }
  if (fontStyle === 'italic') {
    return StandardFonts.HelveticaOblique;
  }
  return StandardFonts.Helvetica;
}

export async function applyStudioTextEditsToPdfBytes(params: {
  sourceBytes: Uint8Array;
  pageIndex: number;
  elements: WorkerStudioEditElement[];
}): Promise<{ outputBytes: Uint8Array; overflowDetected: boolean }> {
  const pdf = await PDFDocument.load(params.sourceBytes);
  if (params.pageIndex < 0 || params.pageIndex >= pdf.getPageCount()) {
    throw new Error(`Page index out of range: ${params.pageIndex}`);
  }

  const page = pdf.getPage(params.pageIndex);
  const pageWidth = page.getWidth();
  const pageHeight = page.getHeight();

  const fontCache = new Map<string, PDFFont>();
  const getFont = async (family: WorkerStudioFontFamilyId, weight: 'normal' | 'bold', style: 'normal' | 'italic') => {
    const fontName = getPdfFontName(family, weight, style);
    const key = String(fontName);
    const cached = fontCache.get(key);
    if (cached) {
      return cached;
    }
    const embedded = await pdf.embedFont(fontName);
    fontCache.set(key, embedded);
    return embedded;
  };

  let overflowDetected = false;
  for (const element of params.elements) {
    if (element.type === 'text') {
      const font = await getFont(element.fontFamily, element.fontWeight, element.fontStyle);
      const { r, g, b } = hexToRgb(element.color);
      const line = sanitizeInlineText(element.text || ' ');
      const blockWidth = element.w * pageWidth;
      const fit = fitTextToWidth(font, line, blockWidth, element.fontSize, 8);
      overflowDetected ||= fit.overflow;

      const lineWidth = font.widthOfTextAtSize(line, fit.fontSize) + fit.tracking * Math.max(0, line.length - 1);
      let x = element.x * pageWidth;
      if (element.textAlign === 'center') {
        x += Math.max(0, (blockWidth - lineWidth) / 2);
      }
      if (element.textAlign === 'right') {
        x += Math.max(0, blockWidth - lineWidth);
      }
      const yTop = element.y * pageHeight;
      const y = pageHeight - yTop - fit.fontSize;

      if (fit.tracking === 0 || line.length <= 1) {
        page.drawText(line, {
          x,
          y,
          size: fit.fontSize,
          font,
          color: rgb(r, g, b),
          opacity: element.opacity,
        });
      } else {
        let cursor = x;
        for (const char of line) {
          page.drawText(char, {
            x: cursor,
            y,
            size: fit.fontSize,
            font,
            color: rgb(r, g, b),
            opacity: element.opacity,
          });
          cursor += font.widthOfTextAtSize(char, fit.fontSize) + fit.tracking;
        }
      }
      continue;
    }

    if (element.type === 'stroke') {
      if (element.points.length < 4) {
        continue;
      }
      const { r, g, b } = hexToRgb(element.color);
      for (let i = 0; i < element.points.length - 2; i += 2) {
        const sx = element.points[i] * pageWidth;
        const sy = pageHeight - (element.points[i + 1] * pageHeight);
        const ex = element.points[i + 2] * pageWidth;
        const ey = pageHeight - (element.points[i + 3] * pageHeight);
        page.drawLine({
          start: { x: sx, y: sy },
          end: { x: ex, y: ey },
          thickness: element.width,
          color: rgb(r, g, b),
          opacity: element.opacity,
        });
      }
      continue;
    }

    const sx = element.x * pageWidth;
    const sy = pageHeight - ((element.y + element.h) * pageHeight);
    const sw = element.w * pageWidth;
    const sh = element.h * pageHeight;
    const strokeRgb = hexToRgb(element.stroke);
    const fillRgb = hexToRgb(element.fill);
    const fillColor = element.fill === 'transparent'
      ? undefined
      : rgb(fillRgb.r, fillRgb.g, fillRgb.b);

    page.drawRectangle({
      x: sx,
      y: sy,
      width: sw,
      height: sh,
      borderWidth: element.strokeWidth,
      borderColor: rgb(strokeRgb.r, strokeRgb.g, strokeRgb.b),
      color: fillColor,
      opacity: element.opacity,
      borderOpacity: element.opacity,
    });
  }

  const outputBytes = await pdf.save();
  const stableBytes = new Uint8Array(outputBytes.byteLength);
  stableBytes.set(outputBytes);
  return { outputBytes: stableBytes, overflowDetected };
}
