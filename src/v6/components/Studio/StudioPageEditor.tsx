import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePlatform } from '../../../app/react/platform-context';
import type { IWorkerCommand } from '../../../core/public/contracts';
import { useStudioStore, type PageItem, type StudioEditToolId } from './studio-store';
import {
    clamp,
    estimateInlineFontSizePt,
    findNearestTextSpan,
    mergeTextLine,
    resolveFontFamily,
    sanitizeInlineText,
    type FontFamilyId,
} from './inline-text-utils';
import { detectStudioEditLocale, getStudioEditMessages } from './studio-edit-i18n';
import {
    EditElement,
    TextElement,
    RectElement,
    StrokeElement,
    RectDraft,
    StrokeDraft,
    DragSession,
    TextEditorState,
    InlineUiState,
    TextAlignId,
    TextLayerSpan
} from './editor-types';
import { StudioFloatingMenu } from './StudioFloatingEditorMenu';
import { LinearIcon } from '../icons/linear-icon';

function clamp01(value: number): number {
    return Math.max(0, Math.min(1, value));
}

function getStrokeBounds(points: number[]): { minX: number; minY: number; maxX: number; maxY: number } {
    let minX = 1, minY = 1, maxX = 0, maxY = 0;
    for (let i = 0; i < points.length; i += 2) {
        minX = Math.min(minX, points[i]!);
        minY = Math.min(minY, points[i + 1]!);
        maxX = Math.max(maxX, points[i]!);
        maxY = Math.max(maxY, points[i + 1]!);
    }
    return { minX, minY, maxX, maxY };
}

function moveStrokePoints(points: number[], dx: number, dy: number): number[] {
    const out = [...points];
    for (let i = 0; i < out.length; i += 2) {
        out[i] = clamp01((out[i] ?? 0) + dx);
        out[i + 1] = clamp01((out[i + 1] ?? 0) + dy);
    }
    return out;
}

function resizeStrokePoints(points: number[], bounds: { minX: number; minY: number; maxX: number; maxY: number }, scaleX: number, scaleY: number): number[] {
    const width = Math.max(0.0001, bounds.maxX - bounds.minX);
    const height = Math.max(0.0001, bounds.maxY - bounds.minY);
    const out = [...points];
    for (let i = 0; i < out.length; i += 2) {
        const x = out[i] ?? 0;
        const y = out[i + 1] ?? 0;
        out[i] = clamp01(bounds.minX + ((x - bounds.minX) / width) * (width * scaleX));
        out[i + 1] = clamp01(bounds.minY + ((y - bounds.minY) / height) * (height * scaleY));
    }
    return out;
}

async function requestTextLayerSpans(
    runtime: ReturnType<typeof usePlatform>['runtime'],
    fileId: string,
    pageNumber: number,
    signal?: AbortSignal,
): Promise<TextLayerSpan[]> {
    const command: IWorkerCommand = {
        id: crypto.randomUUID(),
        type: 'COMMAND',
        payload: {
            type: 'GET_PDF_TEXT_LAYER',
            payload: { fileId, pageNumber },
        },
    };
    const finalEvent = await runtime.workerOrchestrator.dispatch(command, undefined, signal);
    if (finalEvent.payload.type === 'TEXT_LAYER_RESULT') {
        return finalEvent.payload.payload.spans;
    }
    throw new Error('Unexpected worker response');
}

export interface StudioPageEditorProps {
    page: PageItem;
    width: number;
    height: number;
    activeTool?: StudioEditToolId;
    elements: EditElement[];
    onElementsChange: (elements: EditElement[]) => void;
    onPushHistory?: (elements: EditElement[]) => void;

    // Lifted state for integration with external wrappers (like StudioEditWorkspace)
    selectedElementId?: string | null;
    onSelectedElementIdChange?: (id: string | null) => void;
    textEditor?: TextEditorState | null;
    onTextEditorChange?: (state: TextEditorState | null) => void;
    onInlineUiStateChange?: (state: InlineUiState) => void;
    onMessageChange?: (msg: string | null) => void;
    onFinish?: () => void;
    onDiscard?: () => void;
}

export function StudioPageEditor({
    page,
    width,
    height,
    activeTool: externalActiveTool = 'text',
    elements,
    onElementsChange,
    onPushHistory,
    selectedElementId: externalSelectedElementId,
    onSelectedElementIdChange,
    textEditor: externalTextEditor,
    onTextEditorChange,
    onInlineUiStateChange,
    onMessageChange,
    onFinish,
    onDiscard
}: StudioPageEditorProps) {
    const { runtime } = usePlatform();

    const canvasRef = useRef<HTMLDivElement | null>(null);
    const dragSessionRef = useRef<DragSession | null>(null);

    const [internalSelectedElementId, setInternalSelectedElementId] = useState<string | null>(null);
    const selectedElementId = externalSelectedElementId !== undefined ? externalSelectedElementId : internalSelectedElementId;
    const setSelectedElementId = (id: string | null) => {
        if (onSelectedElementIdChange) onSelectedElementIdChange(id);
        else setInternalSelectedElementId(id);
    };

    const [internalTextEditor, setInternalTextEditor] = useState<TextEditorState | null>(null);
    const textEditor = externalTextEditor !== undefined ? externalTextEditor : internalTextEditor;
    const setTextEditor = useCallback((next: TextEditorState | null | ((prev: TextEditorState | null) => TextEditorState | null)) => {
        const resolved = typeof next === 'function' ? next(textEditor) : next;
        if (onTextEditorChange) onTextEditorChange(resolved);
        else setInternalTextEditor(resolved);
    }, [onTextEditorChange, textEditor]);

    const [textLayerSpans, setTextLayerSpans] = useState<TextLayerSpan[]>([]);
    const [inlineUiState, setInlineUiState] = useState<InlineUiState>('idle');

    useEffect(() => {
        if (onInlineUiStateChange) onInlineUiStateChange(inlineUiState);
    }, [inlineUiState, onInlineUiStateChange]);

    const [isPointerDown, setIsPointerDown] = useState(false);
    const [draftRect, setDraftRect] = useState<RectDraft | null>(null);
    const [draftStroke, setDraftStroke] = useState<StrokeDraft | null>(null);
    const [isSelectMode, setIsSelectMode] = useState(true); // Default to select mode for better UX
    const [activeTool, setActiveTool] = useState<StudioEditToolId>(externalActiveTool);

    useEffect(() => {
        setActiveTool(externalActiveTool);
    }, [externalActiveTool]);

    const locale = useMemo(() => detectStudioEditLocale(), []);
    const ui = useMemo(() => getStudioEditMessages(locale), [locale]);

    const selectedElement = useMemo(() => elements.find(el => el.id === selectedElementId), [elements, selectedElementId]);

    // Load Text Layer
    useEffect(() => {
        const abortController = new AbortController();
        void (async () => {
            try {
                const spans = await requestTextLayerSpans(runtime, page.fileId, page.pageIndex + 1, abortController.signal);
                setTextLayerSpans(spans);
            } catch (e) {
                // Fallback or error handled silently
            }
        })();
        return () => abortController.abort();
    }, [page.fileId, page.pageIndex, runtime]);

    const applyElements = useCallback((next: EditElement[], shouldPushHistory = true) => {
        onElementsChange(next);
        if (shouldPushHistory && onPushHistory) {
            onPushHistory(next);
        }
    }, [onElementsChange, onPushHistory]);

    const commitTextEditor = useCallback(() => {
        if (!textEditor) return;
        if (textEditor.value !== textEditor.initialValue) {
            applyElements(elements, true);
        }
        setTextEditor(null);
        setInlineUiState(selectedElementId ? 'selected' : 'idle');
    }, [applyElements, elements, selectedElementId, textEditor]);

    const startEditingText = useCallback((element: TextElement) => {
        setSelectedElementId(element.id);
        setInlineUiState('editing');
        setTextEditor({ id: element.id, value: element.text, initialValue: element.text });
    }, []);

    const handleTextEditorChange = useCallback((id: string, value: string) => {
        const normalizedValue = sanitizeInlineText(value);
        setTextEditor((prev: TextEditorState | null) => prev?.id === id ? { ...prev, value: normalizedValue } : prev);
        applyElements(elements.map(item => (item.id === id && item.type === 'text') ? { ...item, text: normalizedValue } : item), false);
    }, [applyElements, elements]);

    // Selection Logic for Text Layer
    const selectTextSpanForEditing = useCallback((clickedSpan: TextLayerSpan) => {
        const mergedLine = mergeTextLine(textLayerSpans, clickedSpan);
        if (!mergedLine) {
            setInlineUiState('idle');
            return;
        }

        const { left, top, width: w, height: h } = mergedLine;
        const existing = elements.find(el =>
            el.type === 'text' && Math.abs(el.x - left) < 0.005 && Math.abs(el.y - top) < 0.005
        );

        if (existing) {
            setSelectedElementId(existing.id);
            setInlineUiState('selected');
            startEditingText(existing as TextElement);
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
            id: crypto.randomUUID(), type: 'text', x: left, y: top, w: w + 0.02, h: h + 0.005,
            text: mergedLine.text, color: '#000000',
            fontSize: estimateInlineFontSizePt(mergedLine.fontSizeRatio, mergedLine.pageHeightPt ?? 842),
            fontFamily: resolveFontFamily(mergedLine.fontName, mergedLine.fontFamilyHint),
            fontWeight: 'normal', fontStyle: 'normal', textAlign: 'left', lineHeight: 1.2, letterSpacing: 0, opacity: 1,
            ascent: mergedLine.ascentRatio ? mergedLine.ascentRatio * (mergedLine.pageHeightPt ?? 842) : undefined
        };

        applyElements([...elements, whiteout, next]);
        setSelectedElementId(next.id);
        startEditingText(next);
    }, [applyElements, elements, startEditingText, textLayerSpans]);

    // Pointer Handlers
    const onCanvasPointerDown = (event: React.PointerEvent) => {
        if (textEditor) commitTextEditor();
        const rect = canvasRef.current!.getBoundingClientRect();
        const x = clamp01((event.clientX - rect.left) / rect.width);
        const y = clamp01((event.clientY - rect.top) / rect.height);
        setIsPointerDown(true);

        if (activeTool === 'text') {
            const clickedSpan = findNearestTextSpan({ x, y }, textLayerSpans);
            if (clickedSpan) {
                // If we found a span, we ALWAYS select it if in select mode,
                // or if we are in add mode but clicked close enough to an existing span (smart selection)
                selectTextSpanForEditing(clickedSpan);
            } else if (!isSelectMode) {
                // Only add new text if explicitly in ADD mode and clicked empty space
                const next: TextElement = {
                    id: crypto.randomUUID(), type: 'text', x, y, w: 0.5, h: 0.06,
                    text: ui.text, color: '#0f172a', fontSize: 18, fontFamily: 'sora',
                    fontWeight: 'normal', fontStyle: 'normal', textAlign: 'left',
                    lineHeight: 1.2, letterSpacing: 0, opacity: 1
                };
                applyElements([...elements, next]);
                setSelectedElementId(next.id);
                startEditingText(next);
            }
        } else if (activeTool === 'annotate') {
            setDraftStroke({ points: [x, y] });
        } else if (activeTool === 'shapes' || activeTool === 'whiteout') {
            setDraftRect({ startX: x, startY: y, x, y, w: 0, h: 0 });
        }
    };

    const onCanvasPointerMove = (event: React.PointerEvent) => {
        if (!isPointerDown) return;
        const rect = canvasRef.current!.getBoundingClientRect();
        const x = clamp01((event.clientX - rect.left) / rect.width);
        const y = clamp01((event.clientY - rect.top) / rect.height);

        if (draftStroke) {
            setDraftStroke(prev => prev ? { points: [...prev.points, x, y] } : null);
        } else if (draftRect) {
            setDraftRect(prev => prev ? {
                ...prev,
                x: Math.min(prev.startX, x),
                y: Math.min(prev.startY, y),
                w: Math.abs(x - prev.startX),
                h: Math.abs(y - prev.startY)
            } : null);
        }
    };

    const onCanvasPointerUp = () => {
        setIsPointerDown(false);
        if (draftStroke && draftStroke.points.length >= 4) {
            applyElements([...elements, {
                id: crypto.randomUUID(), type: 'stroke', points: draftStroke.points,
                color: '#2563eb', width: 2, opacity: 1
            }]);
        } else if (draftRect && draftRect.w > 0.002) {
            applyElements([...elements, {
                id: crypto.randomUUID(), type: 'rect', x: draftRect.x, y: draftRect.y,
                w: draftRect.w, h: draftRect.h,
                fill: activeTool === 'whiteout' ? '#ffffff' : 'transparent',
                stroke: activeTool === 'whiteout' ? '#d1d5db' : '#2563eb',
                strokeWidth: activeTool === 'whiteout' ? 1 : 2, opacity: 1
            }]);
        }
        setDraftStroke(null);
        setDraftRect(null);
    };

    const handleElementAction = (id: string, action: 'delete' | 'duplicate' | 'update', patch?: any) => {
        if (action === 'delete') {
            applyElements(elements.filter(el => el.id !== id));
            setSelectedElementId(null);
        } else if (action === 'duplicate') {
            const el = elements.find(e => e.id === id);
            if (el) {
                const nextX = ('x' in el) ? el.x + 0.02 : 0;
                const nextY = ('y' in el) ? el.y + 0.02 : 0;
                applyElements([...elements, { ...el, id: crypto.randomUUID(), ...(('x' in el) ? { x: nextX, y: nextY } : {}) } as EditElement]);
            }
        } else if (action === 'update' && patch) {
            applyElements(elements.map(el => el.id === id ? { ...el, ...patch } : el));
        }
    };

    return (
        <div
            ref={canvasRef}
            className="studio-page-editor-container"
            style={{ width, height, position: 'relative' }}
            onPointerDown={onCanvasPointerDown}
            onPointerMove={onCanvasPointerMove}
            onPointerUp={onCanvasPointerUp}
        >
            {/* Built-in Toolbar */}
            <div className="studio-page-editor-toolbar" style={{
                position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)',
                zIndex: 100, display: 'flex', gap: 6, padding: '4px 6px',
                background: 'rgba(15, 23, 42, 0.9)', border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 12, backdropFilter: 'blur(8px)', pointerEvents: 'auto',
                boxShadow: '0 8px 32px rgba(0,0,0,0.3)'
            }}>
                <button
                    className={`studio-page-tool-btn ${activeTool === 'text' && isSelectMode ? 'active' : ''}`}
                    onClick={(e) => { e.stopPropagation(); setActiveTool('text'); setIsSelectMode(true); }}
                    style={toolBtnStyle(activeTool === 'text' && isSelectMode)}
                    title={ui.selectText}
                >
                    <LinearIcon name="cursor" size={18} />
                </button>
                <button
                    className={`studio-page-tool-btn ${activeTool === 'text' && !isSelectMode ? 'active' : ''}`}
                    onClick={(e) => { e.stopPropagation(); setActiveTool('text'); setIsSelectMode(false); }}
                    style={toolBtnStyle(activeTool === 'text' && !isSelectMode)}
                    title={ui.text}
                >
                    <LinearIcon name="text" size={18} />
                </button>
                <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.1)', margin: '0 4px' }} />
                <button
                    className={`studio-page-tool-btn ${activeTool === 'annotate' ? 'active' : ''}`}
                    onClick={(e) => { e.stopPropagation(); setActiveTool('annotate'); }}
                    style={toolBtnStyle(activeTool === 'annotate')}
                    title={ui.annotate}
                >
                    <LinearIcon name="edit" size={18} />
                </button>
                <button
                    className={`studio-page-tool-btn ${activeTool === 'shapes' ? 'active' : ''}`}
                    onClick={(e) => { e.stopPropagation(); setActiveTool('shapes'); }}
                    style={toolBtnStyle(activeTool === 'shapes')}
                    title={ui.shapes}
                >
                    <LinearIcon name="shape" size={18} />
                </button>
                <button
                    className={`studio-page-tool-btn ${activeTool === 'whiteout' ? 'active' : ''}`}
                    onClick={(e) => { e.stopPropagation(); setActiveTool('whiteout'); }}
                    style={toolBtnStyle(activeTool === 'whiteout')}
                    title={ui.whiteout}
                >
                    <LinearIcon name="eraser" size={18} />
                </button>
                {(onFinish || onDiscard) && (
                    <>
                        <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.1)', margin: '0 4px' }} />
                        {onFinish && (
                            <button
                                className="studio-page-tool-btn is-success"
                                onClick={(e) => { e.stopPropagation(); onFinish(); }}
                                style={toolBtnStyle(false)}
                                title="Finish and Save"
                            >
                                <LinearIcon name="check" size={18} />
                            </button>
                        )}
                        {onDiscard && (
                            <button
                                className="studio-page-tool-btn is-danger"
                                onClick={(e) => { e.stopPropagation(); onDiscard(); }}
                                style={toolBtnStyle(false)}
                                title="Cancel"
                            >
                                <LinearIcon name="x" size={18} />
                            </button>
                        )}
                    </>
                )}
            </div>

            {/* Transparent background layer for catching events */}
            <div style={{ position: 'absolute', inset: 0, pointerEvents: 'auto' }} />

            {/* Render Elements */}
            {elements.map(el => (
                <div
                    key={el.id}
                    className={`studio-editor-element ${selectedElementId === el.id ? 'selected' : ''}`}
                    style={{
                        position: 'absolute',
                        left: ('x' in el) ? `${el.x * 100}%` : '0',
                        top: ('y' in el) ? `${el.y * 100}%` : '0',
                        width: (textEditor?.id === el.id) ? 'auto' : (('w' in el) ? `${el.w * 100}%` : 'auto'),
                        minWidth: (textEditor?.id === el.id && 'w' in el) ? `${el.w * 100}%` : 'auto',
                        maxWidth: (textEditor?.id === el.id) ? '90%' : 'none',
                        height: ('h' in el) ? `${el.h * 100}%` : 'auto',
                        pointerEvents: 'auto',
                        zIndex: selectedElementId === el.id ? 1001 : 1,
                    }}
                    onPointerDown={(e) => { e.stopPropagation(); setSelectedElementId(el.id); }}
                >
                    {el.type === 'text' && (
                        <div style={{
                            fontSize: el.fontSize, color: el.color, fontFamily: el.fontFamily,
                            fontWeight: el.fontWeight, fontStyle: el.fontStyle, textAlign: el.textAlign,
                            lineHeight: el.lineHeight, letterSpacing: el.letterSpacing,
                            whiteSpace: 'nowrap', position: 'relative', display: 'grid'
                        }}>
                            {textEditor?.id === el.id ? (
                                <>
                                    {/* Mirror span for auto-growth */}
                                    <span style={{
                                        gridArea: '1/1', visibility: 'hidden', whiteSpace: 'nowrap',
                                        padding: 0, border: 'none', font: 'inherit', letterSpacing: 'inherit',
                                        minWidth: '50px' // Ensure some clickable area
                                    }}>
                                        {textEditor.value || ' '}
                                    </span>
                                    <textarea
                                        autoFocus
                                        value={textEditor.value}
                                        onChange={(e) => handleTextEditorChange(el.id, e.target.value)}
                                        style={{
                                            gridArea: '1/1', width: '100%', height: '100%',
                                            background: 'none', border: 'none', resize: 'none', outline: 'none',
                                            padding: 0, margin: 0, font: 'inherit', color: 'inherit',
                                            lineHeight: 'inherit', letterSpacing: 'inherit',
                                            whiteSpace: 'nowrap', overflow: 'hidden'
                                        }}
                                    />
                                </>
                            ) : el.text}
                        </div>
                    )}
                    {el.type === 'rect' && (
                        <div style={{
                            width: '100%', height: '100%', backgroundColor: el.fill,
                            border: `${el.strokeWidth}px solid ${el.stroke}`, opacity: el.opacity
                        }} />
                    )}
                    {/* Floating Menu for selected element */}
                    {selectedElementId === el.id && (
                        <StudioFloatingMenu
                            element={el}
                            onUpdate={(patch) => handleElementAction(el.id, 'update', patch)}
                            onDelete={() => handleElementAction(el.id, 'delete')}
                            onDuplicate={() => handleElementAction(el.id, 'duplicate')}
                        />
                    )}
                </div>
            ))}

            {/* Draw Drafts */}
            {draftRect && (
                <div style={{
                    position: 'absolute', left: `${draftRect.x * 100}%`, top: `${draftRect.y * 100}%`,
                    width: `${draftRect.w * 100}%`, height: `${draftRect.h * 100}%`,
                    border: '1px dashed #2563eb'
                }} />
            )}
        </div>
    );
}

function toolBtnStyle(active: boolean): React.CSSProperties {
    return {
        all: 'unset',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 32,
        height: 32,
        borderRadius: 8,
        cursor: 'pointer',
        color: active ? '#ffffff' : 'rgba(255,255,255,0.6)',
        background: active ? 'rgba(59, 130, 246, 0.4)' : 'transparent',
        transition: 'all 0.2s ease',
        border: active ? '1px solid rgba(147, 197, 253, 0.5)' : '1px solid transparent'
    };
}
