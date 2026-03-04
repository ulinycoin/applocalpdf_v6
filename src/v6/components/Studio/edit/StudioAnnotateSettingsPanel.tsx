interface StudioAnnotateSettingsPanelProps {
    title: string;
    highlightLabel: string;
    markerLabel: string;
    penLabel: string;
    penSizeLabel: string;
    customColorLabel: string;
    color: string;
    mode: 'highlight' | 'pen';
    strokeWidth: number;
    onColorChange: (color: string) => void;
    onModeChange: (mode: 'highlight' | 'pen') => void;
    onStrokeWidthChange: (width: number) => void;
}

const MARKER_COLORS = [
    '#b9f86a',
    '#fff176',
    '#ffb74d',
    '#ff8a65',
    '#ff80ab',
    '#80deea',
];

export function StudioAnnotateSettingsPanel({
    title,
    highlightLabel,
    markerLabel,
    penLabel,
    penSizeLabel,
    customColorLabel,
    color,
    mode,
    strokeWidth,
    onColorChange,
    onModeChange,
    onStrokeWidthChange,
}: StudioAnnotateSettingsPanelProps) {
    return (
        <div className="studio-annotate-quickbar-wrap">
            <div className="studio-annotate-quickbar">
                <span className="studio-annotate-quickbar-label">{title}</span>
                <span className="studio-annotate-quickbar-caption">{highlightLabel}</span>
                <div className="studio-annotate-mode-toggle" role="group" aria-label={title}>
                    <button
                        type="button"
                        className={`studio-annotate-mode-btn ${mode === 'highlight' ? 'active' : ''}`}
                        onClick={() => onModeChange('highlight')}
                    >
                        {markerLabel}
                    </button>
                    <button
                        type="button"
                        className={`studio-annotate-mode-btn ${mode === 'pen' ? 'active' : ''}`}
                        onClick={() => onModeChange('pen')}
                    >
                        {penLabel}
                    </button>
                </div>
                <div className="studio-annotate-quickbar-swatches">
                {MARKER_COLORS.map((preset) => (
                    <button
                        key={preset}
                        type="button"
                        onClick={() => onColorChange(preset)}
                        title={preset}
                        className={`studio-annotate-swatch ${color.toLowerCase() === preset.toLowerCase() ? 'active' : ''}`}
                        style={{ background: preset }}
                    />
                ))}
                </div>
                <label className="studio-annotate-quickbar-custom-color" title={color}>
                    <span>{customColorLabel}</span>
                    <input type="color" value={color} onChange={(event) => onColorChange(event.target.value)} />
                </label>
                {mode === 'pen' && (
                    <label className="studio-annotate-quickbar-custom-color">
                        <span>{penSizeLabel}</span>
                        <input
                            type="range"
                            min={1}
                            max={18}
                            step={1}
                            value={strokeWidth}
                            onChange={(event) => onStrokeWidthChange(Math.max(1, Math.min(18, Number(event.target.value) || 5)))}
                        />
                    </label>
                )}
            </div>
        </div>
    );
}
