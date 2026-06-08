import { LinearIcon, type LinearIconName } from '../icons/linear-icon';
import type { StudioEditToolId } from './studio-store';

type StudioConvertToolId = 'ocr-pdf' | 'pdf-to-jpg' | 'extract-images' | 'compress-pdf' | 'auto-toc';

interface RailToolItem {
    tool: StudioEditToolId | StudioConvertToolId;
    icon: LinearIconName;
    label: string;
    description?: string;
}

export interface StudioToolRailProps {
    activeTool: string | null;
    onToolClick: (toolId: string) => void;
    onUpload: () => void;
    hasFiles: boolean;
    onNewSpace?: () => void;
    onHistoryToggle?: () => void;
    isHistoryOpen?: boolean;
    plan?: 'basic' | 'pro';
}

const EDIT_TOOLS: RailToolItem[] = [
    { tool: 'text', icon: 'text', label: 'Text', description: 'Add and edit text elements on PDF pages' },
    { tool: 'annotate', icon: 'highlighter', label: 'Annotate', description: 'Highlight text, draw shapes, and add notes' },
    { tool: 'sign', icon: 'signature', label: 'Sign', description: 'Draw, type, or upload your signature to sign PDF' },
    { tool: 'whiteout', icon: 'eraser', label: 'Whiteout', description: 'Permanently erase sensitive content from PDF' },
    { tool: 'watermark', icon: 'stamp', label: 'Watermark', description: 'Add text or image watermarks to all pages' },
    { tool: 'forms', icon: 'file-input', label: 'Forms', description: 'Add fillable fields like text boxes, checkboxes, and dropdowns' },
    { tool: 'protect', icon: 'lock', label: 'Protect', description: 'Encrypt PDF with passwords and restrict permissions' },
];

const CONVERT_TOOLS: RailToolItem[] = [
    { tool: 'ocr-pdf', icon: 'ocr', label: 'OCR', description: 'Recognize text in scanned PDFs and make them searchable' },
    { tool: 'auto-toc', icon: 'edit', label: 'TOC', description: 'Auto-detect headings and generate an interactive table of contents with bookmarks' },
    { tool: 'pdf-to-jpg', icon: 'image', label: 'PDF to JPG', description: 'Convert PDF pages to JPEG images' },
    { tool: 'compress-pdf', icon: 'compress', label: 'Compress', description: 'Reduce PDF file size while maintaining quality' },
    { tool: 'extract-images', icon: 'image', label: 'Extract Images', description: 'Extract all embedded images from PDF document' },
];

function RailButton({
    tool,
    icon,
    label,
    description,
    activeTool,
    disabled,
    onClick,
}: {
    tool: string;
    icon: LinearIconName;
    label: string;
    description?: string;
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
            title={description || label}
        >
            <LinearIcon name={icon} size={20} />
            <span>{label}</span>
            {tool === 'auto-toc' && (
                <span className="studio-tool-rail-badge-new">NEW</span>
            )}
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
    plan,
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
                        description={item.description}
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
                        description={item.description}
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
                {plan === 'pro' ? (
                    <div className="studio-rail-plan-badge studio-rail-plan-badge--pro">Pro</div>
                ) : (
                    <div className="studio-rail-plan-badge studio-rail-plan-badge--free">Free</div>
                )}
            </div>
        </aside>
    );
}
