import type { FormFieldElement } from '../editor-types';
import { LinearIcon } from '../../icons/linear-icon';

interface StudioFormsQuickBarProps {
    onAddField: (type: 'text' | 'multiline' | 'checkbox' | 'radio' | 'dropdown') => void;
    selectedField: FormFieldElement | null;
    onUpdateSelectedField: (patch: Partial<FormFieldElement>) => void;
    canvasWidth: number;
    canvasHeight: number;
    onDelete?: () => void;
    onDuplicate?: () => void;
}

const FIELD_TYPES: Array<{ type: 'text' | 'multiline' | 'checkbox' | 'radio' | 'dropdown'; label: string }> = [
    { type: 'text',      label: 'Text' },
    { type: 'multiline', label: 'Multi' },
    { type: 'checkbox',  label: 'Check' },
    { type: 'radio',     label: 'Radio' },
    { type: 'dropdown',  label: 'Select' },
];

export function StudioFormsQuickBar({
    onAddField,
    selectedField,
    onUpdateSelectedField,
    canvasWidth,
    canvasHeight,
    onDelete,
    onDuplicate,
}: StudioFormsQuickBarProps) {
    const pageWidthPx  = Math.max(1, Math.round(canvasWidth));
    const pageHeightPx = Math.max(1, Math.round(canvasHeight));
    const widthPx  = selectedField ? Math.max(1, Math.round(selectedField.w * pageWidthPx)) : 0;
    const heightPx = selectedField ? Math.max(1, Math.round(selectedField.h * pageHeightPx)) : 0;
    const dropdownOptions = selectedField?.formType === 'dropdown'
        ? (selectedField.options && selectedField.options.length > 0 ? selectedField.options : ['Option 1'])
        : [];

    return (
        <div className="ep">
            <div className="ep-section-title">Forms</div>

            {/* Add field buttons */}
            <div className="ep-field">
                <span className="ep-field-label">Add field</span>
                <div className="ep-seg ep-seg--wrap">
                    {FIELD_TYPES.map(({ type, label }) => (
                        <button
                            key={type}
                            type="button"
                            className="ep-seg-btn"
                            onClick={() => onAddField(type)}
                        >
                            {label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Selected field properties */}
            {selectedField && (
                <>
                    <div className="ep-section-title" style={{ marginTop: 4 }}>Selected field</div>

                    <div className="ep-field">
                        <span className="ep-field-label">Name</span>
                        <input
                            className="ep-input"
                            value={selectedField.name}
                            onChange={(e) => onUpdateSelectedField({ name: e.target.value })}
                            placeholder="field_name"
                        />
                    </div>

                    <div className="ep-row">
                        <div className="ep-field ep-field--grow">
                            <span className="ep-field-label">Width px</span>
                            <input
                                className="ep-input ep-input--num"
                                type="number"
                                min={12}
                                max={pageWidthPx}
                                value={widthPx}
                                onChange={(e) => {
                                    const raw = Number(e.target.value);
                                    if (!Number.isFinite(raw)) return;
                                    onUpdateSelectedField({ w: Math.max(0.02, Math.min(0.95, raw / pageWidthPx)) });
                                }}
                            />
                        </div>
                        <div className="ep-field ep-field--grow">
                            <span className="ep-field-label">Height px</span>
                            <input
                                className="ep-input ep-input--num"
                                type="number"
                                min={12}
                                max={Math.round(pageHeightPx * 0.6)}
                                value={heightPx}
                                onChange={(e) => {
                                    const raw = Number(e.target.value);
                                    if (!Number.isFinite(raw)) return;
                                    onUpdateSelectedField({ h: Math.max(0.02, Math.min(0.6, raw / pageHeightPx)) });
                                }}
                            />
                        </div>
                    </div>

                    {selectedField.formType === 'dropdown' && (
                        <>
                            <div className="ep-field">
                                <span className="ep-field-label">Options count</span>
                                <input
                                    className="ep-input ep-input--num"
                                    type="number"
                                    min={1} max={50}
                                    value={dropdownOptions.length || 1}
                                    onChange={(e) => {
                                        const count = Math.max(1, Math.min(50, Math.round(Number(e.target.value))));
                                        const nextOptions = Array.from({ length: count }, (_, i) =>
                                            selectedField.options?.[i] ?? `Option ${i + 1}`
                                        );
                                        onUpdateSelectedField({
                                            options: nextOptions,
                                            defaultValue: nextOptions.includes(selectedField.defaultValue)
                                                ? selectedField.defaultValue
                                                : (nextOptions[0] ?? ''),
                                        });
                                    }}
                                />
                            </div>
                            {dropdownOptions.map((opt, i) => (
                                <div key={i} className="ep-field">
                                    <span className="ep-field-label">Option {i + 1}</span>
                                    <input
                                        className="ep-input"
                                        value={opt}
                                        onChange={(e) => {
                                            const next = dropdownOptions.map((item, idx) => idx === i ? e.target.value : item);
                                            const sanitized = next.map((item, idx) => item.trim() || `Option ${idx + 1}`);
                                            onUpdateSelectedField({
                                                options: sanitized,
                                                defaultValue: sanitized.includes(selectedField.defaultValue)
                                                    ? selectedField.defaultValue
                                                    : (sanitized[0] ?? ''),
                                            });
                                        }}
                                    />
                                </div>
                            ))}
                        </>
                    )}
                </>
            )}

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
