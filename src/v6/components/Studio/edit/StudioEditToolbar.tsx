import type React from 'react';
import { LinearIcon } from '../../icons/linear-icon';
import type { EditorToolId } from '../editor-types';

interface StudioEditToolbarProps {
    ui: any;
    tool: EditorToolId;
    isSelectMode: boolean;
    onSelectTool: (tool: EditorToolId) => void;
    onSetIsSelectMode: (val: boolean) => void;
}

export function StudioEditToolbar({ ui, tool, isSelectMode, onSelectTool, onSetIsSelectMode }: StudioEditToolbarProps) {
    return (
        <div className="studio-editor-top-toolbar" style={{
            display: 'flex', gap: 6, padding: '4px 6px',
            background: 'rgba(15, 23, 42, 0.9)', border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 12, backdropFilter: 'blur(8px)', pointerEvents: 'auto',
            boxShadow: '0 8px 32px rgba(0,0,0,0.3)'
        }}>
            <button
                className={`studio-edit-tool-btn ${tool === 'text' && isSelectMode ? 'active' : ''}`}
                onClick={() => { onSelectTool('text'); onSetIsSelectMode(true); }}
                title={ui.selectText}
            >
                <LinearIcon name="cursor" size={18} />
            </button>
            <button
                className={`studio-edit-tool-btn ${tool === 'text' && !isSelectMode ? 'active' : ''}`}
                onClick={() => { onSelectTool('text'); onSetIsSelectMode(false); }}
                title={ui.text}
            >
                <LinearIcon name="text" size={18} />
            </button>
            <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.1)', margin: '0 4px' }} />
            <button
                className={`studio-edit-tool-btn ${tool === 'annotate' ? 'active' : ''}`}
                onClick={() => onSelectTool('annotate')}
                title={ui.annotate}
            >
                <LinearIcon name="edit" size={18} />
            </button>
            <button
                className={`studio-edit-tool-btn ${tool === 'shapes' ? 'active' : ''}`}
                onClick={() => onSelectTool('shapes')}
                title={ui.shapes}
            >
                <LinearIcon name="shape" size={18} />
            </button>
            <button
                className={`studio-edit-tool-btn ${tool === 'whiteout' ? 'active' : ''}`}
                onClick={() => onSelectTool('whiteout')}
                title={ui.whiteout}
            >
                <LinearIcon name="eraser" size={18} />
            </button>
        </div>
    );
}
