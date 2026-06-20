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

const DEFAULT_PAGE_HEIGHT_PT = 842;
const DEFAULT_PAGE_WIDTH_PT = 612;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function estimateNewTextBoxSize(fontSize: number, lineHeight: number): { w: number; h: number } {
  const h = clamp((fontSize * Math.max(1.2, lineHeight) * 1.1) / DEFAULT_PAGE_HEIGHT_PT, 0.025, 0.25);
  const w = clamp((fontSize * 14) / DEFAULT_PAGE_WIDTH_PT, 0.12, 0.65);
  return { w, h };
}

function createNewTextAtPoint(ctx: ToolContext, x: number, y: number): void {
  const textId = crypto.randomUUID();
  const { w, h } = estimateNewTextBoxSize(ctx.textStyle.fontSize, ctx.textStyle.lineHeight);

  const whiteout: RectElement = {
    id: `${textId}_bg`,
    type: 'rect',
    x: clamp01(x - 0.004),
    y: clamp01(y - 0.001),
    w: w + 0.008,
    h: h + 0.004,
    fill: ctx.textStyle.backgroundColor || '#ffffff',
    stroke: 'transparent',
    strokeWidth: 0,
    opacity: 1,
  };

  const next: TextElement = {
    id: textId,
    type: 'text',
    x: clamp01(x),
    y: clamp01(y),
    w,
    h,
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
  };

  ctx.applyElements([...ctx.elements, whiteout, next]);
  ctx.setSelectedElementId(next.id);
  ctx.setTextAddMode(false);
  if (ctx.textInteractionMode === 'edit') {
    ctx.startEditingText(next);
  } else {
    ctx.setInlineUiState('selected');
  }
}

export const TextTool: IEditorTool = {
  id: 'text',
  onPointerDown: (ctx: ToolContext, _event: React.PointerEvent, { x, y }: Point) => {
    if (ctx.textEditor) ctx.commitTextEditor();
    ctx.setIsPointerDown(true);

    const clickedSpan = findNearestTextSpan({ x, y }, ctx.textLayerSpans);
    if (clickedSpan) {
      selectTextSpanForEditing(ctx, clickedSpan);
      return;
    }

    if (ctx.textAddMode) {
      createNewTextAtPoint(ctx, x, y);
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

  const whiteout: RectElement = {
    id: `${textId}_bg`,
    type: 'rect',
    x: clamp01(left - 0.005), y: clamp01(top - 0.001),
    w: w + 0.01, h: h + 0.006,
    fill: ctx.textStyle.backgroundColor || '#ffffff', stroke: 'transparent', strokeWidth: 0, opacity: 1,
  };

  const next: TextElement = {
    id: textId, type: 'text', x: left, y: top, w: w + 0.05, h: h + 0.01,
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
