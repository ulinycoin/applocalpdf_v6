import { useMemo, useRef } from 'react';
import { useStudioEditController } from './edit/use-studio-edit-controller';
import { StudioEditToolbar } from './edit/StudioEditToolbar';
import { LinearIcon } from '../icons/linear-icon';
import { detectStudioEditLocale, getStudioEditMessages } from './studio-edit-i18n';
import { StudioPageEditor } from './StudioPageEditor';
import { DraggableFloatingMenu } from './StudioDraggableFloatingMenu';
import { useStudioEditZoom } from './edit/use-studio-edit-zoom';

export function StudioEditWorkspace() {
    const locale = useMemo(() => detectStudioEditLocale(), []);
    const ui = useMemo(() => getStudioEditMessages(locale), [locale]);

    const ctrl = useStudioEditController(ui);
    const zoom = useStudioEditZoom(ctrl.runId || 'unknown', 1);
    const imageRef = useRef<HTMLImageElement | null>(null);

    const handleWheel = (e: React.WheelEvent) => {
        if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            zoom.zoomAtScreenPoint(e.clientX, e.clientY, e.deltaY > 0 ? 'out' : 'in', 'wheel');
        }
    };

    if (!ctrl.preview) {
        return (
            <section className="studio-edit-shell">
                <div className="studio-edit-empty">
                    <h2 className="studio-edit-empty-title">{ui.selectPageTitle}</h2>
                    <button type="button" className="studio-edit-back-btn" onClick={() => ctrl.navigate('/studio')}>
                        {ui.backToCanvas}
                    </button>
                </div>
            </section>
        );
    }

    // Calculation for canvas wrapper sizing
    const scaledWidth = 620 * zoom.zoomLevel;
    const scaledHeight = 840 * zoom.zoomLevel;

    return (
        <section className="studio-edit-shell" translate="no" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            {/* Header Area */}
            <div className="studio-edit-meta" style={{ padding: '8px 16px', background: 'rgba(15,23,42,0.4)', borderRadius: '0 0 12px 12px', marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', gap: 12, flex: 1, alignItems: 'center' }}>
                    <button type="button" className="studio-edit-back-btn" onClick={ctrl.clearEditSession} title={ui.backToCanvas} style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '4px' }}>
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

                    <span className="studio-edit-page-badge">{ui.page} {ctrl.preview.indexInDoc + 1}</span>
                    <span className="studio-edit-page-badge">{ctrl.preview.docName}</span>
                    {ctrl.hasDirtyChanges && <span className="studio-edit-page-badge studio-edit-message">{ui.dirty}</span>}
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
                        <button type="button" className="studio-floating-btn" style={{ width: 24, height: 24 }} onClick={() => zoom.fitToPage(620, 840)} title="Fit to Page">
                            <LinearIcon name="maximize" size={14} />
                        </button>
                        <button type="button" className="studio-floating-btn" style={{ width: 24, height: 24 }} onClick={() => zoom.fitToWidth(620)} title="Fit to Width">
                            <LinearIcon name="move-horizontal" size={14} />
                        </button>
                    </div>

                    <div style={{ width: 1, height: 24, background: 'rgba(255,255,255,0.1)' }} />

                    {ctrl.saveUndoStack.length > 0 && (
                        <button type="button" className="studio-edit-btn-cancel" onClick={ctrl.undoLastSave} disabled={ctrl.isApplying} title={ui.undoSave} style={{ padding: '6px 12px' }}>
                            {ui.undoSave}
                        </button>
                    )}
                    {ctrl.saveRedoStack.length > 0 && (
                        <button type="button" className="studio-edit-btn-cancel" onClick={ctrl.redoLastSave} disabled={ctrl.isApplying} title={ui.redoSave} style={{ padding: '6px 12px' }}>
                            {ui.redoSave}
                        </button>
                    )}

                    <label className="studio-edit-checkbox-label" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#94a3b8', background: 'rgba(0,0,0,0.2)', padding: '6px 10px', borderRadius: 6, cursor: 'pointer' }}>
                        <input type="checkbox" checked={ctrl.applyToSelection} onChange={(e) => ctrl.setApplyToSelection(e.target.checked)} disabled={!ctrl.canApplyToSelection} style={{ margin: 0, cursor: 'pointer' }} />
                        <span>{ui.saveSelection} ({ctrl.selectedPages.length})</span>
                    </label>

                    <button type="button" data-testid="studio-edit-save-btn" className="studio-edit-btn-apply" onClick={ctrl.applyChanges} disabled={ctrl.isApplying || (ctrl.historyIndex === 0 && !ctrl.hasDirtyChanges)} style={{ padding: '6px 16px' }}>
                        {ctrl.isApplying ? ui.saving : ui.save}
                    </button>
                </div>
            </div>

            {/* Main Workspace Area (Toolbar + Canvas) */}
            <div style={{ display: 'flex', flex: 1, overflow: 'hidden', position: 'relative' }}>
                <div style={{ padding: '0 16px', zIndex: 10 }}>
                    <StudioEditToolbar
                        ui={ui}
                        tool={ctrl.tool}
                        isSelectMode={ctrl.isSelectMode}
                        onSelectTool={ctrl.setTool}
                        onSetIsSelectMode={ctrl.setIsSelectMode}
                    />
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
                                width: 620,
                                height: 840,
                                position: 'relative',
                                transform: `scale(${zoom.zoomLevel})`,
                                transformOrigin: 'center center',
                                flexShrink: 0,
                                // These margins keep the flexing box aware of the transform size constraints
                                margin: `${Math.max(0, (scaledHeight - 840) / 2)}px ${Math.max(0, (scaledWidth - 620) / 2)}px`,
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
                                width={620}
                                height={840}
                                activeTool={ctrl.tool}
                                onActiveToolChange={ctrl.setTool}
                                textLayerSpans={ctrl.textLayerSpans}
                                isSelectMode={ctrl.isSelectMode}
                                setIsSelectMode={ctrl.setIsSelectMode}
                                textSelectionMode={ctrl.textSelectionMode}
                                onTextSelectionModeChange={ctrl.setTextSelectionMode}
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

                            {ctrl.selectedElementId && ctrl.elements.find(e => e.id === ctrl.selectedElementId) && (
                                <DraggableFloatingMenu
                                    element={ctrl.elements.find(e => e.id === ctrl.selectedElementId)!}
                                    onUpdate={(patch) => ctrl.handleElementAction(ctrl.selectedElementId!, 'update', patch)}
                                    onDelete={() => ctrl.handleElementAction(ctrl.selectedElementId!, 'delete')}
                                    onDuplicate={() => ctrl.handleElementAction(ctrl.selectedElementId!, 'duplicate')}
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
        </section>
    );
}
