import { LinearIcon, type LinearIconName } from '../icons/linear-icon';
import type { StudioEditToolId } from './studio-store';

type StudioConvertToolId = 'ocr-pdf' | 'pdf-to-jpg' | 'extract-images' | 'compress-pdf';

interface RailToolItem {
    tool: StudioEditToolId | StudioConvertToolId;
    icon: LinearIconName;
    label: string;
}

export interface StudioToolRailProps {
    activeTool: string | null;
    onToolClick: (toolId: string) => void;
    onUpload: () => void;
    hasFiles: boolean;
    onNewSpace?: () => void;
    onHistoryToggle?: () => void;
    isHistoryOpen?: boolean;
}

const EDIT_TOOLS: RailToolItem[] = [
    { tool: 'text', icon: 'text', label: 'Text' },
    { tool: 'annotate', icon: 'highlighter', label: 'Annotate' },
    { tool: 'sign', icon: 'signature', label: 'Sign' },
    { tool: 'whiteout', icon: 'eraser', label: 'Whiteout' },
    { tool: 'watermark', icon: 'stamp', label: 'Watermark' },
    { tool: 'forms', icon: 'file-input', label: 'Forms' },
    { tool: 'protect', icon: 'lock', label: 'Protect' },
];

const CONVERT_TOOLS: RailToolItem[] = [
    { tool: 'ocr-pdf', icon: 'ocr', label: 'OCR' },
    { tool: 'pdf-to-jpg', icon: 'image', label: 'PDF to JPG' },
    { tool: 'compress-pdf', icon: 'compress', label: 'Compress' },
    { tool: 'extract-images', icon: 'image', label: 'Extract Images' },
];

function RailButton({
    tool,
    icon,
    label,
    activeTool,
    disabled,
    onClick,
}: {
    tool: string;
    icon: LinearIconName;
    label: string;
    activeTool: string | null;
    disabled?: boolean;
    onClick: () => void;
}): JSX.Element {
    const isActive = activeTool === tool;

    return (
        <button
            type="button"
            className={`studio-tool-rail-btn${isActive ? ' active' : ''}`}
            onClick={onClick}
            disabled={disabled}
            aria-pressed={isActive}
            title={label}
        >
            <LinearIcon name={icon} size={20} />
            <span>{label}</span>
        </button>
    );
}

export function StudioToolRail({
    activeTool,
    onToolClick,
    onUpload,
    hasFiles,
    onNewSpace,
    onHistoryToggle,
    isHistoryOpen,
}: StudioToolRailProps): JSX.Element {
    return (
        <aside className="studio-tool-rail" aria-label="Studio tools">
            <button
                type="button"
                className="studio-tool-rail-upload"
                onClick={onUpload}
                title="Upload files"
            >
                <LinearIcon name="upload" size={20} />
                <span>Upload file</span>
            </button>

            <div className="studio-tool-rail-section">
                <div className="studio-tool-rail-section-label">EDIT</div>
                {EDIT_TOOLS.map((item) => (
                    <RailButton
                        key={item.tool}
                        tool={item.tool}
                        icon={item.icon}
                        label={item.label}
                        activeTool={activeTool}
                        disabled={!hasFiles}
                        onClick={() => { onToolClick(item.tool); }}
                    />
                ))}
            </div>

            <div className="studio-tool-rail-section">
                <div className="studio-tool-rail-section-label">CONVERT</div>
                {CONVERT_TOOLS.map((item) => (
                    <RailButton
                        key={item.tool}
                        tool={item.tool}
                        icon={item.icon}
                        label={item.label}
                        activeTool={activeTool}
                        disabled={!hasFiles}
                        onClick={() => { onToolClick(item.tool); }}
                    />
                ))}
            </div>

            <div className="studio-tool-rail-divider" />

            <div className="studio-tool-rail-bottom">
                <button
                    type="button"
                    className={`studio-tool-rail-btn${isHistoryOpen ? ' active' : ''}`}
                    onClick={onHistoryToggle}
                    disabled={!onHistoryToggle}
                    aria-pressed={Boolean(isHistoryOpen)}
                    title={isHistoryOpen ? 'Hide history' : 'Show history'}
                >
                    <LinearIcon name="history" size={20} />
                    <span>History</span>
                </button>
            </div>
        </aside>
    );
}
