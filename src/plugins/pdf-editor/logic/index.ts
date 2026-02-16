import { PDFDocument, rgb, StandardFonts, degrees } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import type { ToolLogicFunction } from '../../../core/types/contracts';

interface PdfTextEdit {
  pageIndex: number;
  text: string;
  xRatio: number; // Percent 0-100 in V3, but let's check
  yRatio: number; // Percent 0-100 in V3
  widthRatio: number; // Percent 0-100
  heightRatio: number; // Percent 0-100
  fontSize: number;
  fontFamily: string;
  color: string;
  backgroundColor: string;
  bold: boolean;
  italic: boolean;
  opacity: number;
  rotation: number;
  textAlign: 'left' | 'center' | 'right';
  horizontalScaling: number;
  originalRect?: {
    x: number;
    y: number;
    w: number;
    h: number;
  };
}

function parseHexColor(input: string | undefined, fallback: { r: number; g: number; b: number }): { r: number; g: number; b: number } {
  if (!input || input === 'transparent') {
    return fallback;
  }

  const value = input.trim();
  const hex = value.startsWith('#') ? value.slice(1) : value;

  if (hex.length === 3) {
    const r = parseInt(hex[0] + hex[0], 16) / 255;
    const g = parseInt(hex[1] + hex[1], 16) / 255;
    const b = parseInt(hex[2] + hex[2], 16) / 255;
    return { r, g, b };
  }

  if (hex.length === 6) {
    const r = parseInt(hex.slice(0, 2), 16) / 255;
    const g = parseInt(hex.slice(2, 4), 16) / 255;
    const b = parseInt(hex.slice(4, 6), 16) / 255;
    return { r, g, b };
  }

  return fallback;
}

function prepareTextForPDF(text: string) {
  return text
    .replace(/[\x00-\x1F\x7F-\x9F]/g, '')
    .replace(/[•●]/g, '-') // Replace bullets with dashes for standard font compatibility
    .replace(/[""]/g, '"')
    .replace(/['']/g, "'")
    .replace(/[–—]/g, '-')
    .replace(/[…]/g, '...');
}

interface DrawOptions {
  size: number;
  color: any;
  font: any;
  opacity: number;
  rotate: any;
  textAlign: 'left' | 'center' | 'right';
  scaleX: number;
}

const drawMultilineText = (page: any, text: string, anchorX: number, topY: number, boxHeight: number, options: DrawOptions) => {
  const lines = text.split('\n');
  const size = options.size;
  const font = options.font;
  const lineHeight = size * 1.25; // Slightly more generous line height
  const totalTextHeight = (lines.length - 1) * lineHeight + size;
  const textAlign = options.textAlign || 'left';
  const xScale = options.scaleX || 1.0;

  // Center the whole text block vertically within the edit box
  const verticalPadding = Math.max(0, (boxHeight - totalTextHeight) / 2);
  // Baseline of the first line. 
  // We move down by verticalPadding + roughly 92% of font size for the baseline.
  let currentY = topY - verticalPadding - (size * 0.92);

  lines.forEach((line) => {
    const safeLine = prepareTextForPDF(line);
    if (safeLine.trim()) {
      try {
        const rawWidth = font.widthOfTextAtSize(safeLine, size);
        const actualWidth = rawWidth * xScale;

        let lineX = anchorX;
        if (textAlign === 'center') {
          lineX = anchorX - (actualWidth / 2);
        } else if (textAlign === 'right') {
          lineX = anchorX - actualWidth;
        }

        page.drawText(safeLine, {
          ...options,
          x: lineX,
          y: currentY,
          font: font,
        });
      } catch (err) {
        console.error('Error drawing line:', err, safeLine);
      }
    }
    currentY -= lineHeight;
  });
};

const loadFonts = async (pdfDoc: any) => {
  pdfDoc.registerFontkit(fontkit);
  const fonts: Record<string, any> = {};
  const fontStyles = ['Regular', 'Bold', 'Italic', 'BoldItalic'];

  // In worker environment, we fetch from the public/fonts directory
  for (const style of fontStyles) {
    try {
      const response = await fetch(`/fonts/Roboto-${style}.ttf`);
      if (response.ok) {
        const fontBytes = await response.arrayBuffer();
        fonts[`Roboto-${style}`] = await pdfDoc.embedFont(fontBytes);
      }
    } catch (e) {
      console.warn(`Failed to load Roboto-${style} font:`, e);
    }
  }

  // Fallbacks to standard fonts
  const std = {
    helvetica: await pdfDoc.embedFont(StandardFonts.Helvetica),
    helveticaBold: await pdfDoc.embedFont(StandardFonts.HelveticaBold),
    helveticaOblique: await pdfDoc.embedFont(StandardFonts.HelveticaOblique),
    helveticaBoldOblique: await pdfDoc.embedFont(StandardFonts.HelveticaBoldOblique),
    courier: await pdfDoc.embedFont(StandardFonts.Courier),
    courierBold: await pdfDoc.embedFont(StandardFonts.CourierBold),
    times: await pdfDoc.embedFont(StandardFonts.TimesRoman),
    timesBold: await pdfDoc.embedFont(StandardFonts.TimesRomanBold),
  };

  const getBestFontForElement = (el: PdfTextEdit) => {
    const hasUnicode = /[^\x00-\x7F]/.test(el.text);
    const isRoboto = el.fontFamily === 'Roboto' || hasUnicode;

    if (isRoboto) {
      let selected = null;
      if (el.bold && el.italic) selected = fonts['Roboto-BoldItalic'];
      else if (el.bold) selected = fonts['Roboto-Bold'];
      else if (el.italic) selected = fonts['Roboto-Italic'];
      else selected = fonts['Roboto-Regular'];

      if (selected) return selected;

      // Fallback
      if (el.bold && el.italic) return std.helveticaBoldOblique;
      if (el.bold) return std.helveticaBold;
      if (el.italic) return std.helveticaOblique;
      return std.helvetica;
    }

    if (el.fontFamily.includes('Courier')) {
      return el.bold ? std.courierBold : std.courier;
    }
    if (el.fontFamily.includes('Times')) {
      return el.bold ? std.timesBold : std.times;
    }
    return std.helvetica;
  };

  return { getBestFontForElement };
};

export const run: ToolLogicFunction = async ({ inputIds, fs, options, emitProgress }) => {
  if (inputIds.length === 0) {
    throw new Error('PDF Editor requires at least one input file');
  }

  const edits = (options?.edits as PdfTextEdit[]) || [];
  if (edits.length === 0) {
    throw new Error('PDF Editor requires at least one text edit');
  }

  const outputIds: string[] = [];

  for (let i = 0; i < inputIds.length; i += 1) {
    const entry = await fs.read(inputIds[i]);
    const bytes = new Uint8Array(await (await entry.getBlob()).arrayBuffer());
    const pdfDoc = await PDFDocument.load(bytes);

    const { getBestFontForElement } = await loadFonts(pdfDoc);
    const pages = pdfDoc.getPages();

    for (const edit of edits) {
      if (edit.pageIndex >= pages.length) continue;

      const page = pages[edit.pageIndex];
      const { width, height } = page.getSize();

      const color = parseHexColor(edit.color, { r: 0, g: 0, b: 0 });
      const font = getBestFontForElement(edit);

      const xPos = (edit.xRatio / 100) * width;
      const yPos = height - ((edit.yRatio / 100) * height);

      if (edit.originalRect) {
        const rectX = (edit.originalRect.x / 100) * width;
        const rectY = height - ((edit.originalRect.y / 100) * height);
        const rectW = (edit.originalRect.w / 100) * width;
        const rectH = (edit.originalRect.h / 100) * height;

        const bgColor = parseHexColor(edit.backgroundColor || '#FFFFFF', { r: 1, g: 1, b: 1 });

        page.drawRectangle({
          x: rectX,
          y: rectY - rectH,
          width: rectW,
          height: rectH,
          color: rgb(bgColor.r, bgColor.g, bgColor.b),
        });
      }

      const editBoxHeight = (edit.heightRatio / 100) * height;

      drawMultilineText(page, edit.text, xPos, yPos, editBoxHeight, {
        size: edit.fontSize,
        color: rgb(color.r, color.g, color.b),
        font: font,
        opacity: (edit.opacity ?? 100) / 100,
        rotate: degrees(edit.rotation || 0),
        textAlign: edit.textAlign || 'left',
        scaleX: edit.horizontalScaling || 1.0,
      });
    }

    const outBytes = await pdfDoc.save();
    const outEntry = await fs.write(new Blob([outBytes as any], { type: 'application/pdf' }));
    outputIds.push(outEntry.id);

    emitProgress?.(Math.round(((i + 1) / inputIds.length) * 100));
  }

  return { outputIds };
};
