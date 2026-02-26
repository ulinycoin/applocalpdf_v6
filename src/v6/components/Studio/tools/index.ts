import type { IEditorTool } from './IEditorTool';
import { TextTool } from './TextTool';
import { SignTool } from './SignTool';
import { AnnotateTool } from './AnnotateTool';
import { ShapesTool, WhiteoutTool } from './ShapesAndWhiteoutTool';

export * from './IEditorTool';
export * from './TextTool';
export * from './SignTool';
export * from './AnnotateTool';
export * from './ShapesAndWhiteoutTool';

export const TOOLS: Record<string, IEditorTool> = {
    text: TextTool,
    sign: SignTool,
    annotate: AnnotateTool,
    shapes: ShapesTool,
    whiteout: WhiteoutTool,
};
