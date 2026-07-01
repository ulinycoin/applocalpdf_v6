import { useState, useRef, useEffect, useCallback, useMemo, lazy, Suspense } from 'react';
import { isVfsQuotaExceededError } from '../../../app/platform/error-utils';
import { createPortal } from 'react-dom';
import { Stage, Layer, Rect } from 'react-konva';
import type Konva from 'konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import { useLocation, useNavigate } from 'react-router-dom';
import { usePlatform } from '../../../app/react/platform-context';
import { useStudioStore, PageItem, StudioDocument as IStudioDocument, StudioState, StudioEditToolId } from './studio-store';
import { StudioDocument } from './StudioDocument';
import { DetachedPageObject } from './DetachedPageObject';
import { StudioToolRail } from './StudioToolRail';
import type { StudioConvertToolId } from './convert/use-studio-convert-controller';
import { ThumbnailService } from '../../studio/thumbnail/thumbnail-service';
import { StudioTimeline } from './branching/StudioTimeline';
import type { StudioReturnContext, StudioToolRouteState } from '../../studio/navigation/studio-tool-context';
import { getPdfJs, getPdfLib } from '../../services/pdf/pdf-loader';
import { StudioInPlaceEditor } from './StudioInPlaceEditor';
import { StudioDialog } from './StudioDialog';
import { canAddDocumentToStudio, canCreateWorkspace, canUseDocumentWithPageCount } from '../../../app/platform/plan-limits';
import { showStudioPaywall } from '../../../app/react/studio-paywall';
import { PaywallModal } from '../../../app/react/PaywallModal';
import { useHistoryStore } from './store/history-store';
import { getDailyUsage, incrementDailyUsage, FREE_TOOL_DAILY_LIMITS } from '../../../app/platform/daily-usage';
import { getOrCreateFlowId } from '../../../app/platform/browser-context';
import { LinearIcon } from '../icons/linear-icon';

const StudioEditWorkspace = lazy(async () => {
    const m = await import('./StudioEditWorkspace');
    return { default: m.StudioEditWorkspace };
});

const StudioConvertWorkspace = lazy(async () => {
    const m = await import('./convert/StudioConvertWorkspace');
    return { default: m.StudioConvertWorkspace };
});

const AutoTocStudioPanelLazy = lazy(async () => {
    const m = await import('./convert/AutoTocStudioPanel');
    return { default: m.AutoTocStudioPanel };
});

export interface StudioShellProps {
    onFilesDropped?: (files: File[]) => void;
}

const STUDIO_TOOL_RAIL_WIDTH = 52;

const CARD_WIDTH = 200;
const CARD_HEIGHT = 280;
const CARD_GAP = 20;
const DOC_WRAP_PADDING_X = 80;
const DOC_WRAP_PADDING_Y = 80;
const DOC_WRAP_GAP_X = 48;
const DOC_WRAP_GAP_Y = 56;
const DOC_BLOCK_HEIGHT = CARD_HEIGHT + CARD_GAP + 40;
const ZOOM_MIN = 0.35;
const ZOOM_MAX = 6;
const ZOOM_STEP = 1.2;

interface NewDocumentDraft {
    id: string;
    name: string;
    pages: PageItem[];
    isModified: boolean;
}

function toProtectedName(name: string): string {
    const trimmed = name.trim();
    const lower = trimmed.toLowerCase();
    if (lower.endsWith('(protected)') || lower.endsWith('(protected).pdf')) {
        return trimmed;
    }
    if (lower.endsWith('.pdf')) {
        return `${trimmed.slice(0, -4)} (protected).pdf`;
    }
    return `${trimmed} (protected)`;
}

function isPdfPasswordError(error: unknown): boolean {
    if (!error || typeof error !== 'object') {
        return false;
    }
    const maybe = error as {
        name?: unknown;
        code?: unknown;
        message?: unknown;
    };
    const name = typeof maybe.name === 'string' ? maybe.name.toLowerCase() : '';
    const code = typeof maybe.code === 'number' ? maybe.code : null;
    const message = typeof maybe.message === 'string' ? maybe.message.toLowerCase() : '';
    return (
        name.includes('passwordexception')
        || message.includes('passwordexception')
        || message.includes('encrypted')
        || code === 1
        || code === 2
    );
}

function clampScale(scale: number): number {
    return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, scale));
}

async function normalizeImageFileForPdf(file: File): Promise<File> {
    if (!file.type.startsWith('image/')) {
        return file;
    }

    const preferredMime = file.type === 'image/png' ? 'image/png' : 'image/jpeg';

    if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') {
        return file;
    }

    try {
        const bitmap = await createImageBitmap(file);
        try {
            const canvas = document.createElement('canvas');
            canvas.width = bitmap.width;
            canvas.height = bitmap.height;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                return file;
            }
            ctx.drawImage(bitmap, 0, 0);
            const normalizedBlob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, preferredMime, 0.92));
            if (!normalizedBlob) {
                return file;
            }
            const nextExt = preferredMime === 'image/png' ? 'png' : 'jpg';
            const baseName = file.name.replace(/\.[^.]+$/u, '');
            return new File([normalizedBlob], `${baseName || 'image'}.${nextExt}`, { type: preferredMime });
        } finally {
            bitmap.close();
        }
    } catch {
        return file;
    }
}

function estimateDocumentWidth(pageCount: number, gridColumns: number): number {
    const cols = Math.min(pageCount || 1, gridColumns);
    return Math.max(240, cols * (CARD_WIDTH + CARD_GAP) + 20);
}

function estimateDocumentHeight(pageCount: number, gridColumns: number): number {
    const cols = Math.min(pageCount || 1, gridColumns);
    const rows = Math.ceil(pageCount / cols) || 1;
    return Math.max(DOC_BLOCK_HEIGHT, rows * (CARD_HEIGHT + CARD_GAP) + 60);
}

function placeNewDocumentsInRows(
    existingDocs: IStudioDocument[],
    drafts: NewDocumentDraft[],
    viewportWidth: number,
    gridColumns: number
): IStudioDocument[] {
    if (drafts.length === 0) {
        return [];
    }

    const startX = DOC_WRAP_PADDING_X;
    const startY = Math.max(
        DOC_WRAP_PADDING_Y,
        ...existingDocs.map((doc) => doc.y + estimateDocumentHeight(doc.pages.length, gridColumns) + DOC_WRAP_GAP_Y),
    );
    const usableWidth = Math.max(420, viewportWidth - DOC_WRAP_PADDING_X * 2);

    const positioned: IStudioDocument[] = [];
    let cursorX = startX;
    let cursorY = startY;
    let rowHeight = 0;

    for (const draft of drafts) {
        const width = estimateDocumentWidth(draft.pages.length, gridColumns);
        const height = estimateDocumentHeight(draft.pages.length, gridColumns);
        const wouldOverflow = cursorX !== startX && (cursorX - startX + width > usableWidth);

        if (wouldOverflow) {
            cursorX = startX;
            cursorY += rowHeight + DOC_WRAP_GAP_Y;
            rowHeight = 0;
        }

        positioned.push({
            ...draft,
            x: cursorX,
            y: cursorY,
        });

        cursorX += width + DOC_WRAP_GAP_X;
        rowHeight = Math.max(rowHeight, height);
    }

    return positioned;
}

function computeDocumentsBounds(docs: IStudioDocument[], gridColumns: number): { minX: number; minY: number; maxX: number; maxY: number } {
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    for (const doc of docs) {
        const docWidth = estimateDocumentWidth(doc.pages.length, gridColumns);
        const docHeight = estimateDocumentHeight(doc.pages.length, gridColumns);
        minX = Math.min(minX, doc.x - 20);
        minY = Math.min(minY, doc.y - 40);
        maxX = Math.max(maxX, doc.x + docWidth + 20);
        maxY = Math.max(maxY, doc.y + docHeight + 20);
    }

    return { minX, minY, maxX, maxY };
}

export function StudioShell({ onFilesDropped }: StudioShellProps) {
    const uiRunIdRef = useRef(crypto.randomUUID());
    const [dimensions, setDimensions] = useState({ width: window.innerWidth, height: window.innerHeight });
    const studioViewScale = useStudioStore((s: StudioState) => s.studioViewScale);
    const studioViewPosition = useStudioStore((s: StudioState) => s.studioViewPosition);
    const setStudioViewport = useStudioStore((s: StudioState) => s.setStudioViewport);
    const gridColumns = useStudioStore((s: StudioState) => s.gridColumns);
    const setGridColumns = useStudioStore((s: StudioState) => s.setGridColumns);
    const [viewScale, setViewScale] = useState(studioViewScale);
    const [viewPosition, setViewPosition] = useState(studioViewPosition);
    const containerRef = useRef<HTMLDivElement>(null);
    const uploadInputRef = useRef<HTMLInputElement | null>(null);
    const stageRef = useRef<Konva.Stage | null>(null);
    const stagePixelRatio = Math.max(1, Math.ceil(window.devicePixelRatio || 1));

    const location = useLocation();
    const navigate = useNavigate();
    const { runtime } = usePlatform();
    const [billingContext, setBillingContext] = useState(() => runtime.billing.getContext());

    useEffect(() => {
        return runtime.billing.subscribe((ctx) => {
            setBillingContext(ctx);
        });
    }, [runtime.billing]);

    const isDraggingFile = useStudioStore((s: StudioState) => s.isDraggingFile);
    const setDraggingFile = useStudioStore((s: StudioState) => s.setDraggingFile);
    const documents = useStudioStore((s: StudioState) => s.documents);
    const detachedPages = useStudioStore((s: StudioState) => s.detachedPages);
    const addDocument = useStudioStore((s: StudioState) => s.addDocument);
    const setDocuments = useStudioStore((s: StudioState) => s.setDocuments);
    const setActiveDocument = useStudioStore((s: StudioState) => s.setActiveDocument);
    const activeDocumentId = useStudioStore((s: StudioState) => s.activeDocumentId);
    const createCheckpoint = useHistoryStore((s) => s.createCheckpoint);
    const isHistoryOpen = useStudioStore((s: StudioState) => s.isHistoryOpen);
    const setHistoryOpen = useStudioStore((s: StudioState) => s.setHistoryOpen);
    const renamingDocId = useStudioStore((s: StudioState) => s.renamingDocId);
    const setRenamingDocId = useStudioStore((s: StudioState) => s.setRenamingDocId);
    const selection = useStudioStore((s: StudioState) => s.selection);
    const setSelection = useStudioStore((s: StudioState) => s.setSelection);
    const setInteractionMode = useStudioStore((s: StudioState) => s.setInteractionMode);
    const startEditSession = useStudioStore((s: StudioState) => s.startEditSession);
    const _setActiveEditPageId = useStudioStore((s: StudioState) => s.setActiveEditPageId);
    const editSession = useStudioStore((s: StudioState) => s.editSession);
    const clearEditSession = useStudioStore((s: StudioState) => s.clearEditSession);
    const updateDocument = useStudioStore((s: StudioState) => s.updateDocument);
    const activeDocument = useMemo(
        () => documents.find((doc) => doc.id === activeDocumentId) ?? null,
        [activeDocumentId, documents],
    );
    const hasFiles = documents.length > 0 || detachedPages.length > 0;
    const pageClipboardRef = useRef<PageItem[]>([]);
    const [hasClipboardPages, setHasClipboardPages] = useState(false);
    const canvasDimensions = useMemo(
        () => ({
            width: Math.max(0, dimensions.width - STUDIO_TOOL_RAIL_WIDTH),
            height: dimensions.height,
        }),
        [dimensions.height, dimensions.width],
    );

    const dotPatternCanvas = useMemo(() => {
        const size = 20;
        const c = document.createElement('canvas');
        c.width = size;
        c.height = size;
        const ctx = c.getContext('2d');
        if (ctx) {
            ctx.fillStyle = '#f0efed';
            ctx.fillRect(0, 0, size, size);
            ctx.fillStyle = '#b4b4b0';
            ctx.beginPath();
            ctx.arc(size / 2, size / 2, 1, 0, Math.PI * 2);
            ctx.fill();
        }
        return c as unknown as HTMLImageElement;
    }, []);

    // Active tool overlay — 'edit' or convert tool id
    type OverlayMode = 'edit' | StudioConvertToolId;
    const [overlayMode, setOverlayMode] = useState<OverlayMode | null>(null);
    const [paywallReason, setPaywallReason] = useState<string | null>(null);

    useEffect(() => {
        setStudioViewport(viewScale, viewPosition, canvasDimensions);
    }, [canvasDimensions, setStudioViewport, viewPosition, viewScale]);

    const notifyStudioError = useCallback((message: string) => {
        runtime.telemetry.track({
            type: 'UI_TOAST_SHOWN',
            runId: uiRunIdRef.current,
            toolId: 'studio',
            message,
            level: 'error',
        });
    }, [runtime.telemetry]);

    const fitToDocuments = useCallback((targetDocs: IStudioDocument[]) => {
        if (targetDocs.length === 0) {
            setViewScale(1);
            setViewPosition({ x: 0, y: 0 });
            return;
        }

        const bounds = computeDocumentsBounds(targetDocs, gridColumns);
        const boundsWidth = Math.max(1, bounds.maxX - bounds.minX);
        const boundsHeight = Math.max(1, bounds.maxY - bounds.minY);
        const padding = 56;
        const fitScale = clampScale(Math.min(
            (canvasDimensions.width - padding * 2) / boundsWidth,
            (canvasDimensions.height - padding * 2) / boundsHeight,
        ));
        const contentWidth = boundsWidth * fitScale;
        const contentHeight = boundsHeight * fitScale;
        const nextX = (canvasDimensions.width - contentWidth) / 2 - bounds.minX * fitScale;
        const nextY = (canvasDimensions.height - contentHeight) / 2 - bounds.minY * fitScale;

        setViewScale(fitScale);
        setViewPosition({ x: nextX, y: nextY });
    }, [canvasDimensions.height, canvasDimensions.width, gridColumns]);

    const resolveEditTarget = useCallback(() => {
        const selectedPage = selection.length >= 1
            ? (() => {
                const target = selection[0];
                const doc = documents.find((item) => item.id === target.docId) ?? null;
                const page = doc?.pages.find((item) => item.id === target.pageId) ?? null;
                return doc && page ? { doc, page } : null;
            })()
            : null;
        const activeDocWithPage = activeDocument?.pages[0]
            ? { doc: activeDocument, page: activeDocument.pages[0] }
            : null;
        const fallbackDoc = documents.find((doc) => doc.pages[0]) ?? null;
        const fallbackPage = fallbackDoc?.pages[0] ?? null;
        return selectedPage ?? activeDocWithPage ?? (fallbackDoc && fallbackPage ? { doc: fallbackDoc, page: fallbackPage } : null);
    }, [activeDocument, documents, selection]);

    const _zoomToDocument = useCallback((doc: IStudioDocument) => {
        const MIN_READABLE_SCALE = 1.4;
        if (viewScale >= MIN_READABLE_SCALE) return;

        const docWidth = estimateDocumentWidth(doc.pages.length, gridColumns);
        const docHeight = estimateDocumentHeight(doc.pages.length, gridColumns);
        const padding = 56;
        const fitScale = clampScale(Math.min(
            (canvasDimensions.width - padding * 2) / docWidth,
            (canvasDimensions.height - padding * 2) / docHeight,
        ));
        const targetScale = Math.max(MIN_READABLE_SCALE, fitScale);
        const contentWidth = docWidth * targetScale;
        const contentHeight = docHeight * targetScale;
        const nextX = (canvasDimensions.width - contentWidth) / 2 - doc.x * targetScale;
        const nextY = (canvasDimensions.height - contentHeight) / 2 - doc.y * targetScale;

        setViewScale(targetScale);
        setViewPosition({ x: nextX, y: nextY });
    }, [canvasDimensions.height, canvasDimensions.width, gridColumns, viewScale]);

    const handleOverlayClose = useCallback(() => {
        setOverlayMode(null);
        clearEditSession();
        setInteractionMode(null);
    }, [clearEditSession, setInteractionMode]);

    const startEditFromCanvas = useCallback((initialTool: StudioEditToolId) => {
        const target = resolveEditTarget();
        if (!target) return;

        startEditSession({
            docId: target.doc.id,
            pageId: target.page.id,
            pageIndex: target.page.pageIndex,
            fileId: target.page.fileId,
            initialTool,
        });
        setSelection([{ docId: target.doc.id, pageId: target.page.id }]);
        setInteractionMode('edit');
        setOverlayMode('edit');
    }, [resolveEditTarget, startEditSession, setSelection, setInteractionMode]);

    const startConvertFromCanvas = useCallback((tool: StudioConvertToolId) => {
        if (!hasFiles) return;
        setInteractionMode('convert');
        setOverlayMode(tool);
    }, [hasFiles, setInteractionMode]);

    const handleToolClick = useCallback((tool: string) => {
        const billingContext = runtime.billing.getContext();
        const editToolIds: string[] = ['text', 'annotate', 'sign', 'whiteout', 'watermark', 'forms', 'protect'];

        // Daily limit for free-tier tools (OCR uses page-based trial, not daily limit)
        const dailyLimit = FREE_TOOL_DAILY_LIMITS[tool];
        if (dailyLimit !== undefined && billingContext.plan === 'basic' && tool !== 'ocr-pdf') {
            const usage = getDailyUsage(tool);
            if (usage >= dailyLimit) {
                showStudioPaywall(
                    runtime.telemetry,
                    `You've used all ${dailyLimit} free ${tool} runs today. Upgrade to Pro for unlimited use.`,
                    import.meta.env.VITE_BILLING_URL,
                );
                setPaywallReason(`You've used all ${dailyLimit} free uses today. Upgrade to Pro for unlimited use.`);
                return;
            }
        }

        if (editToolIds.includes(tool)) {
            startEditFromCanvas(tool as StudioEditToolId);
        } else {
            startConvertFromCanvas(tool as StudioConvertToolId);
        }

        // Track successful tool start for daily-limited tools
        if (FREE_TOOL_DAILY_LIMITS[tool] !== undefined && billingContext.plan === 'basic') {
            incrementDailyUsage(tool);
        }
    }, [startEditFromCanvas, startConvertFromCanvas, runtime.billing, runtime.telemetry]);

    const handleHistoryToggle = useCallback(() => {
        setHistoryOpen(!isHistoryOpen);
    }, [isHistoryOpen, setHistoryOpen]);

    const handleNewSpace = useCallback(() => {
        const billingContext = runtime.billing.getContext();
        const limitCheck = canAddDocumentToStudio(billingContext, documents.length, 0);
        if (!limitCheck.allowed) {
            showStudioPaywall(
                runtime.telemetry,
                limitCheck.reason === 'workspace_limit'
                    ? 'Free includes up to 3 workspaces. Upgrade to Pro for unlimited workspaces.'
                    : 'Free supports documents up to 25 pages. Upgrade to Pro to open larger PDFs.',
                import.meta.env.VITE_BILLING_URL,
            );
            return;
        }

        const maxY = documents.reduce((acc, doc) => Math.max(acc, doc.y + 120), 80);
        const nextDocId = crypto.randomUUID();
        addDocument({
            id: nextDocId,
            name: `Workspace ${documents.length + 1}`,
            x: 100,
            y: hasFiles ? maxY + 40 : 100,
            pages: [],
            allowEmpty: true,
            includeInExport: true,
            isModified: true,
        });
        setActiveDocument(nextDocId);
        void createCheckpoint(runtime.vfs, 'system', 'Created Workspace');
    }, [addDocument, createCheckpoint, documents, hasFiles, runtime.billing, runtime.telemetry, runtime.vfs, setActiveDocument]);

    const railActiveTool = overlayMode === 'edit'
        ? editSession?.activeTool ?? null
        : overlayMode ?? editSession?.activeTool ?? null;

    const zoomAtScreenPoint = useCallback((point: { x: number; y: number }, direction: 'in' | 'out') => {
        const oldScale = viewScale;
        const factor = direction === 'in' ? ZOOM_STEP : 1 / ZOOM_STEP;
        const nextScale = clampScale(oldScale * factor);
        if (Math.abs(nextScale - oldScale) < 0.0001) {
            return;
        }

        const worldX = (point.x - viewPosition.x) / oldScale;
        const worldY = (point.y - viewPosition.y) / oldScale;
        const nextX = point.x - worldX * nextScale;
        const nextY = point.y - worldY * nextScale;

        setViewScale(nextScale);
        setViewPosition({ x: nextX, y: nextY });
    }, [viewPosition.x, viewPosition.y, viewScale]);

    const buildPagesFromFileId = useCallback(async (fileId: string): Promise<{ name: string; pages: PageItem[] }> => {
        const pdfjs = await getPdfJs();
        const entry = await runtime.vfs.read(fileId);
        const blob = await entry.getBlob();
        const buffer = await blob.arrayBuffer();
        const loadingTask = pdfjs.getDocument({ data: new Uint8Array(buffer) });
        const pdf = await loadingTask.promise;
        const numPages = pdf.numPages;

        const pages: PageItem[] = [];
        for (let i = 0; i < numPages; i++) {
            const page = await pdf.getPage(i + 1);
            const thumb = await ThumbnailService.generateThumbnailFromPage(page);
            pages.push({
                id: crypto.randomUUID(),
                fileId,
                pageIndex: i,
                thumbnailUrl: thumb,
                rotation: 0
            });
        }

        await pdf.destroy();
        return { name: entry.getName(), pages };
    }, [runtime.vfs]);

    const buildEncryptedFallbackFromSource = useCallback(async (
        fileId: string,
        sourceDoc: IStudioDocument,
    ): Promise<{ name: string; pages: PageItem[] }> => {
        const entry = await runtime.vfs.read(fileId);
        const pages = sourceDoc.pages.map((page) => ({
            id: crypto.randomUUID(),
            fileId,
            pageIndex: page.pageIndex,
            thumbnailUrl: page.thumbnailUrl,
            rotation: page.rotation,
        }));
        return { name: entry.getName(), pages };
    }, [runtime.vfs]);

    const applyReturnContext = useCallback((ctx: StudioReturnContext | undefined) => {
        if (!ctx) {
            return;
        }
        setActiveDocument(ctx.activeDocumentId);
        setSelection(ctx.selection);
        setInteractionMode(ctx.interactionMode);
        setViewScale(clampScale(ctx.viewScale));
        setViewPosition(ctx.viewPosition);
    }, [setActiveDocument, setInteractionMode, setSelection]);



    useEffect(() => {
        const handleResize = () => {
            if (containerRef.current) {
                setDimensions({
                    width: containerRef.current.offsetWidth,
                    height: containerRef.current.offsetHeight,
                });
            }
        };

        window.addEventListener('resize', handleResize);
        handleResize();
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setDraggingFile(true);
    }, [setDraggingFile]);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setDraggingFile(false);
    }, [setDraggingFile]);

    const handleIncomingFiles = useCallback(async (files: File[], fromDrop: boolean) => {
        const drafts: NewDocumentDraft[] = [];
        const uploadedFiles: File[] = [];
        if (files.length === 0) {
            return;
        }
        if (fromDrop) {
            onFilesDropped?.(files);
        }

        const billingContext = runtime.billing.getContext();

        for (let file of files) {
            let writtenFileId: string | null = null;
            try {
                const workspaceCheck = canCreateWorkspace(billingContext, documents.length + drafts.length);
                if (!workspaceCheck.allowed) {
                    showStudioPaywall(
                        runtime.telemetry,
                        'Free includes up to 3 workspaces. Upgrade to Pro for unlimited workspaces.',
                        import.meta.env.VITE_BILLING_URL,
                    );
                    break;
                }

                // If it's an image, wrap it in a PDF on the fly
                if (file.type.startsWith('image/')) {
                    const normalizedImage = await normalizeImageFileForPdf(file);
                    const { PDFDocument } = await getPdfLib();
                    const pdfDoc = await PDFDocument.create();
                    const imageBytes = await normalizedImage.arrayBuffer();
                    let embeddedImage;
                    if (normalizedImage.type === 'image/jpeg' || normalizedImage.type === 'image/jpg' || normalizedImage.type === 'image/webp') {
                        embeddedImage = await pdfDoc.embedJpg(imageBytes);
                    } else if (normalizedImage.type === 'image/png') {
                        embeddedImage = await pdfDoc.embedPng(imageBytes);
                    } else {
                        throw new Error(`Unsupported image type: ${normalizedImage.type}`);
                    }

                    const { width, height } = embeddedImage.scale(1);
                    const page = pdfDoc.addPage([width, height]);
                    page.drawImage(embeddedImage, {
                        x: 0,
                        y: 0,
                        width,
                        height,
                    });

                    const pdfBytes = await pdfDoc.save();
                    const baseName = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
                    file = new File([pdfBytes as any], `${baseName}.pdf`, { type: 'application/pdf' });
                }

                // 1. Save to VFS
                const pdfjs = await getPdfJs();
                const entry = await runtime.vfs.write(file);
                writtenFileId = entry.id;
                const buffer = await file.arrayBuffer();

                // 2. Load PDF once
                const loadingTask = pdfjs.getDocument({ data: new Uint8Array(buffer) });
                const pdf = await loadingTask.promise;
                const numPages = pdf.numPages;

                const documentCheck = canAddDocumentToStudio(billingContext, documents.length + drafts.length, numPages);
                if (!documentCheck.allowed) {
                    showStudioPaywall(
                        runtime.telemetry,
                        `This document has ${numPages} pages. Free plan supports up to 25 — upgrade to Pro for unlimited.`,
                        import.meta.env.VITE_BILLING_URL,
                    );
                    await pdf.destroy();
                    await runtime.vfs.delete(entry.id).catch(() => undefined);
                    writtenFileId = null;
                    continue;
                }

                const pages: PageItem[] = [];

                // 3. Generate pages and thumbnails
                for (let i = 0; i < numPages; i++) {
                    const page = await pdf.getPage(i + 1);
                    const thumb = await ThumbnailService.generateThumbnailFromPage(page);
                    pages.push({
                        id: crypto.randomUUID(),
                        fileId: entry.id,
                        pageIndex: i,
                        thumbnailUrl: thumb,
                        rotation: 0
                    });
                }

                // Clean up pdf object
                await pdf.destroy();
                uploadedFiles.push(file);
                drafts.push({
                    id: crypto.randomUUID(),
                    name: file.name,
                    pages,
                    isModified: false,
                });
            } catch (error) {
                if (writtenFileId) {
                    await runtime.vfs.delete(writtenFileId).catch(() => undefined);
                }
                console.error('Failed to load file into Studio:', error);
                if (isVfsQuotaExceededError(error)) {
                    notifyStudioError('Storage quota exceeded. Close some documents or clear the workspace and try again.');
                } else {
                    const message = error instanceof Error ? error.message : 'Failed to load file into Studio.';
                    notifyStudioError(message);
                }
            }
        }

        const positionedDocs = placeNewDocumentsInRows(documents, drafts, canvasDimensions.width, gridColumns);
        for (const doc of positionedDocs) {
            addDocument(doc);
        }
        if (positionedDocs.length > 0) {
            runtime.telemetry.track({
                type: 'APP_FILE_UPLOADED',
                flowId: getOrCreateFlowId(),
                toolId: 'studio',
                fileCount: uploadedFiles.length,
                mimeCategory: uploadedFiles[0]?.type.startsWith('image/')
                  ? 'image'
                  : uploadedFiles[0]?.type === 'application/pdf'
                    ? 'pdf'
                    : (uploadedFiles[0]?.type.split('/')[0] || 'unknown'),
                totalBytes: uploadedFiles.reduce((sum, file) => sum + file.size, 0),
                source: 'studio',
            });
            fitToDocuments([...documents, ...positionedDocs]);
            void createCheckpoint(runtime.vfs, 'upload', `Uploaded ${positionedDocs.length} ${positionedDocs.length === 1 ? 'file' : 'files'}`);
        }
    }, [addDocument, canvasDimensions.width, createCheckpoint, documents, fitToDocuments, notifyStudioError, onFilesDropped, runtime.telemetry, runtime.vfs, gridColumns]);

    const handleDrop = useCallback(async (e: React.DragEvent) => {
        e.preventDefault();
        setDraggingFile(false);
        await handleIncomingFiles(Array.from(e.dataTransfer.files), true);
    }, [handleIncomingFiles, setDraggingFile]);

    const handleUploadInputChange = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(event.target.files ?? []);
        await handleIncomingFiles(files, false);
        event.target.value = '';
    }, [handleIncomingFiles]);

    const openUploadDialog = useCallback(() => {
        uploadInputRef.current?.click();
    }, []);

    const handleEmptyStateUpload = useCallback(() => {
        runtime.telemetry.track({
            type: 'STUDIO_EMPTY_STATE_CTA',
            runId: uiRunIdRef.current,
            action: 'upload',
        });
        openUploadDialog();
    }, [openUploadDialog, runtime.telemetry]);

    const copySelectedPages = useCallback(() => {
        if (selection.length === 0) {
            return false;
        }
        const selectionSet = new Set(selection.map((item) => item.pageId));
        const orderedPages: PageItem[] = [];
        for (const doc of documents) {
            for (const page of doc.pages) {
                if (selectionSet.has(page.id)) {
                    orderedPages.push(page);
                }
            }
        }
        if (orderedPages.length === 0) {
            return false;
        }
        pageClipboardRef.current = orderedPages;
        setHasClipboardPages(true);
        return true;
    }, [documents, selection]);

    const pasteSelectedPages = useCallback(() => {
        if (!activeDocumentId || pageClipboardRef.current.length === 0) {
            return false;
        }
        const targetDoc = documents.find((doc) => doc.id === activeDocumentId);
        if (!targetDoc) {
            return false;
        }

        const billingContext = runtime.billing.getContext();
        const nextPageCount = targetDoc.pages.length + pageClipboardRef.current.length;
        const pageCheck = canUseDocumentWithPageCount(billingContext, nextPageCount);
        if (!pageCheck.allowed) {
            showStudioPaywall(
                runtime.telemetry,
                'Free supports documents up to 25 pages. Upgrade to Pro to keep adding pages.',
                import.meta.env.VITE_BILLING_URL,
            );
            return false;
        }

        const clonedPages: PageItem[] = pageClipboardRef.current.map((page) => ({
            ...page,
            id: crypto.randomUUID(),
        }));
        const nextDocuments = documents.map((doc) => {
            if (doc.id !== activeDocumentId) {
                return doc;
            }
            return {
                ...doc,
                pages: [...doc.pages, ...clonedPages],
                isModified: true,
            };
        });
        setDocuments(nextDocuments);
        setSelection(clonedPages.map((page) => ({ docId: activeDocumentId, pageId: page.id })));
        return true;
    }, [activeDocumentId, documents, runtime.telemetry, runtime.billing, setDocuments, setSelection]);

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            const target = event.target as HTMLElement | null;
            const isTypingInInput = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
            if (isTypingInInput) {
                return;
            }

            const key = event.key.toLowerCase();
            const isModifierPressed = event.ctrlKey || event.metaKey;
            const isOpenShortcut = (event.ctrlKey || event.metaKey) && key === 'o';
            const isQuickUploadShortcut = !event.ctrlKey && !event.metaKey && !event.altKey && key === 'u';
            const isCopyShortcut = isModifierPressed && !event.shiftKey && !event.altKey && key === 'c';
            const isPasteShortcut = isModifierPressed && !event.shiftKey && !event.altKey && key === 'v';

            if (isCopyShortcut) {
                if (copySelectedPages()) {
                    event.preventDefault();
                }
                return;
            }

            if (isPasteShortcut) {
                if (pasteSelectedPages()) {
                    event.preventDefault();
                }
                return;
            }

            if (!isOpenShortcut && !isQuickUploadShortcut) {
                return;
            }

            event.preventDefault();
            openUploadDialog();
        };

        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [copySelectedPages, openUploadDialog, pasteSelectedPages]);

    const handleStageWheel = useCallback((event: KonvaEventObject<WheelEvent>) => {
        const targetNode = event.target;
        const isOverDocument = Boolean(targetNode?.findAncestor('.document', true));
        const isOverPage = Boolean(targetNode?.findAncestor('.page-object', true));
        const isOverDetachedPage = Boolean(targetNode?.findAncestor('.detached-page-object', true));

        if (!isOverDocument && !isOverPage && !isOverDetachedPage) {
            return;
        }

        event.evt.preventDefault();
        const stage = stageRef.current;
        if (!stage) {
            return;
        }
        const pointer = stage.getPointerPosition();
        if (!pointer) {
            return;
        }
        zoomAtScreenPoint(pointer, event.evt.deltaY > 0 ? 'out' : 'in');
    }, [zoomAtScreenPoint]);

    const zoomIn = useCallback(() => {
        zoomAtScreenPoint({ x: canvasDimensions.width / 2, y: canvasDimensions.height / 2 }, 'in');
    }, [canvasDimensions.height, canvasDimensions.width, zoomAtScreenPoint]);

    const zoomOut = useCallback(() => {
        zoomAtScreenPoint({ x: canvasDimensions.width / 2, y: canvasDimensions.height / 2 }, 'out');
    }, [canvasDimensions.height, canvasDimensions.width, zoomAtScreenPoint]);

    useEffect(() => {
        const routeState = (location.state as StudioToolRouteState | null) ?? null;
        const toolResult = routeState?.studioToolResult;
        const returnContext = routeState?.studioReturnContext;
        if (!toolResult || toolResult.outputIds.length === 0) {
            if (routeState?.source === 'studio' && returnContext) {
                applyReturnContext(returnContext);
                navigate('/studio', { replace: true, state: null });
            }
            return;
        }

        let cancelled = false;
        void (async () => {
            const skippedOutputIds: string[] = [];
            try {
                const { outputIds, studioContext } = toolResult;
                const sourceDocId = studioContext?.documentId ?? studioContext?.selectedPages[0]?.docId ?? null;
                const sourceDoc = sourceDocId
                    ? documents.find((doc) => doc.id === sourceDocId) ?? null
                    : null;
                const returnDoc = returnContext?.activeDocumentId
                    ? documents.find((doc) => doc.id === returnContext.activeDocumentId) ?? null
                    : null;
                const fallbackDoc = sourceDoc ?? returnDoc;
                const newDocs: IStudioDocument[] = [];
                const billingContext = runtime.billing.getContext();

                for (let index = 0; index < outputIds.length; index += 1) {
                    let rebuilt: { name: string; pages: PageItem[] };
                    try {
                        rebuilt = await buildPagesFromFileId(outputIds[index]);
                    } catch (error) {
                        const isPasswordProtected = isPdfPasswordError(error);
                        const isProtectTool = toolResult.toolId === 'protect-pdf';
                        if (isProtectTool && isPasswordProtected && fallbackDoc) {
                            rebuilt = await buildEncryptedFallbackFromSource(outputIds[index], fallbackDoc);
                        } else {
                            skippedOutputIds.push(outputIds[index]);
                            throw error;
                        }
                    }
                    if (cancelled) {
                        break;
                    }

                    if (sourceDoc && toolResult.toolId === 'protect-pdf' && index > 0) {
                        skippedOutputIds.push(outputIds[index]);
                        continue;
                    }

                    if (!sourceDoc || toolResult.toolId !== 'protect-pdf') {
                        const workspaceCheck = canCreateWorkspace(billingContext, documents.length + newDocs.length);
                        if (!workspaceCheck.allowed) {
                            showStudioPaywall(
                                runtime.telemetry,
                                'Free includes up to 3 workspaces. Upgrade to Pro for unlimited workspaces.',
                                import.meta.env.VITE_BILLING_URL,
                            );
                            skippedOutputIds.push(...outputIds.slice(index));
                            break;
                        }
                    }

                    const pageCheck = canUseDocumentWithPageCount(billingContext, rebuilt.pages.length);
                    if (!pageCheck.allowed) {
                        showStudioPaywall(
                            runtime.telemetry,
                            'Free supports documents up to 25 pages. Upgrade to Pro to open larger PDFs.',
                            import.meta.env.VITE_BILLING_URL,
                        );
                        skippedOutputIds.push(outputIds[index]);
                        continue;
                    }

                    const x = sourceDoc
                        ? sourceDoc.x + estimateDocumentWidth(sourceDoc.pages.length, gridColumns) + DOC_WRAP_GAP_X + index * (CARD_WIDTH + DOC_WRAP_GAP_X)
                        : 100;
                    const y = sourceDoc ? sourceDoc.y : (100 + index * (estimateDocumentHeight(rebuilt.pages.length, gridColumns) + 50));
                    newDocs.push({
                        id: crypto.randomUUID(),
                        name: rebuilt.name,
                        x,
                        y,
                        pages: rebuilt.pages,
                        isModified: true,
                    });
                }

                if (newDocs.length > 0) {
                    if (toolResult.toolId === 'protect-pdf' && sourceDoc) {
                        const protectedDoc = newDocs[0];
                        const nextDocuments = documents.map((doc) => {
                            if (doc.id !== sourceDoc.id) {
                                return doc;
                            }
                            return {
                                ...doc,
                                name: toProtectedName(doc.name),
                                pages: protectedDoc.pages,
                                isModified: true,
                            };
                        });
                        setDocuments(nextDocuments);
                        setActiveDocument(sourceDoc.id);
                    } else if (sourceDoc) {
                        const sourceIndex = documents.findIndex((doc) => doc.id === sourceDoc.id);
                        if (sourceIndex >= 0) {
                            const nextDocuments = [...documents];
                            nextDocuments.splice(sourceIndex + 1, 0, ...newDocs);
                            setDocuments(nextDocuments);
                        } else {
                            for (const doc of newDocs) {
                                addDocument(doc);
                            }
                        }
                    } else {
                        for (const doc of newDocs) {
                            addDocument(doc);
                        }
                    }
                    await createCheckpoint(runtime.vfs, 'convert', `Executed ${toolResult.toolId}`);
                }
                setSelection([]);
            } catch (error) {
                if (!cancelled) {
                    console.error('Failed to apply tool result in Studio:', error);
                    if (isVfsQuotaExceededError(error)) {
                        notifyStudioError('Storage quota exceeded. Close some documents or clear the workspace and try again.');
                    } else {
                        const message = error instanceof Error ? error.message : 'Failed to apply tool result in Studio.';
                        notifyStudioError(message);
                    }
                }
            } finally {
                for (const skippedOutputId of skippedOutputIds) {
                    await runtime.vfs.delete(skippedOutputId).catch(() => undefined);
                }
                if (!cancelled) {
                    applyReturnContext(returnContext);
                    navigate('/studio', { replace: true, state: null });
                }
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [
        addDocument,
        applyReturnContext,
        buildPagesFromFileId,
        buildEncryptedFallbackFromSource,
        createCheckpoint,
        documents,
        fitToDocuments,
        location.state,
        navigate,
        setDocuments,
        setActiveDocument,
        setInteractionMode,
        setSelection,
        gridColumns,
        notifyStudioError,
        runtime.billing,
        runtime.telemetry,
    ]);

    useEffect(() => {
        if (documents.length === 0) {
            setViewScale(1);
            setViewPosition({ x: 0, y: 0 });
            return;
        }
        fitToDocuments(documents);
    }, [documents.length, fitToDocuments]);

    useEffect(() => {
        const checkTransferredFiles = async (): Promise<boolean> => {
            let fileTransferred = false;
            // 1. Check IndexedDB transfer database
            try {
                fileTransferred = await new Promise<boolean>((resolve) => {
                    const dbRequest = indexedDB.open('localpdf-transfer', 1);
                    dbRequest.onupgradeneeded = () => {
                        const db = dbRequest.result;
                        if (!db.objectStoreNames.contains('transfer-files')) {
                            db.createObjectStore('transfer-files', { keyPath: 'id' });
                        }
                    };
                    dbRequest.onsuccess = () => {
                        const db = dbRequest.result;
                        if (!db.objectStoreNames.contains('transfer-files')) {
                            db.close();
                            resolve(false);
                            return;
                        }
                        const tx = db.transaction('transfer-files', 'readwrite');
                        const store = tx.objectStore('transfer-files');
                        const getRequest = store.get('pending');

                        getRequest.onsuccess = () => {
                            const record = getRequest.result;
                            if (record) {
                                const { blob, name, type } = record;
                                const file = new File([blob], name, { type });
                                store.delete('pending');
                                void handleIncomingFiles([file], true);
                                resolve(true);
                            } else {
                                resolve(false);
                            }
                        };

                        tx.oncomplete = () => {
                            db.close();
                        };
                        tx.onerror = () => {
                            db.close();
                            resolve(false);
                        };
                    };
                    dbRequest.onerror = () => {
                        resolve(false);
                    };
                });
            } catch (err) {
                console.error('Failed to retrieve file from IndexedDB transfer', err);
            }

            if (fileTransferred) return true;

            // 2. Check sessionStorage fallback
            try {
                const transferData = window.sessionStorage.getItem('localpdf_transfer_file');
                if (transferData) {
                    const { name, type, dataUrl } = JSON.parse(transferData);
                    window.sessionStorage.removeItem('localpdf_transfer_file');
                    const res = await fetch(dataUrl);
                    const blob = await res.blob();
                    const file = new File([blob], name, { type });
                    void handleIncomingFiles([file], true);
                    return true;
                }
            } catch (err) {
                console.error('Failed to retrieve file from sessionStorage transfer', err);
            }
            return false;
        };

        const initWorkspace = async () => {
            const hasTransferred = await checkTransferredFiles();
            const params = new URLSearchParams(window.location.search);
            if (params.get('upload') === '1') {
                if (!hasTransferred) {
                    uploadInputRef.current?.click();
                }
                navigate('/studio', { replace: true, state: location.state });
            }
        };

        void initWorkspace();
    }, [handleIncomingFiles, navigate, location.state]);

    return (
        <div
            ref={containerRef}
            className={`studio-shell-container ${isDraggingFile ? 'dragging' : ''}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
        >
            <div className="studio-shell-workspace">
                <StudioToolRail
                    activeTool={railActiveTool}
                    onToolClick={handleToolClick}
                    hasFiles={hasFiles}
                    onNewSpace={handleNewSpace}
                    onHistoryToggle={handleHistoryToggle}
                    isHistoryOpen={isHistoryOpen}
                    plan={billingContext.plan}
                />
                <div className="studio-shell-canvas">
                    <Stage
                        ref={stageRef}
                        width={canvasDimensions.width}
                        height={canvasDimensions.height}
                        pixelRatio={stagePixelRatio}
                        draggable={hasFiles}
                        x={viewPosition.x}
                        y={viewPosition.y}
                        scaleX={viewScale}
                        scaleY={viewScale}
                        onWheel={handleStageWheel}
                        onDragEnd={(event) => {
                            if (event.target !== event.currentTarget) {
                                return;
                            }
                            setViewPosition({
                                x: event.currentTarget.x(),
                                y: event.currentTarget.y(),
                            });
                        }}
                    >
                        <Layer>
                            <Rect
                                x={-5000}
                                y={-5000}
                                width={10000}
                                height={10000}
                                fillPatternImage={dotPatternCanvas}
                                fillPatternRepeat="repeat"
                            />
                            {hasFiles && (
                                <>
                                    {documents.map((doc: IStudioDocument) => (
                                        <StudioDocument key={doc.id} doc={doc} />
                                    ))}
                                    {detachedPages.map((page) => (
                                        <DetachedPageObject key={page.id} page={page} />
                                    ))}
                                </>
                            )}
                        </Layer>
                    </Stage>
                    {!hasFiles && (
                        <div className="studio-empty-state" aria-live="polite">
                            <div className="studio-empty-state-icon" aria-hidden="true">
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                            </div>
                            <h2 className="studio-empty-state-title">Drop a PDF to get started</h2>
                            <p className="studio-empty-state-copy">All processing happens locally.<br/>Your files never leave your device.</p>
                            <div className="studio-empty-state-actions">
                                <button
                                    type="button"
                                    className="studio-upload-btn studio-empty-state-upload-btn"
                                    onClick={handleEmptyStateUpload}
                                >
                                    <LinearIcon name="upload" size={18} />
                                    Upload PDF
                                </button>
                            </div>
                            <div className="studio-empty-state-hints" aria-label="Studio shortcuts">
                                <span className="studio-empty-state-hint">U</span>
                                <span className="studio-empty-state-hint-sep">upload</span>
                                <span className="studio-empty-state-hint-sep">·</span>
                                <span className="studio-empty-state-hint">⌘O</span>
                                <span className="studio-empty-state-hint-sep">open</span>
                                <span className="studio-empty-state-hint-sep">·</span>
                                <span className="studio-empty-state-hint">drag &amp; drop</span>
                            </div>
                        </div>
                    )}
                    <div className="studio-viewport-controls animate-fade-in">
                        <button className="studio-viewport-btn" onClick={zoomOut} title="Zoom out" disabled={!hasFiles}>−</button>
                        <span className="studio-viewport-scale">{Math.round(viewScale * 100)}%</span>
                        <button className="studio-viewport-btn" onClick={zoomIn} title="Zoom in" disabled={!hasFiles}>+</button>
                        <button className="studio-viewport-btn studio-viewport-btn-fit" onClick={() => fitToDocuments(documents)} title="Fit to screen" disabled={!hasFiles}>
                            Fit
                        </button>

                        <span className="studio-viewport-bar-divider" />

                        <button
                            className={`studio-viewport-btn ${gridColumns === 3 ? 'active' : ''}`}
                            onClick={() => setGridColumns(3)}
                            title="Grid: 3 columns"
                            disabled={!hasFiles}
                        >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect></svg>
                        </button>
                        <button
                            className={`studio-viewport-btn ${gridColumns === 5 ? 'active' : ''}`}
                            onClick={() => setGridColumns(5)}
                            title="Grid: 5 columns overview"
                            disabled={!hasFiles}
                        >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="3" y1="15" x2="21" y2="15"></line><line x1="9" y1="3" x2="9" y2="21"></line><line x1="15" y1="3" x2="15" y2="21"></line></svg>
                        </button>

                        <span className="studio-viewport-bar-divider" />

                        <button
                            className="studio-viewport-btn"
                            onClick={() => { copySelectedPages(); }}
                            title="Copy selected pages (Ctrl/Cmd+C)"
                            disabled={selection.length === 0}
                            style={selection.length === 0 ? { opacity: 0.4 } : undefined}
                        >
                            Copy
                        </button>
                        <button
                            className="studio-viewport-btn"
                            onClick={() => { pasteSelectedPages(); }}
                            title="Paste copied pages (Ctrl/Cmd+V)"
                            disabled={selection.length === 0 || !activeDocumentId || !hasClipboardPages}
                            style={(!hasClipboardPages || selection.length === 0) ? { opacity: 0.4 } : undefined}
                        >
                            Paste
                        </button>

                        <span className="studio-viewport-spacer" />

                        {selection.length > 0 && (
                            <span className="studio-viewport-selection-count" title={`${selection.length} selected pages`}>
                                {selection.length} selected
                            </span>
                        )}
                        <button
                            className={`studio-viewport-btn ${isHistoryOpen ? 'active' : ''}`}
                            onClick={() => setHistoryOpen(!isHistoryOpen)}
                            title={isHistoryOpen ? 'Hide history' : 'Show history'}
                        >
                            History
                        </button>
                    </div>
                </div>
            </div>
            <input
                ref={uploadInputRef}
                type="file"
                accept="application/pdf,image/png,image/jpeg,image/webp"
                multiple
                className="hidden"
                onChange={handleUploadInputChange}
            />
            {isHistoryOpen && <StudioTimeline />}
            <StudioInPlaceEditor stageRef={stageRef} />
            {overlayMode && createPortal(
                <div className="studio-tool-overlay">
                    <Suspense fallback={null}>
                        {overlayMode === 'edit'
                            ? <StudioEditWorkspace onClose={handleOverlayClose} />
                            : overlayMode === 'auto-toc'
                                ? <AutoTocStudioPanelLazy onClose={handleOverlayClose} inputFileId={activeDocument?.pages[0]?.fileId ?? ''} fileName={activeDocument?.name ?? 'document.pdf'} runtime={runtime} />
                                : <StudioConvertWorkspace onClose={handleOverlayClose} initialTool={overlayMode} />
                        }
                    </Suspense>
                </div>,
                document.body
            )}
            {paywallReason && (
                <PaywallModal
                    toolId="studio"
                    toolName="Studio Tool"
                    reason="PRO_REQUIRED"
                    details={paywallReason}
                    onClose={() => setPaywallReason(null)}
                />
            )}
            {renamingDocId && (() => {
                const doc = documents.find((d) => d.id === renamingDocId);
                if (!doc) return null;
                return (
                    <StudioDialog
                        type="prompt"
                        title="Rename workspace"
                        defaultValue={doc.name}
                        onConfirm={(value) => {
                            updateDocument(renamingDocId, { name: value });
                            void createCheckpoint(runtime.vfs, 'space_rename', `Renamed to ${value}`);
                            setRenamingDocId(null);
                        }}
                        onCancel={() => setRenamingDocId(null)}
                    />
                );
            })()}
        </div>
    );
}
