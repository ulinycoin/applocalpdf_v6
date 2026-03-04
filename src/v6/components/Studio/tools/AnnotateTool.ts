import type React from 'react';
import type { IEditorTool, ToolContext, Point } from './IEditorTool';
import { findNearestTextSpan, mergeTextLine } from '../inline-text-utils';

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

export const AnnotateTool: IEditorTool = {
    id: 'annotate',
    onPointerDown: (ctx: ToolContext, _event: React.PointerEvent, { x, y }: Point) => {
        if (ctx.textEditor) ctx.commitTextEditor();
        ctx.setIsPointerDown(true);
        ctx.setDraftStroke({ points: [x, y] });
    },
    onPointerMove: (ctx: ToolContext, _event: React.PointerEvent, { x, y }: Point) => {
        if (!ctx.isPointerDown) return;
        ctx.setDraftStroke(prev => prev ? { points: [...prev.points, x, y] } : null);
    },
    onPointerUp: (ctx: ToolContext, _event: React.PointerEvent, { x, y }: Point) => {
        ctx.setIsPointerDown(false);
        const draft = ctx.draftStroke;
        if (draft && draft.points.length >= 4) {
            if (ctx.annotateMode === 'pen') {
                ctx.applyElements([...ctx.elements, {
                    id: crypto.randomUUID(),
                    type: 'stroke',
                    points: draft.points,
                    color: ctx.annotateColor,
                    width: ctx.annotateStrokeWidth,
                    opacity: 1,
                }]);
                ctx.setDraftStroke(null);
                return;
            }

            const startX = draft.points[0];
            const startY = draft.points[1];
            const endX = x;
            const endY = y;
            const midPoint = { x: (startX + endX) * 0.5, y: (startY + endY) * 0.5 };
            const anchor = findNearestTextSpan(midPoint, ctx.textLayerSpans, 0.08);
            const mergedLine = anchor ? mergeTextLine(ctx.textLayerSpans, anchor) : null;

            let snappedY: number | null = null;
            let dynamicWidth = 12;

            if (mergedLine) {
                // highlight
                snappedY = mergedLine.top + mergedLine.height * 0.5;
                const viewportScale = document.querySelector('.studio-edit-canvas-content')?.getBoundingClientRect().height || 842;
                dynamicWidth = Math.max(8, mergedLine.height * viewportScale * 0.85);
            }

            const clampedStartX = mergedLine ? clamp(startX, mergedLine.left, mergedLine.left + mergedLine.width) : startX;
            const clampedEndX = mergedLine ? clamp(endX, mergedLine.left, mergedLine.left + mergedLine.width) : endX;
            ctx.applyElements([...ctx.elements, {
                id: crypto.randomUUID(),
                type: 'stroke',
                points: snappedY !== null
                    ? [clampedStartX, snappedY, clampedEndX, snappedY]
                    : draft.points,
                color: ctx.annotateColor,
                width: isNaN(dynamicWidth) ? 12 : dynamicWidth,
                opacity: 0.45
            }]);
        }
        ctx.setDraftStroke(null);
    }
};
