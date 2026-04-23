import { LinearIcon } from '../../icons/linear-icon';
import type { EditorToolId } from '../editor-types';

interface StudioEditToolbarProps {
    ui: any;
    tool: EditorToolId | null;
    textInteractionMode: 'edit' | 'move';
    onSelectTool: (tool: EditorToolId) => void;
    onToggleTextInteractionMode: () => void;
}

export function StudioEditToolbar({ ui, tool, textInteractionMode, onSelectTool, onToggleTextInteractionMode }: StudioEditToolbarProps) {
    return (
        <div className="studio-editor-left-toolbar">
            <div className="studio-editor-toolbar-label">Tools</div>
            <button
                type="button"
                className={`studio-edit-tool-btn ${tool === 'text' ? 'active' : ''}`}
                onClick={() => { onSelectTool('text'); }}
                title={ui.text}
                aria-label={ui.text}
            >
                <LinearIcon name="text" size={22} />
            </button>
            {tool === 'text' && (
                <button
                    type="button"
                    className={`studio-edit-tool-btn ${textInteractionMode === 'move' ? 'active' : ''}`}
                    onClick={onToggleTextInteractionMode}
                    title={ui.moveText}
                    aria-label={ui.moveText}
                    aria-pressed={textInteractionMode === 'move'}
                >
                    <LinearIcon name="move" size={22} />
                </button>
            )}
            <button
                type="button"
                className={`studio-edit-tool-btn ${tool === 'annotate' ? 'active' : ''}`}
                onClick={() => { onSelectTool('annotate'); }}
                title={ui.annotate}
                aria-label={ui.annotate}
            >
                <LinearIcon name="highlighter" size={22} />
            </button>
            <div style={{ width: 24, height: 1, background: 'rgba(255,255,255,0.1)', margin: '4px auto' }} />
            <button
                type="button"
                className={`studio-edit-tool-btn ${tool === 'whiteout' ? 'active' : ''}`}
                onClick={() => onSelectTool('whiteout')}
                title={ui.whiteout}
                aria-label={ui.whiteout}
            >
                <LinearIcon name="eraser" size={22} />
            </button>
            <button
                type="button"
                className={`studio-edit-tool-btn ${tool === 'watermark' ? 'active' : ''}`}
                onClick={() => onSelectTool('watermark')}
                title={ui.watermark}
                aria-label={ui.watermark}
            >
                <LinearIcon name="stamp" size={22} />
            </button>
            <button
                type="button"
                className={`studio-edit-tool-btn ${tool === 'sign' ? 'active' : ''}`}
                onClick={() => { onSelectTool('sign'); }}
                title={ui.sign}
                aria-label={ui.sign}
            >
                <LinearIcon name="signature" size={22} />
            </button>
            <button
                type="button"
                className={`studio-edit-tool-btn ${tool === 'forms' ? 'active' : ''}`}
                onClick={() => onSelectTool('forms')}
                title={ui.forms}
                aria-label={ui.forms}
            >
                <LinearIcon name="file-input" size={22} />
            </button>
            <button
                type="button"
                className={`studio-edit-tool-btn ${tool === 'protect' ? 'active' : ''}`}
                onClick={() => onSelectTool('protect')}
                title={ui.protect}
                aria-label={ui.protect}
            >
                <LinearIcon name="lock" size={22} />
            </button>
        </div>
    );
}
