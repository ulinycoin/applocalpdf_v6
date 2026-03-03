import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useStudioEditController } from './edit/use-studio-edit-controller';
import { StudioEditToolbar } from './edit/StudioEditToolbar';
import { StudioSignComposerModal } from './edit/StudioSignComposerModal';
import { StudioAnnotateSettingsPanel } from './edit/StudioAnnotateSettingsPanel';
import { StudioFormsQuickBar } from './edit/StudioFormsQuickBar';
import { StudioProtectSettingsPanel } from './edit/StudioProtectSettingsPanel';
import { LinearIcon } from '../icons/linear-icon';
import { detectStudioEditLocale, getStudioEditMessages } from './studio-edit-i18n';
import { StudioPageEditor } from './StudioPageEditor';
import { DraggableFloatingMenu } from './StudioDraggableFloatingMenu';
import { useStudioEditZoom } from './edit/use-studio-edit-zoom';
import type { FormFieldElement } from './editor-types';

export function StudioEditWorkspace() {
    const locale = useMemo(() => detectStudioEditLocale(), []);
    const ui = useMemo(() => getStudioEditMessages(locale), [locale]);

    const ctrl = useStudioEditController(ui);
    const zoom = useStudioEditZoom(ctrl.runId || 'unknown', 1);
    const imageRef = useRef<HTMLImageElement | null>(null);
    const [canvasSize, setCanvasSize] = useState<{ width: number; height: number }>({ width: 620, height: 840 });

    useEffect(() => {
        if (!ctrl.message) {
            return;
        }
        const timeoutId = window.setTimeout(() => {
            ctrl.setMessage(null);
        }, 5000);
        return () => {
            window.clearTimeout(timeoutId);
        };
    }, [ctrl.message, ctrl.setMessage]);

    const handleWheel = (e: React.WheelEvent) => {
        if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            zoom.zoomAtScreenPoint(e.clientX, e.clientY, e.deltaY > 0 ? 'out' : 'in', 'wheel');
        }
    };

    useEffect(() => {
        const url = ctrl.preview?.page.thumbnailUrl;
        if (!url) {
            setCanvasSize({ width: 620, height: 840 });
            return;
        }
        const img = new Image();
        img.onload = () => {
            const naturalWidth = img.naturalWidth || 620;
            const naturalHeight = img.naturalHeight || 840;
            const maxWidth = 620;
            const maxHeight = 840;
            const scale = Math.min(maxWidth / naturalWidth, maxHeight / naturalHeight);
            const width = Math.max(240, Math.round(naturalWidth * scale));
            const height = Math.max(320, Math.round(naturalHeight * scale));
            setCanvasSize({ width, height });
        };
        img.onerror = () => {
            setCanvasSize({ width: 620, height: 840 });
        };
        img.src = url;
    }, [ctrl.preview?.page.thumbnailUrl]);

    const selectedFormField = ctrl.selectedElementId
        ? ctrl.elements.find(
            (element): element is FormFieldElement => element.id === ctrl.selectedElementId && element.type === 'form-field',
        ) ?? null
        : null;

    const updateSelectedFormField = (patch: Partial<FormFieldElement>) => {
        if (!selectedFormField) return;
        const next = ctrl.elements.map((element) => (
            element.id === selectedFormField.id && element.type === 'form-field'
                ? { ...element, ...patch }
                : element
        ));
        ctrl.setElements(next);
        ctrl.pushHistory(next);
    };

    const protectPermissionsOnly = ctrl.protectOptions?.permissionsOnly === true;
    const protectUserPassword = typeof ctrl.protectOptions?.userPassword === 'string'
        ? ctrl.protectOptions.userPassword
        : '';

    if (!ctrl.preview) {
        return (
            <section className="studio-edit-shell">
                <div className="studio-edit-empty">
                    <h2 className="studio-edit-empty-title">{ui.selectPageTitle}</h2>
                    <button type="button" className="studio-edit-back-btn" onClick={() => {
                        ctrl.clearEditSession();
                        ctrl.navigate('/studio');
                    }}>
                        {ui.backToCanvas}
                    </button>
                </div>
            </section>
        );
    }

    // Calculation for canvas wrapper sizing
    const scaledWidth = canvasSize.width * zoom.zoomLevel;
    const scaledHeight = canvasSize.height * zoom.zoomLevel;

    return (
        <section className="studio-edit-shell" translate="no" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            {/* Header Area */}
            <div className="studio-edit-meta" style={{ padding: '8px 16px', background: 'rgba(15,23,42,0.4)', borderRadius: '0 0 12px 12px', marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', gap: 12, flex: 1, alignItems: 'center' }}>
                    <button type="button" className="studio-edit-back-btn" onClick={() => {
                        if (ctrl.hasDirtyChanges && !window.confirm(ui.unsavedConfirm)) return;
                        ctrl.clearEditSession();
                        ctrl.navigate('/studio');
                    }} title={ui.backToCanvas} style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '4px' }}>
                        <LinearIcon name="chevron-left" size={18} />
                    </button>

                    <div style={{ display: 'flex', gap: 8, padding: '0 8px', borderLeft: '1px solid rgba(255,255,255,0.1)', borderRight: '1px solid rgba(255,255,255,0.1)' }}>
                        <button type="button" data-testid="studio-edit-undo-btn" className="studio-edit-btn-cancel" onClick={ctrl.undo} disabled={ctrl.isApplying || ctrl.historyIndex <= 0} title={ui.undo} style={{ padding: '4px 8px', fontSize: 13, background: 'transparent' }}>
                            {ui.undo}
                        </button>
                        <button type="button" data-testid="studio-edit-redo-btn" className="studio-edit-btn-cancel" onClick={ctrl.redo} disabled={ctrl.isApplying || ctrl.historyIndex >= ctrl.history.length - 1} title={ui.redo} style={{ padding: '4px 8px', fontSize: 13, background: 'transparent' }}>
                            {ui.redo}
                        </button>
                    </div>

                    <span className="studio-edit-page-badge">{ctrl.preview.docName}</span>
                </div>

                <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end', gap: '12px', alignItems: 'center' }}>

                    <div className="studio-edit-zoom-controls" style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(0,0,0,0.2)', padding: '4px 8px', borderRadius: 8 }}>
                        <button type="button" className="studio-floating-btn" style={{ width: 24, height: 24 }} onClick={() => zoom.zoomOut()} title="Zoom Out">
                            <LinearIcon name="minus" size={14} />
                        </button>
                        <span style={{ fontSize: 13, minWidth: 44, textAlign: 'center', color: 'rgba(255,255,255,0.9)' }}>{Math.round(zoom.zoomLevel * 100)}%</span>
                        <button type="button" className="studio-floating-btn" style={{ width: 24, height: 24 }} onClick={() => zoom.zoomIn()} title="Zoom In">
                            <LinearIcon name="plus" size={14} />
                        </button>
                        <div style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.1)', margin: '0 4px' }} />
                        <button type="button" className="studio-floating-btn" style={{ padding: '0 8px', height: 24, fontSize: 12 }} onClick={() => zoom.zoomToHundred()} title="100%">1:1</button>
                        <button type="button" className="studio-floating-btn" style={{ width: 24, height: 24 }} onClick={() => zoom.fitToPage(canvasSize.width, canvasSize.height)} title="Fit to Page">
                            <LinearIcon name="maximize" size={14} />
                        </button>
                        <button type="button" className="studio-floating-btn" style={{ width: 24, height: 24 }} onClick={() => zoom.fitToWidth(canvasSize.width)} title="Fit to Width">
                            <LinearIcon name="move-horizontal" size={14} />
                        </button>
                    </div>

                    <div style={{ width: 1, height: 24, background: 'rgba(255,255,255,0.1)' }} />

                    {ctrl.saveUndoStack.length > 0 && (
                        <button type="button" className="studio-edit-btn-cancel" onClick={ctrl.undoLastSave} disabled={ctrl.isApplying} aria-label={ui.undoSave} style={{ padding: '6px 12px' }}>
                            {ui.undoSave}
                        </button>
                    )}
                    {ctrl.saveRedoStack.length > 0 && (
                        <button type="button" className="studio-edit-btn-cancel" onClick={ctrl.redoLastSave} disabled={ctrl.isApplying} aria-label={ui.redoSave} style={{ padding: '6px 12px' }}>
                            {ui.redoSave}
                        </button>
                    )}

                </div>
            </div>
            {ctrl.tool === 'forms' && (
                <div style={{ padding: '0 16px 12px' }}>
                    <StudioFormsQuickBar
                        onAddField={ctrl.addFormField}
                        selectedField={selectedFormField}
                        onUpdateSelectedField={updateSelectedFormField}
                        canvasWidth={canvasSize.width}
                        canvasHeight={canvasSize.height}
                    />
                </div>
            )}
            {ctrl.tool === 'protect' && (
                <div style={{ padding: '0 16px 12px' }}>
                    <StudioProtectSettingsPanel
                        ui={ui}
                        onOptionsChange={ctrl.setProtectOptions}
                    />
                </div>
            )}

            {/* Main Workspace Area (Toolbar + Canvas) */}
            <div style={{ display: 'flex', flex: 1, overflow: 'hidden', position: 'relative' }}>
                <div style={{ padding: '0 16px', zIndex: 10 }}>
                    <StudioEditToolbar
                        ui={ui}
                        tool={ctrl.tool}
                        onSelectTool={ctrl.setTool}
                    />
                    {ctrl.tool === 'annotate' && (
                        <StudioAnnotateSettingsPanel
                            title={ui.annotate}
                            highlightLabel={ui.annotateHighlight}
                            color={ctrl.annotateColor}
                            onColorChange={ctrl.setAnnotateColor}
                        />
                    )}
                </div>

                <div
                    ref={zoom.containerRef}
                    className="studio-edit-canvas-wrap custom-scrollbar"
                    onWheel={handleWheel}
                    style={{ flex: 1, overflow: 'auto', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', position: 'relative' }}
                >
                    <div style={{
                        // Provide enough space to keep it centered when zoom is small, but scrollable when big
                        minWidth: '100%',
                        minHeight: '100%',
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center',
                        padding: '40px' // Add some padding so we can scroll past edges
                    }}>
                        <div
                            className="studio-edit-canvas-surface"
                            style={{
                                width: canvasSize.width,
                                height: canvasSize.height,
                                position: 'relative',
                                transform: `scale(${zoom.zoomLevel})`,
                                transformOrigin: 'center center',
                                flexShrink: 0,
                                // These margins keep the flexing box aware of the transform size constraints
                                margin: `${Math.max(0, (scaledHeight - canvasSize.height) / 2)}px ${Math.max(0, (scaledWidth - canvasSize.width) / 2)}px`,
                            }}
                        >
                            <img
                                ref={imageRef}
                                src={ctrl.preview.page.thumbnailUrl}
                                alt={`Page ${ctrl.preview.page.pageIndex + 1}`}
                                className="studio-edit-page-image"
                                crossOrigin="anonymous"
                                draggable={false}
                                style={{ width: '100%', height: '100%', position: 'absolute', inset: 0 }}
                            />
                            <StudioPageEditor
                                page={ctrl.preview.page}
                                width={canvasSize.width}
                                height={canvasSize.height}
                                activeTool={ctrl.tool}
                                onActiveToolChange={ctrl.setTool}
                                textLayerSpans={ctrl.textLayerSpans}
                                isSelectMode={ctrl.isSelectMode}
                                setIsSelectMode={ctrl.setIsSelectMode}
                                textSelectionMode={ctrl.textSelectionMode}
                                onTextSelectionModeChange={ctrl.setTextSelectionMode}
                                annotateColor={ctrl.annotateColor}
                                elements={ctrl.elements}
                                onElementsChange={ctrl.setElements}
                                onPushHistory={ctrl.pushHistory}
                                selectedElementId={ctrl.selectedElementId}
                                onSelectedElementIdChange={ctrl.setSelectedElementId}
                                textEditor={ctrl.textEditor}
                                onTextEditorChange={ctrl.setTextEditor}
                                onInlineUiStateChange={ctrl.setInlineUiState}
                                onMessageChange={ctrl.setMessage}
                                onFinish={() => {
                                    if (ctrl.textEditor) ctrl.commitTextEditor();
                                    void ctrl.applyChanges();
                                }}
                                onDiscard={() => {
                                    if (ctrl.hasDirtyChanges && !window.confirm(ui.unsavedConfirm)) return;
                                    ctrl.navigate('/studio');
                                }}
                            />

                            {ctrl.selectedElementId && ctrl.textEditor?.id === ctrl.selectedElementId && ctrl.elements.find(e => e.id === ctrl.selectedElementId)?.type === 'text' && (
                                <DraggableFloatingMenu
                                    element={ctrl.elements.find(e => e.id === ctrl.selectedElementId)!}
                                    onUpdate={(patch) => ctrl.handleElementAction(ctrl.selectedElementId!, 'update', patch)}
                                    onDelete={() => ctrl.handleElementAction(ctrl.selectedElementId!, 'delete')}
                                    onDuplicate={() => ctrl.handleElementAction(ctrl.selectedElementId!, 'duplicate')}
                                    onActivateMove={() => {
                                        if (ctrl.textEditor) {
                                            ctrl.commitTextEditor();
                                        }
                                    }}
                                    onDeselect={() => {
                                        if (ctrl.textEditor) ctrl.commitTextEditor();
                                        ctrl.setSelectedElementId(null);
                                        ctrl.pushHistory(ctrl.elements);
                                    }}
                                />
                            )}
                        </div>
                    </div>
                </div>

                {ctrl.message && (
                    <div className="studio-edit-message-overlay">
                        <p className="studio-edit-message-text">{ctrl.message}</p>
                        <button type="button" className="studio-edit-message-close" onClick={() => ctrl.setMessage(null)}>
                            &times;
                        </button>
                    </div>
                )}
            </div>

            {typeof document !== 'undefined' && createPortal(
                <div className="studio-edit-bottom-save-wrap">
                    <button
                        type="button"
                        data-testid="studio-edit-save-btn"
                        className="studio-edit-btn-apply studio-edit-fixed-save-btn"
                        onClick={ctrl.tool === 'protect'
                            ? () => { void ctrl.protectAndReturnToStudio(ctrl.protectOptions); }
                            : ctrl.applyChanges}
                        disabled={ctrl.isApplying || (
                            ctrl.tool === 'protect'
                                ? (!protectPermissionsOnly && !protectUserPassword.trim())
                                : (ctrl.historyIndex === 0 && !ctrl.hasDirtyChanges)
                        )}
                    >
                        {ctrl.isApplying
                            ? (ctrl.tool === 'protect' ? 'Protecting...' : ui.saving)
                            : (ctrl.tool === 'protect' ? ui.protect : ui.save)}
                    </button>
                </div>,
                document.body
            )}

            <StudioSignComposerModal
                open={ctrl.isSignComposerOpen}
                ui={ui}
                onClose={() => ctrl.setSignComposerOpen(false)}
                onInsertText={ctrl.addTypedSignature}
                onInsertImage={ctrl.addImageSignature}
            />
        </section>
    );
}
