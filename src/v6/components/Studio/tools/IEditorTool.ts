import type React from 'react';
import type { EditElement, TextElement, RectDraft, StrokeDraft, TextLayerSpan, TextEditorState, EditorToolId } from '../editor-types';

export interface Point {
    x: number;
    y: number;
}

export interface ToolContext {
    elements: EditElement[];
    applyElements: (next: EditElement[]) => void;
    textLayerSpans: TextLayerSpan[];
    isSelectMode: boolean;
    textSelectionMode: 'line' | 'word';
    textEditor: TextEditorState | null;
    commitTextEditor: () => void;
    startEditingText: (element: TextElement) => void;
    setSelectedElementId: (id: string | null) => void;
    setInlineUiState: (state: any) => void;
    uiMessages: any;

    draftRect: RectDraft | null;
    setDraftRect: (draft: RectDraft | null | ((prev: RectDraft | null) => RectDraft | null)) => void;
    draftStroke: StrokeDraft | null;
    setDraftStroke: (draft: StrokeDraft | null | ((prev: StrokeDraft | null) => StrokeDraft | null)) => void;

    isPointerDown: boolean;
    setIsPointerDown: (val: boolean) => void;
    annotateColor: string;
}

export interface IEditorTool {
    id: EditorToolId;
    onPointerDown(ctx: ToolContext, event: React.PointerEvent, worldPos: Point): void;
    onPointerMove(ctx: ToolContext, event: React.PointerEvent, worldPos: Point): void;
    onPointerUp(ctx: ToolContext, event: React.PointerEvent, worldPos: Point): void;
}
