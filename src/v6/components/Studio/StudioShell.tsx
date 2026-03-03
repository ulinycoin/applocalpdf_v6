import { useState, useRef, useEffect, useCallback } from 'react';
import { Stage, Layer, Rect } from 'react-konva';
import type Konva from 'konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import { useLocation, useNavigate } from 'react-router-dom';
import { usePlatform } from '../../../app/react/platform-context';
import { useStudioStore, PageItem, StudioDocument as IStudioDocument, StudioState } from './studio-store';
import { StudioDocument } from './StudioDocument';
import { DetachedPageObject } from './DetachedPageObject';
import { StudioFloatingMenu } from './StudioFloatingMenu';
import { ThumbnailService } from '../../studio/thumbnail/thumbnail-service';
import type { StudioReturnContext, StudioToolRouteState } from '../../studio/navigation/studio-tool-context';
import * as pdfjs from 'pdfjs-dist';
import { PDFDocument } from 'pdf-lib';
import { StudioInPlaceEditor } from './StudioInPlaceEditor';

export interface StudioShellProps {
    onFilesDropped?: (files: File[]) => void;
}

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

function estimateDocumentWidth(pageCount: number): number {
    return Math.max(240, pageCount * (CARD_WIDTH + CARD_GAP) + 20);
}

function estimateDocumentHeight(): number {
    return DOC_BLOCK_HEIGHT;
}

function placeNewDocumentsInRows(
    existingDocs: IStudioDocument[],
    drafts: NewDocumentDraft[],
    viewportWidth: number,
): IStudioDocument[] {
    if (drafts.length === 0) {
        return [];
    }

    const startX = DOC_WRAP_PADDING_X;
    const startY = Math.max(
        DOC_WRAP_PADDING_Y,
        ...existingDocs.map((doc) => doc.y + estimateDocumentHeight() + DOC_WRAP_GAP_Y),
    );
    const usableWidth = Math.max(420, viewportWidth - DOC_WRAP_PADDING_X * 2);

    const positioned: IStudioDocument[] = [];
    let cursorX = startX;
    let cursorY = startY;
    let rowHeight = 0;

    for (const draft of drafts) {
        const width = estimateDocumentWidth(draft.pages.length);
        const height = estimateDocumentHeight();
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

function computeDocumentsBounds(docs: IStudioDocument[]): { minX: number; minY: number; maxX: number; maxY: number } {
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    for (const doc of docs) {
        const docWidth = estimateDocumentWidth(doc.pages.length);
        const docHeight = estimateDocumentHeight();
        minX = Math.min(minX, doc.x - 20);
        minY = Math.min(minY, doc.y - 40);
        maxX = Math.max(maxX, doc.x + docWidth + 20);
        maxY = Math.max(maxY, doc.y + docHeight + 20);
    }

    return { minX, minY, maxX, maxY };
}

export function StudioShell({ onFilesDropped }: StudioShellProps) {
    const [dimensions, setDimensions] = useState({ width: window.innerWidth, height: window.innerHeight });
    const studioViewScale = useStudioStore((s: StudioState) => s.studioViewScale);
    const studioViewPosition = useStudioStore((s: StudioState) => s.studioViewPosition);
    const setStudioViewport = useStudioStore((s: StudioState) => s.setStudioViewport);
    const [viewScale, setViewScale] = useState(studioViewScale);
    const [viewPosition, setViewPosition] = useState(studioViewPosition);
    const containerRef = useRef<HTMLDivElement>(null);
    const uploadInputRef = useRef<HTMLInputElement | null>(null);
    const stageRef = useRef<Konva.Stage | null>(null);
    const stagePixelRatio = Math.max(1, Math.ceil(window.devicePixelRatio || 1));

    const location = useLocation();
    const navigate = useNavigate();
    const { runtime } = usePlatform();
    const isDraggingFile = useStudioStore((s: StudioState) => s.isDraggingFile);
    const setDraggingFile = useStudioStore((s: StudioState) => s.setDraggingFile);
    const documents = useStudioStore((s: StudioState) => s.documents);
    const detachedPages = useStudioStore((s: StudioState) => s.detachedPages);
    const addDocument = useStudioStore((s: StudioState) => s.addDocument);
    const setDocuments = useStudioStore((s: StudioState) => s.setDocuments);
    const setActiveDocument = useStudioStore((s: StudioState) => s.setActiveDocument);
    const setSelection = useStudioStore((s: StudioState) => s.setSelection);
    const setInteractionMode = useStudioStore((s: StudioState) => s.setInteractionMode);
    const hasFiles = documents.length > 0 || detachedPages.length > 0;

    useEffect(() => {
        setStudioViewport(viewScale, viewPosition);
    }, [setStudioViewport, viewPosition, viewScale]);

    const fitToDocuments = useCallback((targetDocs: IStudioDocument[]) => {
        if (targetDocs.length === 0) {
            setViewScale(1);
            setViewPosition({ x: 0, y: 0 });
            return;
        }

        const bounds = computeDocumentsBounds(targetDocs);
        const boundsWidth = Math.max(1, bounds.maxX - bounds.minX);
        const boundsHeight = Math.max(1, bounds.maxY - bounds.minY);
        const padding = 56;
        const fitScale = clampScale(Math.min(
            (dimensions.width - padding * 2) / boundsWidth,
            (dimensions.height - padding * 2) / boundsHeight,
        ));
        const contentWidth = boundsWidth * fitScale;
        const contentHeight = boundsHeight * fitScale;
        const nextX = (dimensions.width - contentWidth) / 2 - bounds.minX * fitScale;
        const nextY = (dimensions.height - contentHeight) / 2 - bounds.minY * fitScale;

        setViewScale(fitScale);
        setViewPosition({ x: nextX, y: nextY });
    }, [dimensions.height, dimensions.width]);

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
        if (files.length === 0) {
            return;
        }
        if (fromDrop) {
            onFilesDropped?.(files);
        }

        for (let file of files) {
            try {
                // If it's an image, wrap it in a PDF on the fly
                if (file.type.startsWith('image/')) {
                    const pdfDoc = await PDFDocument.create();
                    const imageBytes = await file.arrayBuffer();
                    let embeddedImage;
                    if (file.type === 'image/jpeg' || file.type === 'image/jpg') {
                        embeddedImage = await pdfDoc.embedJpg(imageBytes);
                    } else if (file.type === 'image/png') {
                        embeddedImage = await pdfDoc.embedPng(imageBytes);
                    } else {
                        throw new Error(`Unsupported image type: ${file.type}`);
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
                const entry = await runtime.vfs.write(file);
                const buffer = await file.arrayBuffer();

                // 2. Load PDF once
                const loadingTask = pdfjs.getDocument({ data: new Uint8Array(buffer) });
                const pdf = await loadingTask.promise;
                const numPages = pdf.numPages;

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
                drafts.push({
                    id: crypto.randomUUID(),
                    name: file.name,
                    pages,
                    isModified: false,
                });
            } catch (error) {
                console.error('Failed to load file into Studio:', error);
            }
        }

        const positionedDocs = placeNewDocumentsInRows(documents, drafts, dimensions.width);
        for (const doc of positionedDocs) {
            addDocument(doc);
        }
        if (positionedDocs.length > 0) {
            fitToDocuments([...documents, ...positionedDocs]);
        }
    }, [addDocument, dimensions.width, documents, fitToDocuments, onFilesDropped, runtime.vfs]);

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

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            const target = event.target as HTMLElement | null;
            const isTypingInInput = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
            if (isTypingInInput) {
                return;
            }

            const key = event.key.toLowerCase();
            const isOpenShortcut = (event.ctrlKey || event.metaKey) && key === 'o';
            const isQuickUploadShortcut = !event.ctrlKey && !event.metaKey && !event.altKey && key === 'u';

            if (!isOpenShortcut && !isQuickUploadShortcut) {
                return;
            }

            event.preventDefault();
            openUploadDialog();
        };

        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [openUploadDialog]);

    const handleStageWheel = useCallback((event: KonvaEventObject<WheelEvent>) => {
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
        zoomAtScreenPoint({ x: dimensions.width / 2, y: dimensions.height / 2 }, 'in');
    }, [dimensions.height, dimensions.width, zoomAtScreenPoint]);

    const zoomOut = useCallback(() => {
        zoomAtScreenPoint({ x: dimensions.width / 2, y: dimensions.height / 2 }, 'out');
    }, [dimensions.height, dimensions.width, zoomAtScreenPoint]);

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
                            throw error;
                        }
                    }
                    if (cancelled) {
                        break;
                    }
                    const x = sourceDoc
                        ? sourceDoc.x + estimateDocumentWidth(sourceDoc.pages.length) + DOC_WRAP_GAP_X + index * (CARD_WIDTH + DOC_WRAP_GAP_X)
                        : 100;
                    const y = sourceDoc ? sourceDoc.y : (100 + index * (DOC_BLOCK_HEIGHT + 50));
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
                }
                setSelection([]);
            } catch (error) {
                if (!cancelled) {
                    console.error('Failed to apply tool result in Studio:', error);
                }
            } finally {
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
        documents,
        fitToDocuments,
        location.state,
        navigate,
        setDocuments,
        setActiveDocument,
        setInteractionMode,
        setSelection,
    ]);

    useEffect(() => {
        if (documents.length === 0) {
            setViewScale(1);
            setViewPosition({ x: 0, y: 0 });
            return;
        }
        fitToDocuments(documents);
    }, [documents.length, fitToDocuments]);

    return (
        <div
            ref={containerRef}
            className={`studio-shell-container ${isDraggingFile ? 'dragging' : ''}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
        >
            {!hasFiles && (
                <div className="studio-void-layer">
                    <div className="studio-void-blob">
                        <div className="studio-void-content">
                            <h2 className="studio-void-title">The Void</h2>
                            <p className="studio-void-subtitle">Drop files here to start your journey</p>
                        </div>
                    </div>
                </div>
            )}
            <Stage
                ref={stageRef}
                width={dimensions.width}
                height={dimensions.height}
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
                        fill="#121e29"
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
            <div className="studio-viewport-controls animate-fade-in">
                <button className="studio-viewport-btn studio-viewport-btn-upload" onClick={openUploadDialog} title="Upload files (U or Ctrl/Cmd+O)">
                    Upload
                </button>
                {hasFiles && (
                    <>
                        <button className="studio-viewport-btn" onClick={zoomOut} title="Zoom out">-</button>
                        <button className="studio-viewport-btn" onClick={zoomIn} title="Zoom in">+</button>
                        <button className="studio-viewport-btn studio-viewport-btn-fit" onClick={() => fitToDocuments(documents)} title="Fit all documents">
                            Fit
                        </button>
                        <span className="studio-viewport-scale">{Math.round(viewScale * 100)}%</span>
                    </>
                )}
            </div>
            <input
                ref={uploadInputRef}
                type="file"
                accept="application/pdf,image/png,image/jpeg,image/webp"
                multiple
                className="hidden"
                onChange={handleUploadInputChange}
            />
            {!useStudioStore.getState().activeEditPageId && <StudioFloatingMenu />}
            <StudioInPlaceEditor stageRef={stageRef} />
        </div>
    );
}
