import type { IEditorTool, ToolContext } from './IEditorTool';

export const SignTool: IEditorTool = {
    id: 'sign',
    onPointerDown: (ctx: ToolContext) => {
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
