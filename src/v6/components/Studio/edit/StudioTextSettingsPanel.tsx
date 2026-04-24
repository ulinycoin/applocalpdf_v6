import { FontFamilyId, clamp } from '../inline-text-utils';
import { LinearIcon } from '../../icons/linear-icon';

interface StudioTextSettingsPanelProps {
    title: string;
    fontFamilyLabel: string;
    fontSizeLabel: string;
    textColorLabel: string;
    bgColorLabel: string;
    fontFamily: FontFamilyId;
    fontSize: number;
    fontWeight: 'normal' | 'bold';
    fontStyle: 'normal' | 'italic';
    lineHeight: number;
    letterSpacing: number;
    color: string;
    backgroundColor: string;
    onStyleChange: (style: {
        fontFamily?: FontFamilyId;
        fontSize?: number;
        fontWeight?: 'normal' | 'bold';
        fontStyle?: 'normal' | 'italic';
        lineHeight?: number;
        letterSpacing?: number;
        color?: string;
        backgroundColor?: string;
    }) => void;
    onDelete?: () => void;
    onDuplicate?: () => void;
}

function ColorSwatch({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
    return (
        <label className="ep-color-row">
            <div className="ep-color-preview" style={{ background: value }}>
                <input
                    type="color"
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                />
            </div>
            <span className="ep-color-value">{value}</span>
            <span className="ep-color-name">{label}</span>
        </label>
    );
}

export function StudioTextSettingsPanel({
    fontFamily,
    fontSize,
    fontWeight,
    fontStyle,
    lineHeight,
    letterSpacing,
    color,
    backgroundColor,
    onStyleChange,
    onDelete,
    onDuplicate,
}: StudioTextSettingsPanelProps) {
    return (
        <div className="ep">

            {/* Section: Typography */}
            <div className="ep-section-title">Typography</div>

            {/* Font family */}
            <select
                className="ep-select"
                value={fontFamily}
                onChange={(e) => onStyleChange({ fontFamily: e.target.value as FontFamilyId })}
            >
                <option value="roboto">Roboto</option>
                <option value="noto">Noto Sans</option>
                <option value="noto-arabic">Noto Arabic</option>
                <option value="noto-cjk">Noto CJK</option>
                <option value="noto-devanagari">Noto Devanagari</option>
                <option value="sora">Helvetica</option>
                <option value="times">Times New Roman</option>
                <option value="mono">Courier</option>
            </select>

            {/* Size + Bold + Italic in one row */}
            <div className="ep-row">
                <div className="ep-field ep-field--grow">
                    <span className="ep-field-label">Size</span>
                    <input
                        type="number"
                        min={8}
                        max={96}
                        value={fontSize}
                        onChange={(e) => onStyleChange({ fontSize: clamp(Number(e.target.value) || 16, 8, 96) })}
                        className="ep-input ep-input--num"
                    />
                </div>
                <button
                    type="button"
                    className={`ep-fmt-btn${fontWeight === 'bold' ? ' ep-fmt-btn--on' : ''}`}
                    onClick={() => onStyleChange({ fontWeight: fontWeight === 'bold' ? 'normal' : 'bold' })}
                    title="Bold"
                >
                    <b>B</b>
                </button>
                <button
                    type="button"
                    className={`ep-fmt-btn${fontStyle === 'italic' ? ' ep-fmt-btn--on' : ''}`}
                    onClick={() => onStyleChange({ fontStyle: fontStyle === 'italic' ? 'normal' : 'italic' })}
                    title="Italic"
                >
                    <i>I</i>
                </button>
            </div>

            {/* Spacing */}
            <div className="ep-section-title" style={{ marginTop: 4 }}>Spacing</div>
            <div className="ep-row">
                <div className="ep-field ep-field--grow" title="Line height">
                    <span className="ep-field-label">
                        <LinearIcon name="move-vertical" size={11} />
                        Line
                    </span>
                    <input
                        type="number"
                        min={0.8} max={3} step={0.1}
                        value={lineHeight}
                        onChange={(e) => onStyleChange({ lineHeight: Number(e.target.value) || 1.2 })}
                        className="ep-input ep-input--num"
                    />
                </div>
                <div className="ep-field ep-field--grow" title="Letter spacing">
                    <span className="ep-field-label">
                        <LinearIcon name="move-horizontal" size={11} />
                        Letter
                    </span>
                    <input
                        type="number"
                        min={-2} max={10} step={0.5}
                        value={letterSpacing}
                        onChange={(e) => onStyleChange({ letterSpacing: Number(e.target.value) || 0 })}
                        className="ep-input ep-input--num"
                    />
                </div>
            </div>

            {/* Colors */}
            <div className="ep-section-title" style={{ marginTop: 4 }}>Color</div>
            <div className="ep-colors">
                <ColorSwatch label="Text" value={color} onChange={(v) => onStyleChange({ color: v })} />
                <ColorSwatch label="BG" value={backgroundColor} onChange={(v) => onStyleChange({ backgroundColor: v })} />
            </div>

            {/* Actions */}
            {(onDuplicate || onDelete) && (
                <div className="ep-actions">
                    {onDuplicate && (
                        <button type="button" className="ep-action-btn" onClick={onDuplicate}>
                            <LinearIcon name="copy" size={12} />
                            Duplicate
                        </button>
                    )}
                    {onDelete && (
                        <button type="button" className="ep-action-btn ep-action-btn--danger" onClick={onDelete}>
                            <LinearIcon name="x" size={12} />
                            Delete
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}
