import { useState, useRef, useEffect, useCallback } from 'react';
import { Stage, Layer, Rect, Text } from 'react-konva';
import type Konva from 'konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import { useLocation, useNavigate } from 'react-router-dom';
import { usePlatform } from '../../../app/react/platform-context';
import { useStudioStore, PageItem, StudioDocument as IStudioDocument, StudioState } from './studio-store';
import { StudioDocument } from './StudioDocument';
import { DetachedPageObject } from './DetachedPageObject';
import { StudioFloatingMenu } from './StudioFloatingMenu';
import { StudioActionBar } from './StudioActionBar';
import { ThumbnailService } from '../../studio/thumbnail/thumbnail-service';
import type { StudioToolRouteState } from '../../studio/navigation/studio-tool-context';
import * as pdfjs from 'pdfjs-dist';

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
const ZOOM_MAX = 2.5;
const ZOOM_STEP = 1.15;

interface NewDocumentDraft {
    id: string;
    name: string;
    pages: PageItem[];
    isModified: boolean;
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
    const [viewScale, setViewScale] = useState(1);
    const [viewPosition, setViewPosition] = useState({ x: 0, y: 0 });
    const containerRef = useRef<HTMLDivElement>(null);
    const uploadInputRef = useRef<HTMLInputElement | null>(null);
    const stageRef = useRef<Konva.Stage | null>(null);

    const location = useLocation();
    const navigate = useNavigate();
    const { runtime } = usePlatform();
    const isDraggingFile = useStudioStore((s: StudioState) => s.isDraggingFile);
    const setDraggingFile = useStudioStore((s: StudioState) => s.setDraggingFile);
    const documents = useStudioStore((s: StudioState) => s.documents);
    const detachedPages = useStudioStore((s: StudioState) => s.detachedPages);
    const addDocument = useStudioStore((s: StudioState) => s.addDocument);
    const updateDocument = useStudioStore((s: StudioState) => s.updateDocument);
    const updatePage = useStudioStore((s: StudioState) => s.updatePage);
    const setActiveDocument = useStudioStore((s: StudioState) => s.setActiveDocument);
    const setSelection = useStudioStore((s: StudioState) => s.setSelection);
    const hasFiles = documents.length > 0 || detachedPages.length > 0;

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

        for (const file of files) {
            try {
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
        if (!toolResult || toolResult.outputIds.length === 0) {
            return;
        }

        let cancelled = false;
        void (async () => {
            try {
                const { outputIds, studioContext } = toolResult;
                const singleSelectedPage = studioContext?.selectedPages.length === 1 ? studioContext.selectedPages[0] : null;

                if (singleSelectedPage && outputIds.length >= 1) {
                    const rebuilt = await buildPagesFromFileId(outputIds[0]);
                    if (!cancelled && rebuilt.pages.length > 0) {
                        const firstPage = rebuilt.pages[0];
                        updatePage(singleSelectedPage.docId, singleSelectedPage.pageId, {
                            fileId: firstPage.fileId,
                            pageIndex: firstPage.pageIndex,
                            thumbnailUrl: firstPage.thumbnailUrl,
                            rotation: 0
                        });
                        setActiveDocument(singleSelectedPage.docId);
                        setSelection([]);
                    }
                } else if (studioContext?.mode === 'document' && studioContext.documentId && outputIds.length >= 1) {
                    const rebuilt = await buildPagesFromFileId(outputIds[0]);
                    if (!cancelled) {
                        updateDocument(studioContext.documentId, {
                            name: rebuilt.name,
                            pages: rebuilt.pages,
                            isModified: true
                        });
                        setActiveDocument(studioContext.documentId);
                        setSelection([]);
                    }
                } else {
                    let currentMaxY = documents.reduce((rawMax: number, doc: IStudioDocument) => Math.max(rawMax, doc.y + 320), 0);
                    if (currentMaxY === 0) currentMaxY = 50;

                    for (const outputId of outputIds) {
                        const rebuilt = await buildPagesFromFileId(outputId);
                        if (cancelled) {
                            break;
                        }
                        const nextDocId = crypto.randomUUID();
                        const nextY = currentMaxY + 50;
                        addDocument({
                            id: nextDocId,
                            name: rebuilt.name,
                            x: 100,
                            y: nextY,
                            pages: rebuilt.pages,
                            isModified: true
                        });
                        setActiveDocument(nextDocId);
                        currentMaxY = nextY + 320;
                    }
                    setSelection([]);
                }
            } catch (error) {
                if (!cancelled) {
                    console.error('Failed to apply tool result in Studio:', error);
                }
            } finally {
                if (!cancelled) {
                    navigate('/studio', { replace: true, state: null });
                }
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [
        addDocument,
        buildPagesFromFileId,
        documents,
        fitToDocuments,
        location.state,
        navigate,
        setActiveDocument,
        setSelection,
        updateDocument,
        updatePage,
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
                            <Text text="The Desk Workspace" fill="white" x={20} y={dimensions.height - 40} fontSize={20} />
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
                accept="application/pdf"
                multiple
                className="hidden"
                onChange={handleUploadInputChange}
            />
            <StudioFloatingMenu />
            <StudioActionBar />
        </div>
    );
}
