import type React from 'react';
import type { IEditorTool, ToolContext, Point } from './IEditorTool';
import type { EditorToolId } from '../editor-types';

export const createRectTool = (id: EditorToolId): IEditorTool => ({
    id,
    onPointerDown: (ctx: ToolContext, event: React.PointerEvent, { x, y }: Point) => {
        if (ctx.textEditor) ctx.commitTextEditor();
        ctx.setIsPointerDown(true);
        ctx.setDraftRect({ startX: x, startY: y, x, y, w: 0, h: 0 });
    },
    onPointerMove: (ctx: ToolContext, event: React.PointerEvent, { x, y }: Point) => {
        if (!ctx.isPointerDown) return;
        ctx.setDraftRect(prev => prev ? {
            ...prev,
            x: Math.min(prev.startX, x),
            y: Math.min(prev.startY, y),
            w: Math.abs(x - prev.startX),
            h: Math.abs(y - prev.startY)
        } : null);
    },
    onPointerUp: (ctx: ToolContext, event: React.PointerEvent, { x, y }: Point) => {
        ctx.setIsPointerDown(false);
        const draft = ctx.draftRect;
        if (draft && draft.w > 0.002) {
            ctx.applyElements([...ctx.elements, {
                id: crypto.randomUUID(), type: 'rect', x: draft.x, y: draft.y,
                w: draft.w, h: draft.h,
                fill: id === 'whiteout' ? '#ffffff' : 'transparent',
                stroke: id === 'whiteout' ? '#d1d5db' : '#2563eb',
                strokeWidth: id === 'whiteout' ? 1 : 2, opacity: 1
            }]);
        }
        ctx.setDraftRect(null);
    }
});

export const ShapesTool = createRectTool('shapes');
export const WhiteoutTool = createRectTool('whiteout');
