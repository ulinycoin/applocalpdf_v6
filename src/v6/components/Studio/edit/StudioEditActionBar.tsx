import type React from 'react';
import { LinearIcon } from '../../icons/linear-icon';

interface StudioEditActionBarProps {
    ui: any;
    zoomLevel: number;
    setZoomLevel: (value: React.SetStateAction<number>) => void;
    saveUndoStack: any[];
    saveRedoStack: any[];
    undoLastSave: () => void;
    redoLastSave: () => void;
    isApplying: boolean;
    applyToSelection: boolean;
    setApplyToSelection: (val: boolean) => void;
    canApplyToSelection: boolean;
    selectedPagesCount: number;
    applyChanges: () => void;
    historyIndex: number;
    hasDirtyChanges: boolean;
    navigate: (path: string) => void;
}

export function StudioEditActionBar({
    ui, zoomLevel, setZoomLevel, saveUndoStack, saveRedoStack, undoLastSave, redoLastSave,
    isApplying, applyToSelection, setApplyToSelection, canApplyToSelection, selectedPagesCount,
    applyChanges, historyIndex, hasDirtyChanges, navigate
}: StudioEditActionBarProps) {
    return (
        <footer className="studio-edit-action-bar">
            <button type="button" className="studio-edit-btn-cancel" onClick={() => navigate('/studio')}>
                {ui.backToCanvas}
            </button>
            <div className="studio-edit-zoom-controls" style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(0,0,0,0.2)', padding: '4px 8px', borderRadius: 8 }}>
                <button type="button" className="studio-floating-btn" style={{ width: 28, height: 28 }} onClick={() => setZoomLevel(prev => Math.max(0.5, prev - 0.25))} title="Zoom Out">
                    <LinearIcon name="minus" size={16} />
                </button>
                <span style={{ fontSize: 13, minWidth: 44, textAlign: 'center', color: 'rgba(255,255,255,0.9)' }}>{Math.round(zoomLevel * 100)}%</span>
                <button type="button" className="studio-floating-btn" style={{ width: 28, height: 28 }} onClick={() => setZoomLevel(prev => Math.min(3, prev + 0.25))} title="Zoom In">
                    <LinearIcon name="plus" size={16} />
                </button>
            </div>
            <div className="studio-edit-action-group">
                {saveUndoStack.length > 0 && (
                    <button
                        type="button"
                        className="studio-edit-btn-cancel"
                        onClick={undoLastSave}
                        disabled={isApplying}
                        data-testid="studio-edit-undo-save-btn"
                        aria-label={ui.undoSave}
                    >
                        {ui.undoSave}
                    </button>
                )}
                {saveRedoStack.length > 0 && (
                    <button
                        type="button"
                        className="studio-edit-btn-cancel"
                        onClick={redoLastSave}
                        disabled={isApplying}
                        data-testid="studio-edit-redo-save-btn"
                        aria-label={ui.redoSave}
                    >
                        {ui.redoSave}
                    </button>
                )}
                <label className="studio-edit-checkbox-label">
                    <input
                        type="checkbox"
                        checked={applyToSelection}
                        onChange={(e) => setApplyToSelection(e.target.checked)}
                        disabled={!canApplyToSelection}
                    />
                    <span>{ui.saveSelection} ({selectedPagesCount})</span>
                </label>
                <button
                    type="button"
                    className="studio-edit-btn-apply"
                    data-testid="studio-edit-save-btn"
                    onClick={applyChanges}
                    disabled={isApplying || (historyIndex === 0 && !hasDirtyChanges)}
                >
                    {isApplying ? ui.saving : ui.save}
                </button>
            </div>
        </footer>
    );
}
