import { LinearIcon } from '../../icons/linear-icon';

interface StudioWhiteoutSettingsPanelProps {
    title: string;
    customColorLabel: string;
    color: string;
    onColorChange: (color: string) => void;
    onDelete?: () => void;
    onDuplicate?: () => void;
}

const WHITEOUT_PRESETS = [
    '#ffffff',
    '#f8f9fa',
    '#f1f3f5',
    '#fff8e1',
    '#fef3c7',
    '#000000',
];

export function StudioWhiteoutSettingsPanel({
    color = '#ffffff',
    onColorChange,
    onDelete,
    onDuplicate,
}: StudioWhiteoutSettingsPanelProps) {
    return (
        <div className="ep">
            <div className="ep-section-title">Whiteout</div>

            <div className="ep-section-title" style={{ marginTop: 4 }}>Color</div>
            <div className="ep-swatches">
                {WHITEOUT_PRESETS.map((c) => (
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

            <label className="ep-color-row">
                <div className="ep-color-preview" style={{ background: color }}>
                    <input type="color" value={color} onChange={(e) => onColorChange(e.target.value)} />
                </div>
                <span className="ep-color-value">{color}</span>
                <span className="ep-color-name">Custom</span>
            </label>

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
