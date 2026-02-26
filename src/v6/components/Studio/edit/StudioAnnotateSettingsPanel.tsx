interface StudioAnnotateSettingsPanelProps {
    title: string;
    highlightLabel: string;
    color: string;
    onColorChange: (color: string) => void;
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
    color,
    onColorChange,
}: StudioAnnotateSettingsPanelProps) {
    return (
        <div style={{
            marginTop: 12,
            width: 96,
            borderRadius: 12,
            background: 'rgba(15, 23, 42, 0.86)',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.35)',
            padding: 10,
            pointerEvents: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
        }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.3, color: 'rgba(226,232,240,0.9)' }}>
                {title}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 6 }}>
                {MARKER_COLORS.map((preset) => (
                    <button
                        key={preset}
                        type="button"
                        onClick={() => onColorChange(preset)}
                        title={preset}
                        style={{
                            width: 34,
                            height: 24,
                            borderRadius: 6,
                            border: color === preset ? '2px solid #e2e8f0' : '1px solid rgba(255,255,255,0.2)',
                            background: preset,
                            cursor: 'pointer',
                        }}
                    />
                ))}
            </div>
        </div>
    );
}
