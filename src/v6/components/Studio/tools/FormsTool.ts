import type React from 'react';
import type { IEditorTool, ToolContext, Point } from './IEditorTool';

export const FormsTool: IEditorTool = {
    id: 'forms',
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
            const fType = ctx.formType || 'text';
            ctx.applyElements([...ctx.elements, {
                id: `form_${Date.now()}_${Math.random().toString(36).slice(2)}`,
                type: 'form-field',
                formType: fType,
                x: draft.x, y: draft.y,
                w: draft.w, h: draft.h,
                defaultValue: fType === 'checkbox' ? 'Off' : '',
                required: false,
                fontSize: 12,
                opacity: 1
            }]);
        }
        ctx.setDraftRect(null);
    }
};
