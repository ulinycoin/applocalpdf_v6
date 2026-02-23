import { useState, useEffect, useRef } from 'react';
import { LinearIcon } from '../icons/linear-icon';
import { clamp, type FontFamilyId } from './inline-text-utils';
import { EditElement, TextElement, TextAlignId } from './editor-types';

interface StudioFloatingMenuProps {
    element: EditElement;
    onUpdate: (patch: Partial<EditElement>) => void;
    onDelete: () => void;
    onDuplicate: () => void;
}

export function StudioFloatingMenu({ element, onUpdate, onDelete, onDuplicate }: StudioFloatingMenuProps) {
    if (element.type !== 'text') {
        return (
            <div className="studio-floating-menu non-text">
                <button type="button" className="studio-floating-btn" onClick={onDuplicate} title="Duplicate">
                    <LinearIcon name="word" />
                </button>
                <button type="button" className="studio-floating-btn delete" onClick={onDelete} title="Delete">
                    <LinearIcon name="x" />
                </button>
            </div>
        );
    }

    const textElem = element as TextElement;

    const [offset, setOffset] = useState({ x: 0, y: 0 });
    const isDraggingRef = useRef(false);
    const startPosRef = useRef({ x: 0, y: 0 });

    useEffect(() => {
        const onPointerMove = (e: PointerEvent) => {
            if (!isDraggingRef.current) return;
            setOffset(prev => ({
                x: prev.x + (e.clientX - startPosRef.current.x),
                y: prev.y + (e.clientY - startPosRef.current.y)
            }));
            startPosRef.current = { x: e.clientX, y: e.clientY };
        };
        const onPointerUp = () => {
            isDraggingRef.current = false;
        };
        window.addEventListener('pointermove', onPointerMove);
        window.addEventListener('pointerup', onPointerUp);
        return () => {
            window.removeEventListener('pointermove', onPointerMove);
            window.removeEventListener('pointerup', onPointerUp);
        };
    }, []);

    const handleDragStart = (e: React.PointerEvent) => {
        e.stopPropagation();
        isDraggingRef.current = true;
        startPosRef.current = { x: e.clientX, y: e.clientY };
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
    };

    return (
        <div
            className="studio-floating-menu"
            onPointerDown={(e) => e.stopPropagation()}
            style={{ transform: `translate(${offset.x}px, ${offset.y}px)` }}
        >
            <div
                className="studio-floating-drag-handle"
                onPointerDown={handleDragStart}
                title="Drag menu"
            >
                <LinearIcon name="menu" size={16} />
            </div>
            <div className="studio-floating-divider" />

            <div className="studio-floating-group">
                <button
                    type="button"
                    className={`studio-floating-btn ${textElem.fontWeight === 'bold' ? 'active' : ''}`}
                    onClick={() => onUpdate({ fontWeight: textElem.fontWeight === 'bold' ? 'normal' : 'bold' })}
                    title="Bold"
                >
                    <LinearIcon name="bold" size={16} />
                </button>
                <button
                    type="button"
                    className={`studio-floating-btn ${textElem.fontStyle === 'italic' ? 'active' : ''}`}
                    onClick={() => onUpdate({ fontStyle: textElem.fontStyle === 'italic' ? 'normal' : 'italic' })}
                    title="Italic"
                >
                    <LinearIcon name="italic" size={16} />
                </button>
            </div>

            <div className="studio-floating-divider" />

            <div className="studio-floating-group">
                <select
                    className="studio-floating-select font-family"
                    aria-label="Font family"
                    title="Font family"
                    value={textElem.fontFamily}
                    onChange={(e) => onUpdate({ fontFamily: e.target.value as FontFamilyId })}
                >
                    <option value="roboto" style={{ fontWeight: 600 }}>Roboto (Кириллица+)</option>
                    <option value="sora">Helvetica</option>
                    <option value="times">Times New Roman</option>
                    <option value="mono">Courier</option>
                </select>
                <div className="studio-floating-input-wrap" title="Font size">
                    <input
                        type="number"
                        className="studio-floating-input"
                        value={textElem.fontSize}
                        min={8}
                        max={96}
                        step={0.1}
                        onChange={(e) => onUpdate({ fontSize: clamp(Number(e.target.value) || 16, 8, 96) })}
                    />
                </div>
                <div className="studio-floating-input-wrap" title="Line height">
                    <input
                        type="number"
                        data-testid="studio-floating-line-height"
                        className="studio-floating-input"
                        value={textElem.lineHeight}
                        min={0.8}
                        max={3}
                        step={0.05}
                        onChange={(e) => onUpdate({ lineHeight: clamp(Number(e.target.value) || 1.2, 0.8, 3) })}
                    />
                </div>
                <div className="studio-floating-input-wrap" title="Letter spacing">
                    <input
                        type="number"
                        data-testid="studio-floating-letter-spacing"
                        className="studio-floating-input"
                        value={textElem.letterSpacing}
                        min={-2}
                        max={20}
                        step={0.2}
                        onChange={(e) => onUpdate({ letterSpacing: clamp(Number(e.target.value) || 0, -2, 20) })}
                    />
                </div>
            </div>

            <div className="studio-floating-divider" />

            <div className="studio-floating-group">
                <div className="studio-floating-color-wrap" title="Text color">
                    <input
                        type="color"
                        className="studio-floating-color"
                        value={textElem.color}
                        onChange={(e) => onUpdate({ color: e.target.value })}
                    />
                </div>
                <div className="studio-floating-group is-segmented">
                    {(['left', 'center', 'right'] as TextAlignId[]).map(align => (
                        <button
                            key={align}
                            type="button"
                            className={`studio-floating-btn ${textElem.textAlign === align ? 'active' : ''}`}
                            onClick={() => onUpdate({ textAlign: align })}
                            title={`Align ${align}`}
                        >
                            <LinearIcon name={`align-${align}` as any} size={16} />
                        </button>
                    ))}
                </div>
            </div>

            <div className="studio-floating-divider" />

            <div className="studio-floating-group">
                <button type="button" className="studio-floating-btn" onClick={onDuplicate} title="Duplicate">
                    <LinearIcon name="word" size={18} />
                </button>
                <button type="button" className="studio-floating-btn delete" onClick={onDelete} title="Delete">
                    <LinearIcon name="x" size={18} />
                </button>
            </div>
        </div>
    );
}
