import { useRef, type ChangeEvent } from 'react';
import { LinearIcon } from '../../icons/linear-icon';

interface StudioSignSettingsPanelProps {
    title: string;
    mode: 'type' | 'draw';
    typedValue: string;
    typedFontSize: number;
    drawColor: string;
    drawStrokeWidth: number;
    onModeChange: (mode: 'type' | 'draw') => void;
    onTypedValueChange: (value: string) => void;
    onTypedFontSizeChange: (size: number) => void;
    onDrawColorChange: (color: string) => void;
    onDrawStrokeWidthChange: (size: number) => void;
    onInsertTyped: () => void;
    onInsertDrawn: () => void;
    onClearDrawn: () => void;
    onUploadImage: (payload: { dataUrl: string; width: number; height: number }) => void;
    hasPendingDrawnSignature?: boolean;
    onDelete?: () => void;
    onDuplicate?: () => void;
}

function readFileAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsDataURL(file);
    });
}

function loadImageDimensions(dataUrl: string): Promise<{ width: number; height: number }> {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve({ width: image.naturalWidth || image.width, height: image.naturalHeight || image.height });
        image.onerror = () => reject(new Error('Failed to decode image'));
        image.src = dataUrl;
    });
}

export function StudioSignSettingsPanel({
    mode,
    typedValue,
    typedFontSize,
    drawColor,
    drawStrokeWidth,
    onModeChange,
    onTypedValueChange,
    onTypedFontSizeChange,
    onDrawColorChange,
    onDrawStrokeWidthChange,
    onInsertTyped,
    onInsertDrawn,
    onClearDrawn,
    onUploadImage,
    hasPendingDrawnSignature = false,
    onDelete,
    onDuplicate,
}: StudioSignSettingsPanelProps) {
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    const onUploadChange = async (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;
        try {
            const dataUrl = await readFileAsDataUrl(file);
            if (!dataUrl.startsWith('data:image/')) return;
            const dims = await loadImageDimensions(dataUrl);
            onUploadImage({ dataUrl, width: dims.width, height: dims.height });
        } catch {
            // ignore
        }
    };

    return (
        <div className="ep">
            <div className="ep-section-title">Sign</div>

            {/* Mode */}
            <div className="ep-seg">
                <button
                    type="button"
                    className={`ep-seg-btn${mode === 'type' ? ' ep-seg-btn--on' : ''}`}
                    onClick={() => onModeChange('type')}
                >Type</button>
                <button
                    type="button"
                    className={`ep-seg-btn${mode === 'draw' ? ' ep-seg-btn--on' : ''}`}
                    onClick={() => onModeChange('draw')}
                >Draw</button>
            </div>

            {mode === 'type' ? (
                <>
                    {/* Typed signature text */}
                    <div className="ep-field">
                        <span className="ep-field-label">Signature text</span>
                        <input
                            type="text"
                            value={typedValue}
                            onChange={(e) => onTypedValueChange(e.target.value)}
                            placeholder="Your name"
                            className="ep-input"
                        />
                    </div>

                    {/* Size */}
                    <div className="ep-row">
                        <div className="ep-field ep-field--grow">
                            <span className="ep-field-label">Size</span>
                            <input
                                type="number"
                                min={12} max={96}
                                value={typedFontSize}
                                onChange={(e) => onTypedFontSizeChange(Math.max(12, Math.min(96, Number(e.target.value) || 30)))}
                                className="ep-input ep-input--num"
                            />
                        </div>
                    </div>

                    <button
                        type="button"
                        className="ep-action-btn ep-action-btn--primary"
                        onClick={onInsertTyped}
                        style={{ marginTop: 4 }}
                    >
                        Insert signature
                    </button>
                </>
            ) : (
                <>
                    {/* Draw color */}
                    <label className="ep-color-row">
                        <div className="ep-color-preview" style={{ background: drawColor }}>
                            <input type="color" value={drawColor} onChange={(e) => onDrawColorChange(e.target.value)} />
                        </div>
                        <span className="ep-color-value">{drawColor}</span>
                        <span className="ep-color-name">Color</span>
                    </label>

                    {/* Stroke width */}
                    <div className="ep-field">
                        <span className="ep-field-label">Pen size</span>
                        <div className="ep-row" style={{ gap: 8 }}>
                            <input
                                type="range"
                                min={1} max={12} step={1}
                                value={drawStrokeWidth}
                                onChange={(e) => onDrawStrokeWidthChange(Math.max(1, Math.min(12, Number(e.target.value) || 3)))}
                                className="ep-range"
                            />
                            <span className="ep-range-val">{drawStrokeWidth}</span>
                        </div>
                    </div>

                    <p style={{ fontSize: 11, color: 'var(--text-dim)', margin: 0 }}>Draw directly on the page</p>

                    <div className="ep-row" style={{ marginTop: 4 }}>
                        <button
                            type="button"
                            className="ep-action-btn ep-action-btn--primary"
                            onClick={onInsertDrawn}
                            disabled={!hasPendingDrawnSignature}
                            style={{ flex: 1 }}
                        >Insert</button>
                        <button
                            type="button"
                            className="ep-action-btn"
                            onClick={onClearDrawn}
                            disabled={!hasPendingDrawnSignature}
                            style={{ flex: 1 }}
                        >Clear</button>
                    </div>
                </>
            )}

            {/* Upload image */}
            <button
                type="button"
                className="ep-action-btn"
                onClick={() => fileInputRef.current?.click()}
            >
                <LinearIcon name="upload" size={12} />
                Upload image
            </button>

            <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                style={{ display: 'none' }}
                aria-hidden="true"
                tabIndex={-1}
                onChange={onUploadChange}
            />

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
