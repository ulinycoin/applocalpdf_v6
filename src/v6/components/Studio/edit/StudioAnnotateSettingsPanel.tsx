import { LinearIcon } from '../../icons/linear-icon';
import type { ShapePreset } from '../editor-types';

interface StudioAnnotateSettingsPanelProps {
    title: string;
    highlightLabel: string;
    markerLabel: string;
    penLabel: string;
    shapesLabel: string;
    shapeLabel: string;
    lineLabel: string;
    arrowLabel: string;
    shapeThicknessLabel: string;
    penSizeLabel: string;
    customColorLabel: string;
    color: string;
    mode: 'highlight' | 'pen' | 'shapes';
    shapePreset: ShapePreset;
    strokeWidth: number;
    onColorChange: (color: string) => void;
    onModeChange: (mode: 'highlight' | 'pen' | 'shapes') => void;
    onShapePresetChange: (preset: ShapePreset) => void;
    onStrokeWidthChange: (width: number) => void;
    onInsertPen?: () => void;
    onClearPen?: () => void;
    hasPendingPenDraft?: boolean;
    onDelete?: () => void;
    onDuplicate?: () => void;
}

const MARKER_COLORS = ['#b9f86a', '#fff176', '#ffb74d', '#ff8a65', '#ff80ab', '#80deea'];

export function StudioAnnotateSettingsPanel({
    mode,
    shapePreset,
    strokeWidth,
    color,
    onColorChange,
    onModeChange,
    onShapePresetChange,
    onStrokeWidthChange,
    onInsertPen,
    onClearPen,
    hasPendingPenDraft = false,
    onDelete,
    onDuplicate,
}: StudioAnnotateSettingsPanelProps) {
    return (
        <div className="ep">
            <div className="ep-section-title">Annotate</div>

            {/* Mode toggle */}
            <div className="ep-seg">
                {(['highlight', 'pen', 'shapes'] as const).map((m) => (
                    <button
                        key={m}
                        type="button"
                        className={`ep-seg-btn${mode === m ? ' ep-seg-btn--on' : ''}`}
                        onClick={() => onModeChange(m)}
                    >
                        {m === 'highlight' ? 'Marker' : m === 'pen' ? 'Pen' : 'Shapes'}
                    </button>
                ))}
            </div>

            {/* Shape presets */}
            {mode === 'shapes' && (
                <div className="ep-seg">
                    {(['rectangle', 'line', 'arrow'] as const).map((p) => (
                        <button
                            key={p}
                            type="button"
                            className={`ep-seg-btn${shapePreset === p ? ' ep-seg-btn--on' : ''}`}
                            onClick={() => onShapePresetChange(p)}
                        >
                            {p.charAt(0).toUpperCase() + p.slice(1)}
                        </button>
                    ))}
                </div>
            )}

            {/* Color swatches */}
            {mode === 'highlight' && (
                <>
                    <div className="ep-section-title" style={{ marginTop: 4 }}>Color</div>
                    <div className="ep-swatches">
                        {MARKER_COLORS.map((c) => (
                            <button
                                key={c}
                                type="button"
                                className={`ep-swatch${color.toLowerCase() === c.toLowerCase() ? ' ep-swatch--on' : ''}`}
                                style={{ background: c }}
                                onClick={() => onColorChange(c)}
                                title={c}
                            />
                        ))}
                    </div>
                </>
            )}

            {/* Custom color */}
            <label className="ep-color-row">
                <div className="ep-color-preview" style={{ background: color }}>
                    <input type="color" value={color} onChange={(e) => onColorChange(e.target.value)} />
                </div>
                <span className="ep-color-value">{color}</span>
                <span className="ep-color-name">Custom</span>
            </label>

            {/* Stroke width for pen/shapes */}
            {(mode === 'pen' || mode === 'shapes') && (
                <div className="ep-field">
                    <span className="ep-field-label">
                        {mode === 'pen' ? 'Pen size' : 'Thickness'}
                    </span>
                    <div className="ep-row" style={{ gap: 8 }}>
                        <input
                            type="range"
                            min={1} max={18} step={1}
                            value={strokeWidth}
                            onChange={(e) => onStrokeWidthChange(Math.max(1, Math.min(18, Number(e.target.value) || 5)))}
                            className="ep-range"
                        />
                        <span className="ep-range-val">{strokeWidth}</span>
                    </div>
                </div>
            )}

            {/* Pen actions */}
            {mode === 'pen' && (
                <div className="ep-row" style={{ marginTop: 4 }}>
                    <button
                        type="button"
                        className="ep-action-btn ep-action-btn--primary"
                        onClick={onInsertPen}
                        disabled={!hasPendingPenDraft}
                        style={{ flex: 1 }}
                    >
                        Insert
                    </button>
                    <button
                        type="button"
                        className="ep-action-btn"
                        onClick={onClearPen}
                        disabled={!hasPendingPenDraft}
                        style={{ flex: 1 }}
                    >
                        Clear
                    </button>
                </div>
            )}

            {/* Element actions */}
            {(onDuplicate || onDelete) && (
                <div className="ep-actions">
                    {onDuplicate && (
                        <button type="button" className="ep-action-btn" onClick={onDuplicate}>
                            <LinearIcon name="copy" size={12} /> Duplicate
                        </button>
                    )}
                    {onDelete && (
                        <button type="button" className="ep-action-btn ep-action-btn--danger" onClick={onDelete}>
                            <LinearIcon name="x" size={12} /> Delete
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}
