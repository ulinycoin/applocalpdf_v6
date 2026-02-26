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
import { clamp01, getStrokeBounds, moveStrokePoints } from '../../utils/studio-edit-math';
import {
    EditElement,
    ImageElement,
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
import { TOOLS, ToolContext } from './tools';

import { LinearIcon } from '../icons/linear-icon';



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
    onActiveToolChange?: (tool: StudioEditToolId) => void;
    isSelectMode: boolean;
    setIsSelectMode: (val: boolean) => void;
    textSelectionMode?: 'line' | 'word';
    onTextSelectionModeChange?: (mode: 'line' | 'word') => void;
    annotateColor?: string;
    textLayerSpans: TextLayerSpan[];
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
    onActiveToolChange,
    isSelectMode,
    setIsSelectMode,
    textSelectionMode: externalTextSelectionMode,
    onTextSelectionModeChange,
    annotateColor = '#fff176',
    textLayerSpans,
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

    const [inlineUiState, setInlineUiState] = useState<InlineUiState>('idle');

    useEffect(() => {
        if (onInlineUiStateChange) onInlineUiStateChange(inlineUiState);
    }, [inlineUiState, onInlineUiStateChange]);

    const [isPointerDown, setIsPointerDown] = useState(false);
    const [draftRect, setDraftRect] = useState<RectDraft | null>(null);
    const [draftStroke, setDraftStroke] = useState<StrokeDraft | null>(null);

    const [internalTextSelectionMode, setInternalTextSelectionMode] = useState<'line' | 'word'>('line');
    const textSelectionMode = externalTextSelectionMode !== undefined ? externalTextSelectionMode : internalTextSelectionMode;
    const setTextSelectionMode = (mode: 'line' | 'word') => {
        if (onTextSelectionModeChange) onTextSelectionModeChange(mode);
        else setInternalTextSelectionMode(mode);
    };

    const [internalActiveTool, setInternalActiveTool] = useState<StudioEditToolId>(externalActiveTool);
    const activeTool = externalActiveTool !== undefined ? externalActiveTool : internalActiveTool;
    const setActiveTool = (tool: StudioEditToolId) => {
        if (onActiveToolChange) onActiveToolChange(tool);
        else setInternalActiveTool(tool);
    };

    const locale = useMemo(() => detectStudioEditLocale(), []);
    const ui = useMemo(() => getStudioEditMessages(locale), [locale]);


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

    const buildToolContext = (): ToolContext => ({
        elements,
        applyElements,
        textLayerSpans,
        isSelectMode,
        textSelectionMode,
        textEditor,
        commitTextEditor,
        startEditingText,
        setSelectedElementId,
        setInlineUiState,
        uiMessages: ui,
        draftRect,
        setDraftRect,
        draftStroke,
        setDraftStroke,
        isPointerDown,
        setIsPointerDown,
        annotateColor,
    });

    // Pointer Handlers
    const onCanvasPointerDown = (event: React.PointerEvent) => {
        const rect = canvasRef.current!.getBoundingClientRect();
        const worldPos = {
            x: clamp01((event.clientX - rect.left) / rect.width),
            y: clamp01((event.clientY - rect.top) / rect.height)
        };
        const tool = TOOLS[activeTool] ?? TOOLS['text'];
        tool.onPointerDown(buildToolContext(), event, worldPos);
    };

    const onCanvasPointerMove = (event: React.PointerEvent) => {
        const rect = canvasRef.current!.getBoundingClientRect();
        const worldPos = {
            x: clamp01((event.clientX - rect.left) / rect.width),
            y: clamp01((event.clientY - rect.top) / rect.height)
        };
        const tool = TOOLS[activeTool] ?? TOOLS['text'];
        tool.onPointerMove(buildToolContext(), event, worldPos);
    };

    const onCanvasPointerUp = (event: React.PointerEvent) => {
        const rect = canvasRef.current!.getBoundingClientRect();
        const worldPos = {
            x: clamp01((event.clientX - rect.left) / rect.width),
            y: clamp01((event.clientY - rect.top) / rect.height)
        };
        const tool = TOOLS[activeTool] ?? TOOLS['text'];
        tool.onPointerUp(buildToolContext(), event, worldPos);
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

    const textLayerNodes = useMemo(() => {
        return textLayerSpans.map((span, idx) => (
            <div
                key={`span-${idx}`}
                className="studio-edit-text-highlight"
                data-testid="studio-edit-text-highlight"
                style={{
                    position: 'absolute',
                    left: `${span.xRatio * 100}%`,
                    top: `${span.yRatio * 100}%`,
                    width: `${span.widthRatio * 100}%`,
                    height: `${span.heightRatio * 100}%`,
                    border: isSelectMode ? '1px solid rgba(59, 130, 246, 0.4)' : '1px solid transparent',
                    backgroundColor: isSelectMode ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
                    pointerEvents: isSelectMode ? 'auto' : 'none',
                    zIndex: 100,
                    visibility: (isSelectMode || textLayerSpans.length > 0) ? 'visible' : 'hidden',
                    opacity: isSelectMode ? 1 : 0.01 // Minimal opacity for "visibility" but hidden to users
                }}
            />
        ));
    }, [textLayerSpans, isSelectMode]);

    const toCssFontFamily = (fontFamily: FontFamilyId): string => {
        if (fontFamily === 'times') return '"Times New Roman", Times, serif';
        if (fontFamily === 'mono') return '"Courier New", Courier, monospace';
        if (fontFamily === 'roboto') return 'Roboto, "Noto Sans", Arial, sans-serif';
        if (fontFamily === 'noto') return '"Noto Sans", Roboto, Arial, sans-serif';
        if (fontFamily === 'noto-arabic') return '"Noto Sans Arabic", "Noto Naskh Arabic", "Noto Sans", serif';
        if (fontFamily === 'noto-cjk') return '"Noto Sans CJK SC", "Noto Sans SC", "Noto Sans JP", "Noto Sans KR", "Noto Sans", sans-serif';
        if (fontFamily === 'noto-devanagari') return '"Noto Sans Devanagari", "Noto Sans", sans-serif';
        return 'Helvetica, Arial, sans-serif';
    };

    return (
        <div
            ref={canvasRef}
            className="studio-page-editor-container studio-edit-canvas-content"
            style={{ width, height, position: 'relative' }}
            onPointerDown={onCanvasPointerDown}
            onPointerMove={onCanvasPointerMove}
            onPointerUp={onCanvasPointerUp}
            data-is-select-mode={isSelectMode}
            data-text-layer-len={textLayerSpans.length}
        >

            {/* Built-in Toolbar (Moved to StudioEditWorkspace) */}




            {/* Render Elements */}
            {elements.map((el) => {
                const strokeBounds = el.type === 'stroke' ? getStrokeBounds(el.points) : null;
                // Add padding to ensure stroke width fits inside the SVG viewBox and it never collapses to 0 height
                const paddingLimit = el.type === 'stroke' ? ((el.width ?? 0) / Math.max(width, height)) * 1.5 : 0;
                const strokeWidth = strokeBounds ? Math.max(paddingLimit, strokeBounds.maxX - strokeBounds.minX + paddingLimit * 2) : 0;
                const strokeHeight = strokeBounds ? Math.max(paddingLimit, strokeBounds.maxY - strokeBounds.minY + paddingLimit * 2) : 0;

                return (
                    <div
                        key={el.id}
                        data-editor-element-id={el.id}
                        className={`studio-editor-element ${selectedElementId === el.id ? 'selected' : ''}`}
                        style={{
                            position: 'absolute',
                            left: el.type === 'stroke'
                                ? `${((strokeBounds?.minX ?? 0) - paddingLimit) * 100}%`
                                : (('x' in el) ? `${el.x * 100}%` : '0'),
                            top: el.type === 'stroke'
                                ? `${((strokeBounds?.minY ?? 0) - paddingLimit) * 100}%`
                                : (('y' in el) ? `${el.y * 100}%` : '0'),
                            width: el.type === 'stroke'
                                ? `${strokeWidth * 100}%`
                                : ((textEditor?.id === el.id) ? 'auto' : (('w' in el) ? `${el.w * 100}%` : 'auto')),
                            minWidth: (textEditor?.id === el.id && 'w' in el) ? `${el.w * 100}%` : 'auto',
                            maxWidth: (textEditor?.id === el.id) ? '90%' : 'none',
                            height: el.type === 'stroke'
                                ? `${strokeHeight * 100}%`
                                : (('h' in el) ? `${el.h * 100}%` : 'auto'),
                            pointerEvents: 'auto',
                            zIndex: selectedElementId === el.id ? 1001 : 1,
                        }}
                        onPointerDown={(e) => {
                            e.stopPropagation();
                            setSelectedElementId(el.id);
                            if (!textEditor || textEditor.id !== el.id) {
                                dragSessionRef.current = {
                                    mode: el.type === 'text'
                                        ? 'move-text'
                                        : (el.type === 'rect' || el.type === 'image' ? 'move-rect' : 'move-stroke') as any,
                                    id: el.id,
                                    startClientX: e.clientX,
                                    startClientY: e.clientY,
                                    originX: ('x' in el) ? el.x : 0,
                                    originY: ('y' in el) ? el.y : 0,
                                    ...(el.type === 'stroke' ? { initialPoints: el.points } : {}),
                                    initialElements: elements
                                };
                                try {
                                    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                                } catch (err) { }
                            }
                        }}
                        onDoubleClick={(e) => {
                            if (el.type !== 'text') {
                                return;
                            }
                            e.stopPropagation();
                            startEditingText(el as TextElement);
                        }}
                        onPointerMove={(e) => {
                            const sess = dragSessionRef.current as any;
                            if (sess && sess.id === el.id && sess.mode === 'move-stroke' && el.type === 'stroke') {
                                const dx = (e.clientX - sess.startClientX) / width;
                                const dy = (e.clientY - sess.startClientY) / height;
                                handleElementAction(el.id, 'update', {
                                    points: moveStrokePoints(sess.initialPoints ?? el.points, dx, dy),
                                });
                            } else if (sess && sess.id === el.id && sess.mode.startsWith('move-')) {
                                const dx = (e.clientX - sess.startClientX) / width;
                                const dy = (e.clientY - sess.startClientY) / height;
                                const nextX = clamp01(sess.originX + dx);
                                const nextY = clamp01(sess.originY + dy);
                                handleElementAction(el.id, 'update', {
                                    x: nextX,
                                    y: nextY
                                });
                            } else if (sess && sess.id === el.id && sess.mode === 'resize-image') {
                                const dx = (e.clientX - sess.startClientX) / width;
                                const minW = 0.04;
                                const minH = 0.02;
                                const aspect = Math.max(0.05, sess.originW / Math.max(0.01, sess.originH));
                                const maxW = Math.max(minW, 1 - sess.originX);
                                const maxH = Math.max(minH, 1 - sess.originY);

                                let nextW = clamp(sess.originW + dx, minW, maxW);
                                let nextH = nextW / aspect;
                                if (nextH > maxH) {
                                    nextH = maxH;
                                    nextW = nextH * aspect;
                                }
                                if (nextH < minH) {
                                    nextH = minH;
                                    nextW = nextH * aspect;
                                }
                                if (nextW > maxW) {
                                    nextW = maxW;
                                    nextH = nextW / aspect;
                                }
                                handleElementAction(el.id, 'update', { w: nextW, h: nextH });
                            } else if (sess && sess.id === el.id && sess.mode === 'resize-text') {
                                const dx = (e.clientX - sess.startClientX) / width;
                                const dy = (e.clientY - sess.startClientY) / height;
                                const delta = Math.max(dx, dy);
                                const scale = clamp(1 + delta * 1.6, 0.45, 4);
                                const nextW = clamp(sess.originW * scale, 0.05, 0.95);
                                const nextH = clamp(sess.originH * scale, 0.02, 0.6);
                                const nextFontSize = clamp(sess.originFontSize * scale, 8, 144);
                                handleElementAction(el.id, 'update', {
                                    w: nextW,
                                    h: nextH,
                                    fontSize: nextFontSize,
                                });
                            }
                        }}
                        onPointerUp={(e) => {
                            if (dragSessionRef.current && dragSessionRef.current.id === el.id) {
                                dragSessionRef.current = null;
                                try {
                                    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
                                } catch (err) { }
                            }
                        }}
                        onPointerCancel={(e) => {
                            if (dragSessionRef.current && dragSessionRef.current.id === el.id) {
                                dragSessionRef.current = null;
                                try {
                                    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
                                } catch (err) { }
                            }
                        }}
                    >
                        {el.type === 'text' && (
                            <div className="studio-edit-text" style={{
                                fontSize: el.fontSize, color: el.color, fontFamily: toCssFontFamily(el.fontFamily),
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
                                            className="studio-edit-textarea"
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
                        {el.type === 'form-field' && (
                            <div style={{
                                width: '100%', height: '100%',
                                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                                border: '1px dashed #3b82f6', opacity: el.opacity,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontFamily: 'sans-serif', fontSize: 12, color: '#3b82f6',
                                overflow: 'hidden'
                            }}>
                                {el.formType === 'text' ? 'Text Field' : el.formType === 'checkbox' ? 'Checkbox' : 'Radio'}
                            </div>
                        )}
                        {el.type === 'image' && (
                            <img
                                src={el.dataUrl}
                                alt="Signature"
                                draggable={false}
                                style={{ width: '100%', height: '100%', objectFit: 'fill', opacity: el.opacity, pointerEvents: 'none', userSelect: 'none' }}
                            />
                        )}
                        {el.type === 'stroke' && strokeBounds && (
                            <svg
                                width="100%"
                                height="100%"
                                viewBox={`0 0 ${strokeWidth * width} ${strokeHeight * height}`}
                                style={{ overflow: 'visible', pointerEvents: 'none' }}
                            >
                                <polyline
                                    points={el.points.reduce((acc, value, idx) => {
                                        if (idx % 2 === 0) {
                                            const px = ((value - strokeBounds.minX + paddingLimit) / strokeWidth) * (strokeWidth * width);
                                            return `${acc}${px},`;
                                        }
                                        const py = ((value - strokeBounds.minY + paddingLimit) / strokeHeight) * (strokeHeight * height);
                                        return `${acc}${py} `;
                                    }, '').trim()}
                                    fill="none"
                                    stroke={el.color}
                                    strokeWidth={el.width}
                                    strokeOpacity={el.opacity}
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                />
                            </svg>
                        )}
                        {selectedElementId === el.id && el.type === 'image' && (
                            <button
                                type="button"
                                className="studio-edit-text-resize"
                                title="Resize"
                                onPointerDown={(event) => {
                                    event.stopPropagation();
                                    const image = el as ImageElement;
                                    dragSessionRef.current = {
                                        mode: 'resize-image',
                                        id: image.id,
                                        startClientX: event.clientX,
                                        startClientY: event.clientY,
                                        originW: image.w,
                                        originH: image.h,
                                        originX: image.x,
                                        originY: image.y,
                                        initialElements: elements,
                                    };
                                    try {
                                        (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
                                    } catch (err) { }
                                }}
                            />
                        )}
                        {selectedElementId === el.id && el.type === 'text' && textEditor?.id !== el.id && (
                            <button
                                type="button"
                                className="studio-edit-text-resize"
                                title="Resize text"
                                onPointerDown={(event) => {
                                    event.stopPropagation();
                                    const textEl = el as TextElement;
                                    dragSessionRef.current = {
                                        mode: 'resize-text',
                                        id: textEl.id,
                                        startClientX: event.clientX,
                                        startClientY: event.clientY,
                                        originW: textEl.w,
                                        originH: textEl.h,
                                        originFontSize: textEl.fontSize,
                                        initialElements: elements,
                                    };
                                    try {
                                        (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
                                    } catch (err) { }
                                }}
                            />
                        )}
                    </div>
                );
            })}

            {/* Draw Drafts */}
            {draftRect && (
                <div style={{
                    position: 'absolute', left: `${draftRect.x * 100}%`, top: `${draftRect.y * 100}%`,
                    width: `${draftRect.w * 100}%`, height: `${draftRect.h * 100}%`,
                    border: '1px dashed #2563eb'
                }} />
            )}
            {draftStroke && draftStroke.points.length >= 4 && (
                <svg
                    style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
                    width={width}
                    height={height}
                    viewBox={`0 0 ${width} ${height}`}
                >
                    <polyline
                        points={draftStroke.points.reduce((acc, value, idx) => {
                            const mapped = idx % 2 === 0 ? value * width : value * height;
                            return `${acc}${mapped}${idx % 2 === 0 ? ',' : ' '}`;
                        }, '').trim()}
                        fill="none"
                        stroke={annotateColor}
                        strokeWidth={12}
                        strokeOpacity={0.45}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    />
                </svg>
            )}

            {textLayerNodes}
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
