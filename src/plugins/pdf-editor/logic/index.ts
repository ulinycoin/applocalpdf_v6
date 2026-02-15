import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import type { ToolLogicFunction } from '../../../core/types/contracts';

interface PdfTextEdit {
  pageIndex: number;
  text: string;
  xRatio: number;
  yRatio: number;
  widthRatio: number;
  heightRatio: number;
  fontSizeRatio: number;
  color?: string;
  backgroundColor?: string;
  fontName?: string;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function parseHexColor(input: string | undefined, fallback: { r: number; g: number; b: number }): { r: number; g: number; b: number } {
  if (!input) {
    return fallback;
  }

  const value = input.trim();
  const hex = value.startsWith('#') ? value.slice(1) : value;

  if (/^[0-9a-fA-F]{3}$/.test(hex)) {
    const r = parseInt(hex[0] + hex[0], 16) / 255;
    const g = parseInt(hex[1] + hex[1], 16) / 255;
    const b = parseInt(hex[2] + hex[2], 16) / 255;
    return { r, g, b };
  }

  if (/^[0-9a-fA-F]{6}$/.test(hex)) {
    const r = parseInt(hex.slice(0, 2), 16) / 255;
    const g = parseInt(hex.slice(2, 4), 16) / 255;
    const b = parseInt(hex.slice(4, 6), 16) / 255;
    return { r, g, b };
  }

  return fallback;
}

function parseEdit(raw: unknown): PdfTextEdit | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const candidate = raw as Record<string, unknown>;
  const pageIndex = Number(candidate.pageIndex);
  const text = typeof candidate.text === 'string' ? candidate.text : '';
  const xRatio = Number(candidate.xRatio);
  const yRatio = Number(candidate.yRatio);
  const widthRatio = Number(candidate.widthRatio);
  const heightRatio = Number(candidate.heightRatio);
  const fontSizeRatio = Number(candidate.fontSizeRatio);
  const color = typeof candidate.color === 'string' ? candidate.color : undefined;
  const backgroundColor = typeof candidate.backgroundColor === 'string' ? candidate.backgroundColor : undefined;
  const fontName = typeof candidate.fontName === 'string' ? candidate.fontName : undefined;

  if (!Number.isInteger(pageIndex) || pageIndex < 0) {
    return null;
  }

  if (!Number.isFinite(xRatio) || !Number.isFinite(yRatio) || !Number.isFinite(widthRatio) || !Number.isFinite(heightRatio) || !Number.isFinite(fontSizeRatio)) {
    return null;
  }

  return {
    pageIndex,
    text,
    xRatio: clamp(xRatio, 0, 1),
    yRatio: clamp(yRatio, 0, 1),
    widthRatio: clamp(widthRatio, 0.02, 1),
    heightRatio: clamp(heightRatio, 0.02, 1),
    fontSizeRatio: clamp(fontSizeRatio, 0.005, 0.3),
    color,
    backgroundColor,
    fontName,
  };
}

function getEdits(options: Record<string, unknown> | undefined): PdfTextEdit[] {
  if (!options) {
    return [];
  }

  const rawEdits = options.edits;
  if (!Array.isArray(rawEdits)) {
    return [];
  }

  return rawEdits
    .map((item) => parseEdit(item))
    .filter((item): item is PdfTextEdit => item !== null);
}

function mapToStandardFont(name: string | undefined): StandardFonts {
  if (!name) return StandardFonts.Helvetica;
  const lower = name.toLowerCase();
  if (lower.includes('times') || lower.includes('serif')) return StandardFonts.TimesRoman;
  if (lower.includes('courier') || lower.includes('mono')) return StandardFonts.Courier;
  if (lower.includes('bold')) {
    if (lower.includes('times')) return StandardFonts.TimesRomanBold;
    return StandardFonts.HelveticaBold;
  }
  return StandardFonts.Helvetica;
}

/**
 * Sanitizes text to be WinAnsi compatible for standard fonts.
 * Replaces unsupported characters with closest equivalents or '?'.
 */
function sanitizeText(text: string): string {
  const replacements: Record<string, string> = {
    'ī': 'i', 'ā': 'a', 'ē': 'e', 'ō': 'o', 'ū': 'u',
    'Ī': 'I', 'Ā': 'A', 'Ē': 'E', 'Ō': 'O', 'Ū': 'U',
    '—': '-', '–': '-', '«': '"', '»': '"', '„': '"', '“': '"', '”': '"',
    '’': "'", '‘': "'",
  };

  return text.split('').map(char => {
    if (replacements[char]) return replacements[char];
    const code = char.charCodeAt(0);
    // Standard fonts throw on codes > 255 and some specific gaps.
    // We'll be conservative and use ASCII + some Latin-1 if it's common.
    return code > 255 ? '?' : char;
  }).join('');
}

export const run: ToolLogicFunction = async ({ inputIds, fs, options, emitProgress }) => {
  if (inputIds.length === 0) {
    throw new Error('PDF Editor requires at least one input file');
  }

  const edits = getEdits(options);
  if (edits.length === 0) {
    throw new Error('PDF Editor requires at least one text edit');
  }

  const outputIds: string[] = [];

  for (let i = 0; i < inputIds.length; i += 1) {
    const entry = await fs.read(inputIds[i]);
    const blob = await entry.getBlob();
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const pdf = await PDFDocument.load(bytes);

    // Embed all possible fonts at once to avoid repeated embedding
    const fontCache: Record<string, any> = {};

    const pages = pdf.getPages();
    for (const edit of edits) {
      if (edit.pageIndex >= pages.length) {
        continue;
      }

      const page = pages[edit.pageIndex];
      const { width, height } = page.getSize();

      // Handle CropBox/MediaBox offsets (origin might not be 0,0)
      const cropRoot = page.getCropBox();
      const ox = cropRoot.x || 0;
      const oy = cropRoot.y || 0;

      const boxWidth = clamp(edit.widthRatio * width, 2, width);
      const boxHeight = clamp(edit.heightRatio * height, 2, height);

      const xRatio = edit.xRatio;
      const topYRatio = edit.yRatio;

      // Logic for y: in PDF (bottom-up), top edge y is (height - topYRatio * height)
      // We draw relative to the origin (ox, oy)
      const x = ox + (xRatio * width);
      const boxTopY = oy + (height - (topYRatio * height));
      const y = boxTopY - boxHeight;

      const bg = parseHexColor(edit.backgroundColor, { r: 1, g: 1, b: 1 });
      page.drawRectangle({
        x: x,
        y: y,
        width: boxWidth,
        height: boxHeight,
        color: rgb(bg.r, bg.g, bg.b),
      });

      const fg = parseHexColor(edit.color, { r: 0.12, g: 0.12, b: 0.12 });
      const fontSize = clamp(edit.fontSizeRatio * height, 4, 144);

      const stdFont = mapToStandardFont(edit.fontName);
      if (!fontCache[stdFont]) {
        fontCache[stdFont] = await pdf.embedFont(stdFont);
      }
      const font = fontCache[stdFont];

      const lineHeight = fontSize * 1.2;

      // Sanitizing for standard fonts
      const safeText = sanitizeText(edit.text);
      const textLines = safeText.split('\n');

      // Precise vertical alignment:
      // Helvetica ascent is ~0.72 of font size.
      // We want the text baseline to be exactly where it was.
      // In our UI, the box top starts at the top of the text (ascent).
      // So baseline is boxTopY - (fontSize * 0.77 approx).
      const baselineOffset = fontSize * 0.77;
      const startY = boxTopY - baselineOffset;

      for (let lineIndex = 0; lineIndex < textLines.length; lineIndex += 1) {
        const line = textLines[lineIndex];
        const lineY = startY - lineHeight * lineIndex;
        // Safety check to not draw outside the cover box too far
        if (lineY < y - fontSize) {
          break;
        }

        try {
          page.drawText(line, {
            x: x, // 0 padding for exact match if we can
            y: lineY,
            size: fontSize,
            font: font,
            color: rgb(fg.r, fg.g, fg.b),
          });
        } catch (err) {
          console.warn('Font encoding error, falling back to ASCII-only:', err);
          page.drawText(line.replace(/[^\x20-\x7E]/g, '?'), {
            x: x + padding,
            y: lineY,
            size: fontSize,
            font: font,
            color: rgb(fg.r, fg.g, fg.b),
          });
        }
      }
    }

    const outBytes = new Uint8Array(await pdf.save());
    const outBlob = new Blob([outBytes], { type: 'application/pdf' });
    const outEntry = await fs.write(outBlob);
    outputIds.push(outEntry.id);

    emitProgress?.(Math.round(((i + 1) / inputIds.length) * 100));
  }

  return { outputIds };
};
