import type { PdfParsedTextOperator } from '../pdf-content-stream-parser';
import { parsePdfTextOperators } from '../pdf-content-stream-parser';
import type { NormalizedOriginalRect } from './original-rect';

export interface DecodedPdfStreamSlice {
  index: number;
  content: string;
  operators: PdfParsedTextOperator[];
}

export interface StreamOperatorRef {
  streamIndex: number;
  operator: PdfParsedTextOperator;
}

export function removeOperatorsFromContent(content: string, operators: PdfParsedTextOperator[]): string {
  const sorted = [...operators].sort((left, right) => right.start - left.start);
  let next = content;
  for (const operator of sorted) {
    if (operator.start < 0 || operator.end > next.length || operator.start >= operator.end) {
      continue;
    }
    next = `${next.slice(0, operator.start)}${next.slice(operator.end)}`;
  }
  return next;
}

export function operatorIntersectsRect(params: {
  operator: PdfParsedTextOperator;
  pageWidth: number;
  pageHeight: number;
  rect: NormalizedOriginalRect;
  paddingRatio?: number;
}): boolean {
  const { operator, pageWidth, pageHeight, rect, paddingRatio = 0.004 } = params;
  if (!Number.isFinite(operator.textMatrixX) || !Number.isFinite(operator.textMatrixY)) {
    return false;
  }

  const padX = paddingRatio * pageWidth;
  const padY = paddingRatio * pageHeight;
  const left = rect.x * pageWidth - padX;
  const right = (rect.x + rect.w) * pageWidth + padX;
  const pdfTop = pageHeight - rect.y * pageHeight + padY;
  const pdfBottom = pageHeight - (rect.y + rect.h) * pageHeight - padY;
  const opX = operator.textMatrixX as number;
  const opY = operator.textMatrixY as number;

  return opX >= left && opX <= right && opY >= pdfBottom && opY <= pdfTop;
}

export function collectOperatorsInRect(params: {
  decodedByStream: DecodedPdfStreamSlice[];
  pageWidth: number;
  pageHeight: number;
  rect: NormalizedOriginalRect;
}): StreamOperatorRef[] {
  const matches: StreamOperatorRef[] = [];
  for (const entry of params.decodedByStream) {
    for (const operator of entry.operators) {
      if (operatorIntersectsRect({
        operator,
        pageWidth: params.pageWidth,
        pageHeight: params.pageHeight,
        rect: params.rect,
      })) {
        matches.push({ streamIndex: entry.index, operator });
      }
    }
  }
  return matches;
}

export function collectOperatorsForRedaction(params: {
  decodedByStream: DecodedPdfStreamSlice[];
  pageWidth: number;
  pageHeight: number;
  rect: NormalizedOriginalRect;
  anchorOperator?: PdfParsedTextOperator;
  fontSizeRatio?: number;
}): StreamOperatorRef[] {
  const anchor = resolveRedactionAnchorOperator(params);
  if (!anchor) {
    return [];
  }

  const anchorY = anchor.textMatrixY as number;
  const fontSizePt = Math.max(
    8,
    anchor.fontSize ?? (params.fontSizeRatio ?? params.rect.h * 0.85) * params.pageHeight,
  );
  const lineThreshold = Math.max(2, fontSizePt * 0.45);
  const padX = params.pageWidth * 0.004;
  const left = params.rect.x * params.pageWidth - padX;
  const right = (params.rect.x + params.rect.w) * params.pageWidth + padX;

  const matches: StreamOperatorRef[] = [];
  for (const entry of params.decodedByStream) {
    for (const operator of entry.operators) {
      if (!Number.isFinite(operator.textMatrixX) || !Number.isFinite(operator.textMatrixY)) {
        continue;
      }
      const opX = operator.textMatrixX as number;
      const opY = operator.textMatrixY as number;
      if (opX < left || opX > right) {
        continue;
      }
      if (Math.abs(opY - anchorY) > lineThreshold) {
        continue;
      }
      matches.push({ streamIndex: entry.index, operator });
    }
  }
  return matches;
}

function resolveRedactionAnchorOperator(params: {
  decodedByStream: DecodedPdfStreamSlice[];
  pageWidth: number;
  pageHeight: number;
  rect: NormalizedOriginalRect;
  anchorOperator?: PdfParsedTextOperator;
}): PdfParsedTextOperator | undefined {
  if (Number.isFinite(params.anchorOperator?.textMatrixY)) {
    return params.anchorOperator;
  }

  const targetX = (params.rect.x + params.rect.w / 2) * params.pageWidth;
  const targetPdfY = params.pageHeight - ((params.rect.y + params.rect.h / 2) * params.pageHeight);
  let best: PdfParsedTextOperator | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const entry of params.decodedByStream) {
    for (const operator of entry.operators) {
      if (!Number.isFinite(operator.textMatrixX) || !Number.isFinite(operator.textMatrixY)) {
        continue;
      }
      const dx = ((operator.textMatrixX as number) - targetX) / params.pageWidth;
      const dy = ((operator.textMatrixY as number) - targetPdfY) / params.pageHeight;
      const distance = Math.hypot(dx, dy);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = operator;
      }
    }
  }

  if (!best || bestDistance > 0.08) {
    return undefined;
  }
  return best;
}

export function sameStreamOperator(left: StreamOperatorRef, right: StreamOperatorRef): boolean {
  return left.streamIndex === right.streamIndex
    && left.operator.start === right.operator.start
    && left.operator.end === right.operator.end;
}

export function matchesPatchedOperator(candidate: StreamOperatorRef, patched?: StreamOperatorRef): boolean {
  if (!patched) {
    return false;
  }
  if (candidate.streamIndex !== patched.streamIndex) {
    return false;
  }

  const candidateX = candidate.operator.textMatrixX;
  const candidateY = candidate.operator.textMatrixY;
  const patchedX = patched.operator.textMatrixX;
  const patchedY = patched.operator.textMatrixY;
  if (
    Number.isFinite(candidateX)
    && Number.isFinite(candidateY)
    && Number.isFinite(patchedX)
    && Number.isFinite(patchedY)
  ) {
    return Math.abs((candidateX as number) - (patchedX as number)) <= 0.5
      && Math.abs((candidateY as number) - (patchedY as number)) <= 0.5;
  }

  return sameStreamOperator(candidate, patched);
}

export function redactOperatorsInDecodedStreams(
  decodedByStream: DecodedPdfStreamSlice[],
  operatorsToRemove: StreamOperatorRef[],
): void {
  const grouped = new Map<number, PdfParsedTextOperator[]>();
  for (const item of operatorsToRemove) {
    const list = grouped.get(item.streamIndex) ?? [];
    list.push(item.operator);
    grouped.set(item.streamIndex, list);
  }

  for (const entry of decodedByStream) {
    const toRemove = grouped.get(entry.index);
    if (!toRemove || toRemove.length === 0) {
      continue;
    }
    entry.content = removeOperatorsFromContent(entry.content, toRemove);
    entry.operators = parsePdfTextOperators(entry.content);
  }
}
