import type { NormalizedOriginalRect } from './original-rect';

export interface TextLayerSpanBounds {
  id: string;
  text: string;
  xRatio: number;
  yRatio: number;
  widthRatio: number;
  heightRatio: number;
}

function normalizeSpanText(value: string): string {
  return value.replace(/\s+/gu, ' ').trim();
}

function sameTextColumn(
  left: Pick<TextLayerSpanBounds, 'xRatio' | 'widthRatio'>,
  right: Pick<TextLayerSpanBounds, 'xRatio' | 'widthRatio'>,
): boolean {
  const tolerance = Math.max(0.012, Math.min(left.widthRatio, right.widthRatio) * 0.12);
  return Math.abs(left.xRatio - right.xRatio) <= tolerance;
}

function isStackedOverlayDuplicate(
  anchor: TextLayerSpanBounds,
  candidate: TextLayerSpanBounds,
): boolean {
  if (anchor.id === candidate.id) {
    return false;
  }
  if (!sameTextColumn(anchor, candidate)) {
    return false;
  }

  const rowOffset = Math.abs(candidate.yRatio - anchor.yRatio);
  const rowThreshold = Math.max(0.0025, anchor.heightRatio * 0.25);
  if (rowOffset <= rowThreshold) {
    return false;
  }

  const anchorText = normalizeSpanText(anchor.text);
  const candidateText = normalizeSpanText(candidate.text);
  if (!anchorText || !candidateText) {
    return rowOffset <= Math.max(0.004, anchor.heightRatio * 1.5);
  }

  if (candidateText.includes(anchorText) || anchorText.includes(candidateText)) {
    return true;
  }

  const combined = `${anchorText}${candidateText}`;
  return combined.length > Math.max(anchorText.length, candidateText.length) * 1.35
    && rowOffset <= Math.max(0.004, anchor.heightRatio * 2.5);
}

export function dedupeStackedTextLayerSpans<T extends TextLayerSpanBounds>(spans: T[]): T[] {
  if (spans.length < 2) {
    return spans;
  }

  const removeIds = new Set<string>();
  for (let i = 0; i < spans.length; i += 1) {
    for (let j = 0; j < spans.length; j += 1) {
      if (i === j) {
        continue;
      }
      const older = spans[i]!;
      const newer = spans[j]!;
      if (removeIds.has(older.id) || removeIds.has(newer.id)) {
        continue;
      }
      if (!sameTextColumn(older, newer)) {
        continue;
      }

      const yDelta = newer.yRatio - older.yRatio;
      const maxOffset = Math.max(0.004, older.heightRatio * 2.5);
      if (Math.abs(yDelta) > maxOffset) {
        continue;
      }

      const olderText = normalizeSpanText(older.text);
      const newerText = normalizeSpanText(newer.text);
      if (!olderText || !newerText) {
        removeIds.add(older.id);
        continue;
      }

      const sharedPrefixLength = (() => {
        const limit = Math.min(olderText.length, newerText.length);
        let count = 0;
        while (count < limit && olderText[count] === newerText[count]) {
          count += 1;
        }
        return count;
      })();

      const related = newerText.startsWith(olderText)
        || olderText.startsWith(newerText)
        || sharedPrefixLength >= 12;

      if (!related) {
        continue;
      }

      // Paint-over replacements often land on the same baseline (±float). Prefer the
      // longer edited string instead of whichever span wins a tiny y comparison.
      const colocated = Math.abs(yDelta) <= Math.max(0.001, older.heightRatio * 0.15);
      if (colocated) {
        if (olderText.length < newerText.length) {
          removeIds.add(older.id);
        } else if (newerText.length < olderText.length) {
          removeIds.add(newer.id);
        } else if (yDelta > 0) {
          removeIds.add(older.id);
        }
        continue;
      }

      if (yDelta <= 0) {
        continue;
      }
      removeIds.add(older.id);
    }
  }

  return spans.filter((span) => !removeIds.has(span.id));
}

export function filterSpansForLineMerge<T extends TextLayerSpanBounds>(
  spans: T[],
  anchor: T,
): T[] {
  return spans.filter((candidate) => !isStackedOverlayDuplicate(anchor, candidate));
}

export function spanCenterOverlapsRect(
  span: { xRatio: number; yRatio: number; widthRatio: number; heightRatio: number },
  rect: NormalizedOriginalRect,
  padding = 0.004,
): boolean {
  const centerX = span.xRatio + span.widthRatio / 2;
  const centerY = span.yRatio + span.heightRatio / 2;
  return (
    centerX >= rect.x - padding
    && centerX <= rect.x + rect.w + padding
    && centerY >= rect.y - padding
    && centerY <= rect.y + rect.h + padding
  );
}

export function filterTextLayerSpansByEditedElements<T extends {
  xRatio: number;
  yRatio: number;
  widthRatio: number;
  heightRatio: number;
}>(
  spans: T[],
  elements: Array<{ type: string; originalRect?: NormalizedOriginalRect }>,
): T[] {
  const editedRects = elements
    .filter((element) => element.type === 'text' && element.originalRect)
    .map((element) => element.originalRect as NormalizedOriginalRect);

  if (editedRects.length === 0) {
    return spans;
  }

  return spans.filter((span) => !editedRects.some((rect) => spanCenterOverlapsRect(span, rect)));
}
