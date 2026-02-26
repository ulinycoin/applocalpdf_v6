import type React from 'react';
import { LinearIcon } from '../../icons/linear-icon';
import type { EditorToolId } from '../editor-types';

interface StudioEditToolbarProps {
    ui: any;
    tool: EditorToolId;
    onSelectTool: (tool: EditorToolId) => void;
    formType?: 'text' | 'checkbox' | 'radio';
    setFormType?: (type: 'text' | 'checkbox' | 'radio') => void;
}

export function StudioEditToolbar({ ui, tool, onSelectTool, formType, setFormType }: StudioEditToolbarProps) {
    return (
        <div className="studio-editor-left-toolbar" style={{
            display: 'flex', flexDirection: 'column', gap: 12, padding: '12px 6px',
            pointerEvents: 'auto'
        }}>
            <button
                className={`studio-edit-tool-btn ${tool === 'text' ? 'active' : ''}`}
                onClick={() => { onSelectTool('text'); }}
                title={ui.text}
            >
                <LinearIcon name="text" size={22} />
            </button>
            <button
                className={`studio-edit-tool-btn ${tool === 'sign' ? 'active' : ''}`}
                onClick={() => { onSelectTool('sign'); }}
                title={ui.sign}
            >
                <LinearIcon name="signature" size={22} />
            </button>
            <button
                className={`studio-edit-tool-btn ${tool === 'annotate' ? 'active' : ''}`}
                onClick={() => { onSelectTool('annotate'); }}
                title={ui.annotate}
            >
                <LinearIcon name="highlighter" size={22} />
            </button>
            <div style={{ width: 24, height: 1, background: 'rgba(255,255,255,0.1)', margin: '4px auto' }} />
            <button
                className={`studio-edit-tool-btn ${tool === 'shapes' ? 'active' : ''}`}
                onClick={() => onSelectTool('shapes')}
                title={ui.shapes}
            >
                <LinearIcon name="shape" size={22} />
            </button>
            <button
                className={`studio-edit-tool-btn ${tool === 'whiteout' ? 'active' : ''}`}
                onClick={() => onSelectTool('whiteout')}
                title={ui.whiteout}
            >
                <LinearIcon name="eraser" size={22} />
            </button>
            <div style={{ width: 24, height: 1, background: 'rgba(255,255,255,0.1)', margin: '4px auto' }} />
            <button
                className={`studio-edit-tool-btn ${tool === 'forms' ? 'active' : ''}`}
                onClick={() => onSelectTool('forms')}
                title="Forms"
            >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22 }}>
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                        <line x1="9" y1="9" x2="15" y2="15" />
                        <line x1="15" y1="9" x2="9" y2="15" />
                    </svg>
                </div>
            </button>
            {tool === 'forms' && setFormType && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '4px', background: 'rgba(0,0,0,0.2)', borderRadius: 6, marginTop: 4 }}>
                    <button
                        className={`studio-edit-tool-btn ${formType === 'text' ? 'active' : ''}`}
                        onClick={() => setFormType('text')}
                        title="Text Field"
                        style={{ width: 28, height: 28, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >
                        T
                    </button>
                    <button
                        className={`studio-edit-tool-btn ${formType === 'checkbox' ? 'active' : ''}`}
                        onClick={() => setFormType('checkbox')}
                        title="Checkbox"
                        style={{ width: 28, height: 28, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >
                        ☑
                    </button>
                    <button
                        className={`studio-edit-tool-btn ${formType === 'radio' ? 'active' : ''}`}
                        onClick={() => setFormType('radio')}
                        title="Radio Group"
                        style={{ width: 28, height: 28, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >
                        🔘
                    </button>
                </div>
            )}
        </div>
    );
}
