import { useMemo, useRef } from 'react';
import { useStudioEditController } from './edit/use-studio-edit-controller';
import { StudioEditToolbar } from './edit/StudioEditToolbar';
import { StudioEditActionBar } from './edit/StudioEditActionBar';
import { LinearIcon } from '../icons/linear-icon';
import { detectStudioEditLocale, getStudioEditMessages } from './studio-edit-i18n';
import { StudioPageEditor } from './StudioPageEditor';
import { DraggableFloatingMenu } from './StudioDraggableFloatingMenu';

export function StudioEditWorkspace() {
    const locale = useMemo(() => detectStudioEditLocale(), []);
    const ui = useMemo(() => getStudioEditMessages(locale), [locale]);

    const ctrl = useStudioEditController(ui);
    const imageRef = useRef<HTMLImageElement | null>(null);

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

    return (
        <section className="studio-edit-shell">
            <div className="studio-edit-meta" style={{ padding: '8px 16px', background: 'rgba(15,23,42,0.4)', borderRadius: '0 0 12px 12px', marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', gap: 12, flex: 1, alignItems: 'center' }}>
                    <button type="button" className="studio-edit-back-btn" onClick={ctrl.clearEditSession} title={ui.backToCanvas} style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '4px' }}>
                        <LinearIcon name="chevron-left" size={18} />
                    </button>
                    <span className="studio-edit-page-badge">{ui.page} {ctrl.preview.indexInDoc + 1}</span>
                    <span className="studio-edit-page-badge">{ctrl.preview.docName}</span>
                    {ctrl.hasDirtyChanges && <span className="studio-edit-page-badge studio-edit-message">{ui.dirty}</span>}
                </div>

                <StudioEditToolbar
                    ui={ui}
                    tool={ctrl.tool}
                    isSelectMode={ctrl.isSelectMode}
                    onSelectTool={ctrl.setTool}
                    onSetIsSelectMode={ctrl.setIsSelectMode}
                />

                <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end', gap: '8px', alignItems: 'center' }}>
                    {ctrl.historyIndex > 0 && (
                        <button type="button" className="studio-edit-btn-cancel" onClick={ctrl.undo} disabled={ctrl.isApplying} title={ui.undo} style={{ padding: '6px 12px' }}>
                            {ui.undo}
                        </button>
                    )}
                    {ctrl.historyIndex < ctrl.history.length - 1 && (
                        <button type="button" className="studio-edit-btn-cancel" onClick={ctrl.redo} disabled={ctrl.isApplying} title={ui.redo} style={{ padding: '6px 12px' }}>
                            {ui.redo}
                        </button>
                    )}
                    <button type="button" className="studio-edit-btn-cancel" onClick={ctrl.clearEditSession} disabled={ctrl.isApplying} style={{ padding: '6px 16px' }}>
                        {ui.backToCanvas}
                    </button>
                    <button type="button" className="studio-edit-btn-apply" onClick={ctrl.applyChanges} disabled={ctrl.isApplying || (ctrl.historyIndex === 0 && !ctrl.hasDirtyChanges)} style={{ padding: '6px 16px' }}>
                        {ctrl.isApplying ? ui.saving : ui.save}
                    </button>
                </div>
            </div>

            <div className="studio-edit-canvas-wrap" style={{ overflow: 'auto', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: '24px 0', position: 'relative' }}>
                <div
                    className="studio-edit-canvas-surface"
                    style={{ width: 620, height: 840, position: 'relative', transform: `scale(${ctrl.zoomLevel})`, transformOrigin: 'top center', transition: 'transform 0.2s ease', marginBottom: `${(Math.max(1, ctrl.zoomLevel) - 1) * 840}px`, flexShrink: 0 }}
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
                {ctrl.message && (
                    <div className="studio-edit-message-overlay">
                        <p className="studio-edit-message-text">{ctrl.message}</p>
                        <button type="button" className="studio-edit-message-close" onClick={() => ctrl.setMessage(null)}>
                            &times;
                        </button>
                    </div>
                )}
            </div>

            <StudioEditActionBar
                ui={ui}
                navigate={ctrl.navigate}
                zoomLevel={ctrl.zoomLevel}
                setZoomLevel={ctrl.setZoomLevel}
                saveUndoStack={ctrl.saveUndoStack}
                saveRedoStack={ctrl.saveRedoStack}
                undoLastSave={ctrl.undoLastSave}
                redoLastSave={ctrl.redoLastSave}
                isApplying={ctrl.isApplying}
                applyToSelection={ctrl.applyToSelection}
                setApplyToSelection={ctrl.setApplyToSelection}
                canApplyToSelection={ctrl.canApplyToSelection}
                selectedPagesCount={ctrl.selectedPages.length}
                applyChanges={ctrl.applyChanges}
                historyIndex={ctrl.historyIndex}
                hasDirtyChanges={ctrl.hasDirtyChanges}
            />
        </section >
    );
}
