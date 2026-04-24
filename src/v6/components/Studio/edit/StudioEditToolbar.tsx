import { LinearIcon } from '../../icons/linear-icon';
import type { EditorToolId } from '../editor-types';

interface StudioEditToolbarProps {
    ui: any;
    tool: EditorToolId | null;
    textInteractionMode: 'edit' | 'move';
    onSelectTool: (tool: EditorToolId) => void;
    onToggleTextInteractionMode: () => void;
}

interface ToolItem {
    id: EditorToolId;
    icon: string;
    label: string;
}

const TOOLS: ToolItem[] = [
    { id: 'text',      icon: 'text',       label: 'Text' },
    { id: 'annotate',  icon: 'highlighter', label: 'Annotate' },
    { id: 'sign',      icon: 'signature',  label: 'Sign' },
    { id: 'whiteout',  icon: 'eraser',     label: 'Whiteout' },
    { id: 'watermark', icon: 'stamp',      label: 'Watermark' },
    { id: 'forms',     icon: 'file-input', label: 'Forms' },
    { id: 'protect',   icon: 'lock',       label: 'Protect' },
];

export function StudioEditToolbar({ ui, tool, textInteractionMode, onSelectTool, onToggleTextInteractionMode }: StudioEditToolbarProps) {
    return (
        <div className="studio-editor-left-toolbar">
            <div className="studio-editor-toolbar-label">Tools</div>

            {TOOLS.map(({ id, icon, label }) => (
                <button
                    key={id}
                    type="button"
                    className={`studio-edit-tool-btn${tool === id ? ' active' : ''}`}
                    onClick={() => onSelectTool(id)}
                    title={label}
                    aria-label={label}
                    aria-pressed={tool === id}
                >
                    <LinearIcon name={icon as any} size={16} />
                    <span style={{ fontSize: 9, lineHeight: 1, letterSpacing: 0.1, marginTop: 1 }}>{label}</span>
                </button>
            ))}

            {tool === 'text' && (
                <>
                    <div style={{ width: 28, height: 1, background: 'var(--border)', margin: '3px auto' }} />
                    <button
                        type="button"
                        className={`studio-edit-tool-btn${textInteractionMode === 'move' ? ' active' : ''}`}
                        onClick={onToggleTextInteractionMode}
                        title={ui.moveText}
                        aria-label={ui.moveText}
                        aria-pressed={textInteractionMode === 'move'}
                    >
                        <LinearIcon name="move" size={16} />
                        <span style={{ fontSize: 9, lineHeight: 1 }}>Move</span>
                    </button>
                </>
            )}
        </div>
    );
}
