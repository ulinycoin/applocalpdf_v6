import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { LinearIcon, type LinearIconName } from '../icons/linear-icon';
import type { StudioEditToolId } from './studio-store';
import type { StudioConvertToolId } from './convert/use-studio-convert-controller';

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
    onUpload: () => void;
    hasFiles: boolean;
    onNewSpace?: () => void;
    onHistoryToggle?: () => void;
    isHistoryOpen?: boolean;
    plan?: 'basic' | 'pro';
    /** Pulse the upload control when a marketing link asked for a picker the browser blocked. */
    attentionOnUpload?: boolean;
    selectedPageCount?: number;
    activeWorkspaceName?: string;
    mergeTargets?: Array<{ id: string; name: string }>;
    onMergePages?: (targetDocId: string) => void;
    onSplitPages?: () => void;
    onDeletePages?: () => void;
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

const UTILITY_TOOLS: RailToolItem[] = [
    { tool: 'pdf-info', icon: 'file-input', label: 'PDF Info', description: 'Inspect pages, PDF version, encryption, fonts, and metadata locally' },
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

/**
 * Tool list shared by the desktop rail and the mobile sheet.
 * Markup is identical on purpose: `variant` only picks a className, so the
 * mobile sheet cannot drift away from the desktop tool set.
 */
function StudioToolList({
    activeTool,
    onToolClick,
    onUpload,
    hasFiles,
    onHistoryToggle,
    isHistoryOpen,
    plan,
    attentionOnUpload = false,
    selectedPageCount = 0,
    activeWorkspaceName,
    mergeTargets = [],
    onMergePages,
    onSplitPages,
    onDeletePages,
    onAfterSelect,
}: StudioToolRailProps & { onAfterSelect?: () => void }): JSX.Element {
    const [mergePickerOpen, setMergePickerOpen] = useState(false);
    const hasSelection = selectedPageCount > 0;
    const canMerge = hasFiles && Boolean(onMergePages) && mergeTargets.length > 0;
    const canSplit = hasFiles && hasSelection && Boolean(onSplitPages);
    const canDelete = hasFiles && hasSelection && Boolean(onDeletePages);
    const scopeLabel = hasSelection
        ? `${selectedPageCount} page${selectedPageCount === 1 ? '' : 's'} selected`
        : activeWorkspaceName
            ? `whole ${activeWorkspaceName}`
            : 'select pages first';

    const handleMergeClick = () => {
        if (!canMerge || !onMergePages) {
            return;
        }
        if (mergeTargets.length === 1) {
            setMergePickerOpen(false);
            onMergePages(mergeTargets[0].id);
            onAfterSelect?.();
            return;
        }
        setMergePickerOpen((open) => !open);
    };

    const selectTool = (tool: string) => {
        onToolClick(tool);
        onAfterSelect?.();
    };

    return (
        <>
            <button
                type="button"
                className={`studio-tool-rail-btn studio-tool-rail-upload-btn${attentionOnUpload ? ' studio-tool-rail-btn--attention' : ''}`}
                onClick={() => { onUpload(); onAfterSelect?.(); }}
                title="Upload files"
            >
                <LinearIcon name="upload" size={20} />
                <span className="studio-tool-rail-collapsible-text">Upload</span>
            </button>
            <div className="studio-tool-rail-section">
                <div className="studio-tool-rail-section-label studio-tool-rail-collapsible-text">PAGES</div>
                <button
                    type="button"
                    className="studio-tool-rail-btn"
                    onClick={handleMergeClick}
                    disabled={!canMerge}
                    aria-expanded={mergePickerOpen}
                    title={`Merge ${scopeLabel} into another workspace`}
                >
                    <LinearIcon name="merge" size={20} />
                    <span className="studio-tool-rail-collapsible-text">Merge</span>
                </button>
                {mergePickerOpen && mergeTargets.length > 1 && (
                    <div className="studio-tool-rail-merge-targets">
                        {mergeTargets.map((target) => (
                            <button
                                key={target.id}
                                type="button"
                                className="studio-tool-rail-target-btn"
                                onClick={() => {
                                    setMergePickerOpen(false);
                                    onMergePages?.(target.id);
                                    onAfterSelect?.();
                                }}
                            >
                                {target.name}
                            </button>
                        ))}
                    </div>
                )}
                <button
                    type="button"
                    className="studio-tool-rail-btn"
                    onClick={() => { onSplitPages?.(); onAfterSelect?.(); }}
                    disabled={!canSplit}
                    title={hasSelection ? `Split ${scopeLabel} into a new workspace` : 'Select pages to split into a new workspace'}
                >
                    <LinearIcon name="split" size={20} />
                    <span className="studio-tool-rail-collapsible-text">Split</span>
                </button>
                <button
                    type="button"
                    className="studio-tool-rail-btn"
                    onClick={() => { onDeletePages?.(); onAfterSelect?.(); }}
                    disabled={!canDelete}
                    title="Delete selected pages (Delete)"
                >
                    <LinearIcon name="delete-pages" size={20} />
                    <span className="studio-tool-rail-collapsible-text">Delete</span>
                </button>
                <div className="studio-tool-rail-scope studio-tool-rail-collapsible-text">{scopeLabel}</div>
            </div>
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
                        onClick={() => { selectTool(item.tool); }}
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
                        disabled={!hasFiles}
                        onClick={() => { selectTool(item.tool); }}
                    />
                ))}
            </div>

            <div className="studio-tool-rail-section">
                <div className="studio-tool-rail-section-label studio-tool-rail-collapsible-text">INSPECT</div>
                {UTILITY_TOOLS.map((item) => (
                    <RailButton
                        key={item.tool}
                        tool={item.tool}
                        icon={item.icon}
                        label={item.label}
                        description={item.description}
                        activeTool={activeTool}
                        disabled={!hasFiles}
                        onClick={() => { selectTool(item.tool); }}
                    />
                ))}
            </div>

            <div className="studio-tool-rail-divider" />

            <div className="studio-tool-rail-ext-section">
                <a
                    href="https://chromewebstore.google.com/detail/localpdf-private-pdf-comp/mjidkeobnlijdjmioniboflmoelmckfl"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="studio-tool-rail-btn studio-tool-rail-ext-link"
                    title="Install Chrome extension for one-click PDF editing"
                >
                    <LinearIcon name="download" size={20} />
                    <span className="studio-tool-rail-collapsible-text">Get Chrome Extension</span>
                </a>
            </div>

            <div className="studio-tool-rail-divider" />

            <div className="studio-tool-rail-bottom">
                <button
                    type="button"
                    className={`studio-tool-rail-btn${isHistoryOpen ? ' active' : ''}`}
                    onClick={() => { onHistoryToggle?.(); onAfterSelect?.(); }}
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
        </>
    );
}

export function StudioToolRail(props: StudioToolRailProps): JSX.Element {
    return (
        <div className="studio-tool-rail-anchor">
            <aside className="studio-tool-rail" aria-label="Studio tools">
                <StudioToolList {...props} />
            </aside>
        </div>
    );
}

export interface StudioToolSheetProps extends StudioToolRailProps {
    open: boolean;
    onClose: () => void;
}

/**
 * Mobile replacement for the tool rail: a bottom sheet with labelled rows.
 * The rail only reveals its labels on :hover/:focus-within, which never fires
 * on a touch pointer — on a phone the toolset was 19 unlabelled icons.
 */
export function StudioToolSheet({ open, onClose, ...listProps }: StudioToolSheetProps): JSX.Element | null {
    useEffect(() => {
        if (!open) {
            return;
        }
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                onClose();
            }
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [onClose, open]);

    if (!open) {
        return null;
    }

    return createPortal(
        <div className="studio-tool-sheet-backdrop" onClick={onClose} role="presentation">
            <div
                className="studio-tool-sheet"
                role="dialog"
                aria-modal="true"
                aria-label="Studio tools"
                onClick={(event) => event.stopPropagation()}
            >
                <div className="studio-tool-sheet-handle" aria-hidden="true" />
                <div className="studio-tool-sheet-head">
                    <span className="studio-tool-sheet-title">Tools</span>
                    <button type="button" className="studio-tool-sheet-close" onClick={onClose} aria-label="Close tools">
                        ✕
                    </button>
                </div>
                <div className="studio-tool-sheet-body">
                    <StudioToolList {...listProps} onAfterSelect={onClose} />
                </div>
            </div>
        </div>,
        document.body,
    );
}
