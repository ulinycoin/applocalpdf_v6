import { useState, useRef, useEffect, useCallback } from 'react';
import { Stage, Layer, Rect, Text } from 'react-konva';
import { usePlatform } from '../../../app/react/platform-context';
import { useStudioStore, PageItem, StudioDocument as IStudioDocument } from './studio-store';
import { StudioDocument } from './StudioDocument';
import { StudioFloatingMenu } from './StudioFloatingMenu';
import { StudioActionBar } from './StudioActionBar';
import { ThumbnailService } from '../../core/services/ThumbnailService';
import * as pdfjs from 'pdfjs-dist';

export interface StudioShellProps {
    onFilesDropped?: (files: File[]) => void;
}

export function StudioShell({ onFilesDropped }: StudioShellProps) {
    const [dimensions, setDimensions] = useState({ width: window.innerWidth, height: window.innerHeight });
    const containerRef = useRef<HTMLDivElement>(null);

    const { runtime } = usePlatform();
    const isDraggingFile = useStudioStore((s: any) => s.isDraggingFile);
    const setDraggingFile = useStudioStore((s: any) => s.setDraggingFile);
    const documents = useStudioStore((s: any) => s.documents);
    const addDocument = useStudioStore((s: any) => s.addDocument);
    const hasFiles = documents.length > 0;

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

    const handleDrop = useCallback(async (e: React.DragEvent) => {
        e.preventDefault();
        setDraggingFile(false);
        const files = Array.from(e.dataTransfer.files);

        // Use a local tracker for vertical placement
        let currentMaxY = documents.reduce((rawMax, d) => {
            const docHeight = 320; // Approx height of a document container (CARD_HEIGHT + label + margin)
            return Math.max(rawMax, d.y + docHeight);
        }, 0);

        if (currentMaxY === 0) currentMaxY = 50; // Initial margin

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

                // 4. Add to Studio (Smart Vertical Placement)
                const startX = 100; // Align left
                const startY = currentMaxY + 50;

                addDocument({
                    id: crypto.randomUUID(),
                    name: file.name,
                    x: startX,
                    y: startY,
                    pages,
                    isModified: false
                });

                // Update currentMaxY for next file in this drop batch
                currentMaxY = startY + 320;
            } catch (error) {
                console.error('Failed to load file into Studio:', error);
            }
        }
    }, [addDocument, dimensions, setDraggingFile, runtime.vfs]);

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
            <Stage width={dimensions.width} height={dimensions.height} draggable={hasFiles}>
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
                            {documents.map((doc: any) => (
                                <StudioDocument key={doc.id} doc={doc} />
                            ))}
                            <Text text="The Desk Workspace" fill="white" x={20} y={dimensions.height - 40} fontSize={20} />
                        </>
                    )}
                </Layer>
            </Stage>
            <StudioFloatingMenu />
            <StudioActionBar />
        </div>
    );
}
