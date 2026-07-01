import { LinearIcon, type LinearIconName } from '../icons/linear-icon';
import type { StudioEditToolId } from './studio-store';

export function getConvertToolDisplay(toolId: string): { label: string; icon: LinearIconName } | undefined {
    const item = CONVERT_TOOLS.find((entry) => entry.tool === toolId);
    if (!item) {
        return undefined;
    }
    return { label: item.label, icon: item.icon };
}

interface RailToolItem {
    tool: string;
    icon: LinearIconName;
    label: string;
    description?: string;
}

export interface StudioToolRailProps {
    activeTool: string | null;
    onToolClick: (toolId: string) => void;
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
    { tool: 'images-to-pdf', icon: 'image', label: 'Images to PDF', description: 'Combine JPG, PNG, or WebP images into one PDF document' },
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
            <span className="studio-tool-rail-collapsible-text">{label}</span>
            {tool === 'auto-toc' && (
                <span className="studio-tool-rail-badge-new studio-tool-rail-collapsible-text">NEW</span>
            )}
        </button>
    );
}

export function StudioToolRail({
    activeTool,
    onToolClick,
    hasFiles,
    onNewSpace: _onNewSpace,
    onHistoryToggle,
    isHistoryOpen,
    plan,
}: StudioToolRailProps): JSX.Element {
    return (
        <div className="studio-tool-rail-anchor">
            <aside className="studio-tool-rail" aria-label="Studio tools">
            <div className="studio-tool-rail-section">
                <div className="studio-tool-rail-section-label studio-tool-rail-collapsible-text">EDIT</div>
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
                <div className="studio-tool-rail-section-label studio-tool-rail-collapsible-text">CONVERT</div>
                {CONVERT_TOOLS.map((item) => (
                    <RailButton
                        key={item.tool}
                        tool={item.tool}
                        icon={item.icon}
                        label={item.label}
                        description={item.description}
                        activeTool={activeTool}
                        disabled={item.tool !== 'images-to-pdf' && !hasFiles}
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
                    <span className="studio-tool-rail-collapsible-text">History</span>
                </button>
                {plan === 'pro' ? (
                    <div className="studio-rail-plan-badge studio-rail-plan-badge--pro studio-tool-rail-collapsible-text">Pro</div>
                ) : (
                    <div className="studio-rail-plan-badge studio-rail-plan-badge--free studio-tool-rail-collapsible-text">Free</div>
                )}
            </div>
            </aside>
        </div>
    );
}
