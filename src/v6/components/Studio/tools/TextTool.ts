import type React from 'react';
import type { IEditorTool, ToolContext, Point } from './IEditorTool';
import type { TextElement, RectElement, TextLayerSpan } from '../editor-types';
import {
  estimateInlineFontSizePt,
  mergeTextLine,
  resolveFontFamily,
} from '../inline-text-utils';
import { inferSourceTextStyle } from '../../../../../shared/studio-text-edit/infer-source-text-style';
import { buildOriginalRect } from '../../../../../shared/studio-text-edit/original-rect';
import { clamp01 } from '../../../utils/studio-edit-math';
import { findNearestTextSpan } from '../inline-text-utils';
import { snapOverlayTextToBaselines } from '../text-baseline-snap';

const DEFAULT_PAGE_HEIGHT_PT = 842;
const DEFAULT_PAGE_WIDTH_PT = 612;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function estimateNewTextBoxSize(fontSize: number, lineHeight: number): { w: number; h: number } {
  // Tight box: ~glyph height, width grows as the user types (editor resizes).
  const h = clamp((fontSize * Math.max(1.0, Math.min(lineHeight, 1.15))) / DEFAULT_PAGE_HEIGHT_PT, 0.014, 0.2);
  const w = clamp((fontSize * 6) / DEFAULT_PAGE_WIDTH_PT, 0.06, 0.45);
  return { w, h };
}

function isOpaqueBackground(color: string | undefined): boolean {
  const value = (color || '').trim().toLowerCase();
  return value !== '' && value !== 'transparent' && value !== 'none';
}

/** Keep whiteout tight to the glyph box so small fonts don't eat neighboring lines. */
function textBackgroundPad(spanW: number, spanH: number): { padX: number; padY: number } {
  return {
    padX: Math.min(0.0025, Math.max(0.0008, spanW * 0.03)),
    padY: Math.min(0.0009, Math.max(0.0003, spanH * 0.04)),
  };
}

function createNewTextAtPoint(ctx: ToolContext, x: number, y: number): void {
  const textId = crypto.randomUUID();
  const { w, h } = estimateNewTextBoxSize(ctx.textStyle.fontSize, ctx.textStyle.lineHeight);
  const bgColor = ctx.textStyle.backgroundColor;
  const pageHeightPt = ctx.textLayerSpans.find((span) => span.pageHeightPt)?.pageHeightPt
    ?? DEFAULT_PAGE_HEIGHT_PT;
  const snap = snapOverlayTextToBaselines({
    y: clamp01(y),
    fontSize: ctx.textStyle.fontSize,
    lineHeight: ctx.textStyle.lineHeight,
    pageHeightPt,
    spans: ctx.textLayerSpans,
  });
  const next: TextElement = {
    id: textId,
    type: 'text',
    x: clamp01(x),
    y: snap.y,
    w: Math.max(w, 0.08),
    h: Math.max(h, 0.022),
    text: '',
    color: ctx.textStyle.color,
    fontSize: ctx.textStyle.fontSize,
    fontFamily: ctx.textStyle.fontFamily,
    fontWeight: ctx.textStyle.fontWeight,
    fontStyle: ctx.textStyle.fontStyle,
    lineHeight: ctx.textStyle.lineHeight,
    letterSpacing: ctx.textStyle.letterSpacing,
    textAlign: 'left',
    opacity: 1,
    baselineRatio: snap.baselineRatio,
  };

  // New overlay text: no white field by default — it covers the document for no reason.
  const batch: Array<TextElement | RectElement> = [next];
  if (isOpaqueBackground(bgColor)) {
    const { padX, padY } = textBackgroundPad(next.w, next.h);
    batch.unshift({
      id: `${textId}_bg`,
      type: 'rect',
      x: clamp01(x - padX),
      y: clamp01(y - padY),
      w: next.w + padX * 2,
      h: next.h + padY * 2,
      fill: bgColor,
      stroke: 'transparent',
      strokeWidth: 0,
      opacity: 1,
    });
  }

  ctx.applyElements([...ctx.elements, ...batch]);
  ctx.setSelectedElementId(next.id);
  ctx.setTextAddMode(false);
  // Always open the editor for a fresh box so the caret/placeholder is visible.
  ctx.startEditingText(next);
  ctx.setInlineUiState('editing');
}

export const TextTool: IEditorTool = {
  id: 'text',
  onPointerDown: (ctx: ToolContext, _event: React.PointerEvent, { x, y }: Point) => {
    if (ctx.textEditor) ctx.commitTextEditor();
    ctx.setIsPointerDown(true);

    // Add-text mode must win over nearby PDF spans — otherwise clicks on dense
    // pages never create a box (every click latches onto existing text).
    if (ctx.textAddMode) {
      createNewTextAtPoint(ctx, x, y);
      return;
    }

    const clickedSpan = findNearestTextSpan({ x, y }, ctx.textLayerSpans);
    if (clickedSpan) {
      selectTextSpanForEditing(ctx, clickedSpan);
      return;
    }

    ctx.setSelectedElementId(null);
    ctx.setInlineUiState('idle');
  },
  onPointerMove: (_ctx: ToolContext, _event: React.PointerEvent, _worldPos: Point) => {
    // Text tool doesn't do drawing
  },
  onPointerUp: (ctx: ToolContext, _event: React.PointerEvent, _worldPos: Point) => {
    ctx.setIsPointerDown(false);
  },
};

function selectTextSpanForEditing(ctx: ToolContext, clickedSpan: TextLayerSpan) {
  let mergedLine = null;
  if (ctx.textSelectionMode === 'word') {
    mergedLine = {
      left: clickedSpan.xRatio,
      top: clickedSpan.yRatio,
      width: clickedSpan.widthRatio,
      height: clickedSpan.heightRatio,
      text: clickedSpan.text,
      fontSizeRatio: clickedSpan.fontSizeRatio,
      fontName: clickedSpan.fontName,
      fontFamilyHint: clickedSpan.fontFamilyHint,
      pageHeightPt: clickedSpan.pageHeightPt,
      ascentRatio: clickedSpan.ascentRatio,
      transform: clickedSpan.transform,
    };
  } else {
    mergedLine = mergeTextLine(ctx.textLayerSpans, clickedSpan);
  }

  if (!mergedLine) {
    ctx.setInlineUiState('idle');
    return;
  }

  const { left, top, width: w, height: h } = mergedLine;
  const originalRect = buildOriginalRect({ left, top, width: w, height: h });
  const existing = ctx.elements.find(el =>
    el.type === 'text' && (
      (el as TextElement).originalRect
        ? Math.abs((el as TextElement).originalRect!.x - originalRect.x) < 0.005
          && Math.abs((el as TextElement).originalRect!.y - originalRect.y) < 0.005
        : Math.abs((el as TextElement).x - left) < 0.005 && Math.abs((el as TextElement).y - top) < 0.005
    )
  );

  if (existing) {
    ctx.setSelectedElementId(existing.id);
    ctx.setInlineUiState('selected');
    if (ctx.textInteractionMode === 'edit') {
      ctx.startEditingText(existing as TextElement);
    }
    return;
  }

  const textId = crypto.randomUUID();
  const { padX, padY } = textBackgroundPad(w, h);
  // Editing existing PDF glyphs always needs an opaque cover. Transparent is the
  // default for *new* overlay text, but here it would leave the original visible.
  const whiteoutFill = isOpaqueBackground(ctx.textStyle.backgroundColor)
    ? ctx.textStyle.backgroundColor
    : '#ffffff';

  const whiteout: RectElement = {
    id: `${textId}_bg`,
    type: 'rect',
    x: clamp01(left - padX),
    y: clamp01(top - padY),
    w: w + padX * 2,
    h: h + padY * 2,
    fill: whiteoutFill,
    stroke: 'transparent',
    strokeWidth: 0,
    opacity: 1,
  };

  const next: TextElement = {
    id: textId, type: 'text', x: left, y: top, w: w + Math.min(0.02, Math.max(0.008, w * 0.12)), h,
    text: mergedLine.text, color: ctx.textStyle.color || '#000000',
    fontSize: estimateInlineFontSizePt(mergedLine.fontSizeRatio, mergedLine.pageHeightPt ?? DEFAULT_PAGE_HEIGHT_PT),
    fontFamily: resolveFontFamily(mergedLine.fontName, mergedLine.fontFamilyHint),
    ...inferSourceTextStyle(mergedLine.fontName, mergedLine.fontFamilyHint, mergedLine.transform),
    textAlign: 'left', lineHeight: 1.2, letterSpacing: 0, opacity: 1,
    ascent: mergedLine.ascentRatio ? mergedLine.ascentRatio * (mergedLine.pageHeightPt ?? DEFAULT_PAGE_HEIGHT_PT) : undefined,
    sourceFontName: mergedLine.fontName,
    sourceFontFamilyHint: mergedLine.fontFamilyHint,
    sourceFontSizeRatio: mergedLine.fontSizeRatio,
    originalRect,
  };

  ctx.applyElements([...ctx.elements, whiteout, next]);
  ctx.setSelectedElementId(next.id);
  if (ctx.textInteractionMode === 'edit') {
    ctx.startEditingText(next);
  } else {
    ctx.setInlineUiState('selected');
  }
}
