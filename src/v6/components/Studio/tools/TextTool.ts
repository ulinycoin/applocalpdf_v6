import type React from 'react';
import type { IEditorTool, ToolContext, Point } from './IEditorTool';
import type { TextElement, RectElement, TextLayerSpan } from '../editor-types';
import {
    estimateInlineFontSizePt,
    mergeTextLine,
    resolveFontFamily,
} from '../inline-text-utils';
import { clamp01 } from '../../../utils/studio-edit-math';
import { findNearestTextSpan } from '../inline-text-utils';

export const TextTool: IEditorTool = {
    id: 'text',
    onPointerDown: (ctx: ToolContext, event: React.PointerEvent, { x, y }: Point) => {
        if (ctx.textEditor) ctx.commitTextEditor();
        ctx.setIsPointerDown(true);

        const clickedSpan = findNearestTextSpan({ x, y }, ctx.textLayerSpans);
        if (clickedSpan) {
            selectTextSpanForEditing(ctx, clickedSpan);
        } else if (!ctx.isSelectMode) {
            const next: TextElement = {
                id: crypto.randomUUID(), type: 'text', x, y, w: 0.5, h: 0.06,
                text: ctx.uiMessages.text || 'Add text', color: '#0f172a', fontSize: 18, fontFamily: 'sora',
                fontWeight: 'normal', fontStyle: 'normal', textAlign: 'left',
                lineHeight: 1.2, letterSpacing: 0, opacity: 1
            };
            ctx.applyElements([...ctx.elements, next]);
            ctx.setSelectedElementId(next.id);
            ctx.startEditingText(next);
        }
    },
    onPointerMove: (ctx: ToolContext, event: React.PointerEvent, worldPos: Point) => {
        // Text tool doesn't do drawing
    },
    onPointerUp: (ctx: ToolContext, event: React.PointerEvent, worldPos: Point) => {
        ctx.setIsPointerDown(false);
    }
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
        };
    } else {
        mergedLine = mergeTextLine(ctx.textLayerSpans, clickedSpan);
    }

    if (!mergedLine) {
        ctx.setInlineUiState('idle');
        return;
    }

    const { left, top, width: w, height: h } = mergedLine;
    const existing = ctx.elements.find(el =>
        el.type === 'text' && Math.abs((el as TextElement).x - left) < 0.005 && Math.abs((el as TextElement).y - top) < 0.005
    );

    if (existing) {
        ctx.setSelectedElementId(existing.id);
        ctx.setInlineUiState('selected');
        ctx.startEditingText(existing as TextElement);
        return;
    }

    const whiteout: RectElement = {
        id: crypto.randomUUID(),
        type: 'rect',
        x: clamp01(left - 0.005), y: clamp01(top - 0.005),
        w: w + 0.01, h: h + 0.01,
        fill: '#ffffff', stroke: 'transparent', strokeWidth: 0, opacity: 1
    };

    const next: TextElement = {
        id: crypto.randomUUID(), type: 'text', x: left, y: top, w: w + 0.05, h: h + 0.01,
        text: mergedLine.text, color: '#000000',
        fontSize: estimateInlineFontSizePt(mergedLine.fontSizeRatio, mergedLine.pageHeightPt ?? 842),
        fontFamily: resolveFontFamily(mergedLine.fontName, mergedLine.fontFamilyHint),
        fontWeight: 'normal', fontStyle: 'normal', textAlign: 'left', lineHeight: 1.2, letterSpacing: 0, opacity: 1,
        ascent: mergedLine.ascentRatio ? mergedLine.ascentRatio * (mergedLine.pageHeightPt ?? 842) : undefined
    };

    ctx.applyElements([...ctx.elements, whiteout, next]);
    ctx.setSelectedElementId(next.id);
    ctx.startEditingText(next);
}
