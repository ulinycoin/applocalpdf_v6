import type React from 'react';
import type { IEditorTool, ToolContext, Point } from './IEditorTool';

export const AnnotateTool: IEditorTool = {
    id: 'annotate',
    onPointerDown: (ctx: ToolContext, event: React.PointerEvent, { x, y }: Point) => {
        if (ctx.textEditor) ctx.commitTextEditor();
        ctx.setIsPointerDown(true);
        ctx.setDraftStroke({ points: [x, y] });
    },
    onPointerMove: (ctx: ToolContext, event: React.PointerEvent, { x, y }: Point) => {
        if (!ctx.isPointerDown) return;
        ctx.setDraftStroke(prev => prev ? { points: [...prev.points, x, y] } : null);
    },
    onPointerUp: (ctx: ToolContext, event: React.PointerEvent, { x, y }: Point) => {
        ctx.setIsPointerDown(false);
        const draft = ctx.draftStroke;
        if (draft && draft.points.length >= 4) {
            ctx.applyElements([...ctx.elements, {
                id: crypto.randomUUID(), type: 'stroke', points: draft.points,
                color: '#2563eb', width: 2, opacity: 1
            }]);
        }
        ctx.setDraftStroke(null);
    }
};
