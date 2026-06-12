import type { PdfTextLayerSpan } from '../../../services/pdf/pdf-text-layer-extractor';

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function normalizeText(value: string): string {
  return value.replace(/\r\n/gu, '\n').replace(/\r/gu, '\n').replace(/\n+/gu, ' ').replace(/\s+/gu, ' ').trim();
}

export function isEditableTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement);
}

export interface MergedLineResult {
  spans: PdfTextLayerSpan[];
  text: string;
  rect: { x: number; y: number; w: number; h: number };
  representative: PdfTextLayerSpan;
}

export function mergeLineSpans(anchor: PdfTextLayerSpan, spans: PdfTextLayerSpan[]): MergedLineResult {
  const anchorBaseline = anchor.yRatio + (anchor.ascentRatio ?? 0);
  const tolerance = Math.max(0.004, (anchor.heightRatio ?? 0.02) * 0.65);
  const lineSpans = spans
    .filter((span) => Math.abs((span.yRatio + (span.ascentRatio ?? 0)) - anchorBaseline) <= tolerance)
    .sort((left, right) => left.xRatio - right.xRatio);

  let text = '';
  let left = anchor.xRatio;
  let top = anchor.yRatio;
  let right = anchor.xRatio + anchor.widthRatio;
  let bottom = anchor.yRatio + anchor.heightRatio;

  for (let index = 0; index < lineSpans.length; index += 1) {
    const span = lineSpans[index];
    if (!span) {
      continue;
    }
    const previous = lineSpans[index - 1];
    if (previous) {
      const gap = span.xRatio - (previous.xRatio + previous.widthRatio);
      if (gap > Math.max(0.002, span.heightRatio * 0.25) && !text.endsWith(' ') && !span.text.startsWith(' ')) {
        text += ' ';
      }
    }
    text += span.text;
    left = Math.min(left, span.xRatio);
    top = Math.min(top, span.yRatio);
    right = Math.max(right, span.xRatio + span.widthRatio);
    bottom = Math.max(bottom, span.yRatio + span.heightRatio);
  }

  const representative = lineSpans.find((span) => span.id === anchor.id) ?? lineSpans[0] ?? anchor;
  return {
    spans: lineSpans,
    text: normalizeText(text || anchor.text),
    rect: {
      x: left * 100,
      y: top * 100,
      w: Math.max(0.1, (right - left) * 100),
      h: Math.max(0.1, (bottom - top) * 100),
    },
    representative,
  };
}

export function centerIsInsideRect(span: PdfTextLayerSpan, rect: { x: number; y: number; w: number; h: number }): boolean {
  const centerX = (span.xRatio + span.widthRatio / 2) * 100;
  const centerY = (span.yRatio + span.heightRatio / 2) * 100;
  return centerX >= rect.x && centerX <= rect.x + rect.w && centerY >= rect.y && centerY <= rect.y + rect.h;
}

export function toStagePoint(
  clientX: number,
  clientY: number,
  stage: HTMLElement,
): { xRatio: number; yRatio: number } {
  const rect = stage.getBoundingClientRect();
  return {
    xRatio: clamp(((clientX - rect.left) / rect.width) * 100, 0, 100),
    yRatio: clamp(((clientY - rect.top) / rect.height) * 100, 0, 100),
  };
}
