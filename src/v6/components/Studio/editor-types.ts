import { WorkerPdfTextLayerSpan } from '../../../core/public/contracts';
import { FontFamilyId } from './inline-text-utils';

export type TextLayerSpan = WorkerPdfTextLayerSpan;
export type EditorToolId = 'text' | 'annotate' | 'whiteout' | 'shapes';
export type TextAlignId = 'left' | 'center' | 'right';
export type InlineUiState = 'idle' | 'hover' | 'selected' | 'editing' | 'saving' | 'saved' | 'error';

export interface TextElement {
    id: string;
    type: 'text';
    x: number;
    y: number;
    w: number;
    h: number;
    text: string;
    color: string;
    fontSize: number;
    fontFamily: FontFamilyId;
    fontWeight: 'normal' | 'bold';
    fontStyle: 'normal' | 'italic';
    textAlign: TextAlignId;
    lineHeight: number;
    letterSpacing: number;
    opacity: number;
    ascent?: number;
    sourceFontName?: string;
    sourceFontFamilyHint?: string;
    sourceFontSizeRatio?: number;
}

export interface StrokeElement {
    id: string;
    type: 'stroke';
    points: number[];
    color: string;
    width: number;
    opacity: number;
}

export interface RectElement {
    id: string;
    type: 'rect';
    x: number;
    y: number;
    w: number;
    h: number;
    fill: string;
    stroke: string;
    strokeWidth: number;
    opacity: number;
}

export type EditElement = TextElement | StrokeElement | RectElement;

export interface RectDraft {
    startX: number;
    startY: number;
    x: number;
    y: number;
    w: number;
    h: number;
}

export interface StrokeDraft {
    points: number[];
}

export type DragSession =
    | { mode: 'move-text'; id: string; startClientX: number; startClientY: number; originX: number; originY: number; initialElements: EditElement[]; }
    | { mode: 'resize-text'; id: string; startClientX: number; startClientY: number; originW: number; originH: number; initialElements: EditElement[]; }
    | { mode: 'move-rect'; id: string; startClientX: number; startClientY: number; originX: number; originY: number; initialElements: EditElement[]; }
    | { mode: 'resize-rect'; id: string; startClientX: number; startClientY: number; originW: number; originH: number; initialElements: EditElement[]; }
    | { mode: 'move-stroke'; id: string; startClientX: number; startClientY: number; initialPoints: number[]; initialElements: EditElement[]; }
    | { mode: 'resize-stroke'; id: string; startClientX: number; startClientY: number; initialPoints: number[]; bounds: { minX: number; minY: number; maxX: number; maxY: number }; initialElements: EditElement[]; };

export interface TextEditorState {
    id: string;
    value: string;
    initialValue: string;
}
