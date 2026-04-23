import React from 'react';
import { Circle, Group, Rect, Text } from 'react-konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import { PageObject } from './PageObject';
import { StudioDocument as IStudioDocument, StudioState, useStudioStore } from './studio-store';
import { useHistoryStore } from './store/history-store';
import { usePlatform } from '../../../app/react/platform-context';

interface StudioDocumentProps {
    doc: IStudioDocument;
}

export const StudioDocument: React.FC<StudioDocumentProps> = ({ doc }) => {
    const [isDropTarget, setIsDropTarget] = React.useState(false);
    const updateDocument = useStudioStore((s: StudioState) => s.updateDocument);
    const activeDocumentId = useStudioStore((s: StudioState) => s.activeDocumentId);
    const setActiveDocument = useStudioStore((s: StudioState) => s.setActiveDocument);
    const selection = useStudioStore((s: StudioState) => s.selection);
    const setSelection = useStudioStore((s: StudioState) => s.setSelection);
    const gridColumns = useStudioStore((s: StudioState) => s.gridColumns);
    const viewportSize = useStudioStore((s: StudioState) => s.viewportSize);
    const studioViewPosition = useStudioStore((s: StudioState) => s.studioViewPosition);
    const studioViewScale = useStudioStore((s: StudioState) => s.studioViewScale);
    const createCheckpoint = useHistoryStore((s) => s.createCheckpoint);
    const { runtime } = usePlatform();

    const handleDragEnd = (e: KonvaEventObject<DragEvent>) => {
        // ONLY handle if the document itself was dragged
        if (e.target.name() !== 'document') return;
        updateDocument(doc.id, { x: e.target.x(), y: e.target.y() });
    };

    const CARD_WIDTH = 200;
    const CARD_HEIGHT = 280;
    const GAP_X = 20;
    const GAP_Y = 30;
    const STATUS_DOT_RADIUS = 4;
    const PAGE_COUNT_WIDTH = 54;
    const PAGE_PADDING = 10;

    // Calculate grid dimensions
    const cols = Math.min(doc.pages.length || 1, gridColumns);
    const rows = Math.ceil(doc.pages.length / cols) || 1;

    // Bounds based on grid Layout
    const width = Math.max(CARD_WIDTH + GAP_X, cols * (CARD_WIDTH + GAP_X));
    const height = rows * (CARD_HEIGHT + GAP_Y);
    const labelMaxWidth = Math.max(120, width - PAGE_COUNT_WIDTH);

    const isActiveDocument = activeDocumentId === doc.id && selection.length === 0;

    return (
        <Group
            x={doc.x}
            y={doc.y}
            draggable
            onDragStart={(e) => {
                e.cancelBubble = true;
            }}
            onDragEnd={handleDragEnd}
            onMouseDown={() => {
                setActiveDocument(doc.id);
                setSelection([]);
            }}
            name="document"
            id={doc.id}
            onDragEnter={() => setIsDropTarget(true)}
            onDragLeave={() => setIsDropTarget(false)}
            onDrop={() => setIsDropTarget(false)}
        >
            {/* ── Header row (white bg, border, rounded top) */}
            <Rect
                width={width + PAGE_PADDING * 2}
                height={30}
                x={-PAGE_PADDING}
                y={-32}
                fill="#ffffff"
                stroke={isDropTarget ? '#2383e2' : (isActiveDocument ? '#2383e2' : '#e9e9e7')}
                strokeWidth={isDropTarget || isActiveDocument ? 1.5 : 1}
                cornerRadius={[6, 6, 0, 0]}
                shadowColor="#000000"
                shadowBlur={isActiveDocument ? 0 : 3}
                shadowOpacity={0.06}
                shadowOffset={{ x: 0, y: 1 }}
            />
            {/* ── Header bottom divider line */}
            <Rect
                width={width + PAGE_PADDING * 2}
                height={1}
                x={-PAGE_PADDING}
                y={-2}
                fill={isActiveDocument ? '#2383e2' : '#e9e9e7'}
                opacity={isActiveDocument ? 0.35 : 1}
                listening={false}
            />
            {/* ── Pages area (white bg, border no-top, rounded bottom) */}
            <Rect
                width={width + PAGE_PADDING * 2}
                height={height + PAGE_PADDING * 2 + 10}
                x={-PAGE_PADDING}
                y={-1}
                fill="#ffffff"
                stroke={isDropTarget ? '#2383e2' : (isActiveDocument ? '#2383e2' : '#e9e9e7')}
                strokeWidth={isDropTarget || isActiveDocument ? 1.5 : 1}
                cornerRadius={[0, 0, 6, 6]}
                shadowColor="#000000"
                shadowBlur={3}
                shadowOpacity={0.06}
                shadowOffset={{ x: 0, y: 1 }}
            />
            {/* Document Label in header */}
            <Group
                y={-32}
                onClick={(e) => {
                    e.cancelBubble = true;
                    const userInput = window.prompt('Enter new name for the workspace:', doc.name);
                    if (userInput !== null) {
                        const newName = userInput.trim();
                        if (newName && newName !== doc.name) {
                            updateDocument(doc.id, { name: newName });
                            void createCheckpoint(runtime.vfs, 'space_rename', `Renamed to ${newName}`);
                        }
                    }
                }}
                style={{ cursor: 'pointer' }}
            >
                <Circle
                    x={4}
                    y={15}
                    radius={STATUS_DOT_RADIUS}
                    fill={doc.isModified ? '#dfab01' : '#0f7b6c'}
                />
                <Text
                    text={doc.name}
                    x={15}
                    y={7}
                    fill="#1a1a18"
                    fontSize={12}
                    fontStyle="500"
                    width={labelMaxWidth - 60}
                    wrap="none"
                    ellipsis
                />
                <Text
                    text={`${doc.pages.length} page${doc.pages.length === 1 ? '' : 's'}`}
                    x={labelMaxWidth - 50}
                    y={7}
                    fill="#b3b3af"
                    fontSize={11}
                    align="right"
                    width={50}
                />
            </Group>

            {/* Grid Pages Row inside Document with Viewport Culling */}
            {doc.pages.length === 0 && (
                <Group x={PAGE_PADDING} y={PAGE_PADDING}>
                    <Rect
                        width={CARD_WIDTH}
                        height={CARD_HEIGHT}
                        fillLinearGradientStartPoint={{ x: 10, y: 10 }}
                        fillLinearGradientEndPoint={{ x: CARD_WIDTH + 10, y: CARD_HEIGHT + 10 }}
                        fillLinearGradientColorStops={[0, '#ffffff', 1, '#f1f1ef']}
                        stroke="#e9e9e7"
                        strokeWidth={1.5}
                        dash={[8, 6]}
                        cornerRadius={12}
                    />
                    <Text
                        text="Drop pages here"
                        fill="#b3b3af"
                        fontSize={14}
                        fontStyle="bold"
                        align="center"
                        verticalAlign="middle"
                        width={CARD_WIDTH}
                        height={CARD_HEIGHT}
                    />
                </Group>
            )}
            {doc.pages.map((page, index) => {
                const col = index % gridColumns;
                const row = Math.floor(index / gridColumns);
                const localX = PAGE_PADDING + col * (CARD_WIDTH + GAP_X);
                const localY = PAGE_PADDING + row * (CARD_HEIGHT + GAP_Y);

                // --- Viewport Culling Logic ---
                // Convert page's local rect to world coordinates
                const worldX = (doc.x + localX) * studioViewScale + studioViewPosition.x;
                const worldY = (doc.y + localY) * studioViewScale + studioViewPosition.y;
                const worldW = CARD_WIDTH * studioViewScale;
                const worldH = CARD_HEIGHT * studioViewScale;

                // Add a buffer so pages don't pop in too abruptly while panning
                const visibleBufferX = viewportSize.width * 0.5;
                const visibleBufferY = viewportSize.height * 0.5;

                // Add a larger buffer for prefetching (load high res before it enters the visible buffer)
                const prefetchBufferX = viewportSize.width * 1.5;
                const prefetchBufferY = viewportSize.height * 1.5;

                // Check intersection with viewport (is it visible enough to mount the React component?)
                const isVisible =
                    (worldX + worldW + visibleBufferX) >= 0 &&
                    (worldX - visibleBufferX) <= viewportSize.width &&
                    (worldY + worldH + visibleBufferY) >= 0 &&
                    (worldY - visibleBufferY) <= viewportSize.height;

                // Check intersection with prefetch bounds
                const isNearViewport =
                    (worldX + worldW + prefetchBufferX) >= 0 &&
                    (worldX - prefetchBufferX) <= viewportSize.width &&
                    (worldY + worldH + prefetchBufferY) >= 0 &&
                    (worldY - prefetchBufferY) <= viewportSize.height;

                if (!isVisible && !isNearViewport) {
                    // Render simple placeholder box to maintain overall document layout
                    return null;
                }

                // If it is near the viewport but not visible, we mount it but tell it to only prefetch
                // We mount it so PageObject can handle its own prefetching in the background
                const shouldPrefetchOnly = !isVisible && isNearViewport;

                return (
                    <PageObject
                        key={page.id}
                        page={page}
                        docId={doc.id}
                        x={localX}
                        y={localY}
                        currentIndex={index}
                        shouldPrefetchOnly={shouldPrefetchOnly}
                    />
                );
            })}
        </Group>
    );
};
