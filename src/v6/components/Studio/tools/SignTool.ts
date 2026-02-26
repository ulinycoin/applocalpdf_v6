import type React from 'react';
import type { IEditorTool, ToolContext, Point } from './IEditorTool';

export const SignTool: IEditorTool = {
    id: 'sign',
    onPointerDown: (ctx: ToolContext, event: React.PointerEvent, worldPos: Point) => {
        if (ctx.textEditor) ctx.commitTextEditor();
        ctx.setIsPointerDown(false);
    },
    onPointerMove: () => {
        // Signature insertion is handled by the sign composer modal.
    },
    onPointerUp: (ctx: ToolContext) => {
        ctx.setIsPointerDown(false);
    },
};
