import { PDFDocument, rgb } from 'pdf-lib';
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

    const pages = pdf.getPages();
    for (const edit of edits) {
      if (edit.pageIndex >= pages.length) {
        continue;
      }

      const page = pages[edit.pageIndex];
      const { width, height } = page.getSize();

      const boxWidth = clamp(edit.widthRatio * width, 2, width);
      const boxHeight = clamp(edit.heightRatio * height, 2, height);
      const x = clamp(edit.xRatio * width, 0, Math.max(0, width - boxWidth));
      const topY = clamp(edit.yRatio * height, 0, Math.max(0, height - boxHeight));
      const y = height - topY - boxHeight;

      const bg = parseHexColor(edit.backgroundColor, { r: 1, g: 1, b: 1 });
      page.drawRectangle({
        x,
        y,
        width: boxWidth,
        height: boxHeight,
        color: rgb(bg.r, bg.g, bg.b),
      });

      const fg = parseHexColor(edit.color, { r: 0.12, g: 0.12, b: 0.12 });
      const fontSize = clamp(edit.fontSizeRatio * height, 6, 72);
      const lineHeight = fontSize * 1.2;
      const padding = Math.max(1, Math.min(boxWidth, boxHeight) * 0.06);
      const textLines = edit.text.split('\n').slice(0, 12);
      const startY = y + boxHeight - padding - fontSize;

      for (let lineIndex = 0; lineIndex < textLines.length; lineIndex += 1) {
        const line = textLines[lineIndex];
        const lineY = startY - lineHeight * lineIndex;
        if (lineY < y + padding) {
          break;
        }
        page.drawText(line, {
          x: x + padding,
          y: lineY,
          size: fontSize,
          color: rgb(fg.r, fg.g, fg.b),
        });
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
