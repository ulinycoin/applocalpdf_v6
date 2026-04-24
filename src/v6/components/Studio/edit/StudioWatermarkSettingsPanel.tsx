import type { FontFamilyId } from '../inline-text-utils';

interface WatermarkOptions {
    text: string;
    color: string;
    fontSize: number;
    fontFamily: FontFamilyId;
    fontWeight: 'normal' | 'bold';
    fontStyle: 'normal' | 'italic';
    opacity: number;
    rotation: number;
    repeatEnabled: boolean;
    repeatCols: number;
    repeatRows: number;
    repeatGapX: number;
    repeatGapY: number;
}

interface StudioWatermarkSettingsPanelProps {
    options: WatermarkOptions;
    onOptionsChange: (next: WatermarkOptions) => void;
}

export function StudioWatermarkSettingsPanel({ options, onOptionsChange }: StudioWatermarkSettingsPanelProps) {
    const set = <K extends keyof WatermarkOptions>(key: K, value: WatermarkOptions[K]) =>
        onOptionsChange({ ...options, [key]: value });

    return (
        <div className="ep">
            <div className="ep-section-title">Watermark</div>

            {/* Text */}
            <div className="ep-field">
                <span className="ep-field-label">Text</span>
                <input
                    type="text"
                    value={options.text}
                    onChange={(e) => set('text', e.target.value)}
                    placeholder="CONFIDENTIAL"
                    className="ep-input"
                />
            </div>

            {/* Font */}
            <div className="ep-field">
                <span className="ep-field-label">Font</span>
                <select
                    className="ep-select"
                    value={options.fontFamily}
                    onChange={(e) => set('fontFamily', e.target.value as FontFamilyId)}
                >
                    <option value="sora">Helvetica</option>
                    <option value="times">Times</option>
                    <option value="mono">Courier</option>
                    <option value="roboto">Roboto</option>
                    <option value="noto">Noto Sans</option>
                    <option value="noto-arabic">Noto Arabic</option>
                    <option value="noto-cjk">Noto CJK</option>
                    <option value="noto-devanagari">Noto Devanagari</option>
                </select>
            </div>

            {/* Size + Bold + Italic */}
            <div className="ep-row">
                <div className="ep-field ep-field--grow">
                    <span className="ep-field-label">Size</span>
                    <input
                        type="number"
                        min={8} max={120}
                        value={options.fontSize}
                        onChange={(e) => set('fontSize', Math.max(8, Math.min(120, Number(e.target.value) || 30)))}
                        className="ep-input ep-input--num"
                    />
                </div>
                <button
                    type="button"
                    className={`ep-fmt-btn${options.fontWeight === 'bold' ? ' ep-fmt-btn--on' : ''}`}
                    onClick={() => set('fontWeight', options.fontWeight === 'bold' ? 'normal' : 'bold')}
                >
                    <b>B</b>
                </button>
                <button
                    type="button"
                    className={`ep-fmt-btn${options.fontStyle === 'italic' ? ' ep-fmt-btn--on' : ''}`}
                    onClick={() => set('fontStyle', options.fontStyle === 'italic' ? 'normal' : 'italic')}
                >
                    <i>I</i>
                </button>
            </div>

            <div className="ep-section-title" style={{ marginTop: 4 }}>Appearance</div>

            {/* Opacity + Rotation */}
            <div className="ep-row">
                <div className="ep-field ep-field--grow">
                    <span className="ep-field-label">Opacity</span>
                    <input
                        type="number"
                        min={0.05} max={1} step={0.05}
                        value={options.opacity}
                        onChange={(e) => set('opacity', Math.max(0.05, Math.min(1, Number(e.target.value) || 0.25)))}
                        className="ep-input ep-input--num"
                    />
                </div>
                <div className="ep-field ep-field--grow">
                    <span className="ep-field-label">Rotation°</span>
                    <input
                        type="number"
                        min={-180} max={180}
                        value={options.rotation}
                        onChange={(e) => set('rotation', Math.max(-180, Math.min(180, Number(e.target.value) || 0)))}
                        className="ep-input ep-input--num"
                    />
                </div>
            </div>

            {/* Color */}
            <label className="ep-color-row">
                <div className="ep-color-preview" style={{ background: options.color }}>
                    <input type="color" value={options.color} onChange={(e) => set('color', e.target.value)} />
                </div>
                <span className="ep-color-value">{options.color}</span>
                <span className="ep-color-name">Color</span>
            </label>

            {/* Repeat */}
            <div className="ep-field">
                <span className="ep-field-label">Repeat</span>
                <div className="ep-seg">
                    <button
                        type="button"
                        className={`ep-seg-btn${options.repeatEnabled ? ' ep-seg-btn--on' : ''}`}
                        onClick={() => set('repeatEnabled', true)}
                    >On</button>
                    <button
                        type="button"
                        className={`ep-seg-btn${!options.repeatEnabled ? ' ep-seg-btn--on' : ''}`}
                        onClick={() => set('repeatEnabled', false)}
                    >Off</button>
                </div>
            </div>
        </div>
    );
}
