import React from 'react';
import { Group, Rect, Text } from 'react-konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import { PageObject } from './PageObject';
import { StudioDocument as IStudioDocument, StudioState, useStudioStore } from './studio-store';

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

    const handleDragEnd = (e: KonvaEventObject<DragEvent>) => {
        // ONLY handle if the document itself was dragged
        if (e.target.name() !== 'document') return;
        updateDocument(doc.id, { x: e.target.x(), y: e.target.y() });
    };

    const CARD_WIDTH = 200;
    const CARD_HEIGHT = 280;
    const GAP_X = 20;
    const GAP_Y = 30;
    const MODIFIED_BADGE_WIDTH = 22;

    // Calculate grid dimensions
    const cols = Math.min(doc.pages.length || 1, gridColumns);
    const rows = Math.ceil(doc.pages.length / cols) || 1;

    // Bounds based on grid Layout
    const width = Math.max(CARD_WIDTH + GAP_X, cols * (CARD_WIDTH + GAP_X));
    const height = rows * (CARD_HEIGHT + GAP_Y);
    const labelMaxWidth = Math.max(120, width - (doc.isModified ? MODIFIED_BADGE_WIDTH + 12 : 0));

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
            {/* Hit Area & Background */}
            <Rect
                width={width + 20}
                height={height + 40}
                x={-10}
                y={-30}
                fillLinearGradientStartPoint={{ x: -10, y: -30 }}
                fillLinearGradientEndPoint={{ x: width + 10, y: height + 10 }}
                fillLinearGradientColorStops={
                    isDropTarget
                        ? [0, 'rgba(255, 255, 255, 0.12)', 1, 'rgba(28, 52, 74, 0.3)']
                        : isActiveDocument
                            ? [0, 'rgba(255, 255, 255, 0.1)', 1, 'rgba(28, 52, 74, 0.24)']
                            : [0, 'rgba(255, 255, 255, 0.08)', 1, 'rgba(28, 52, 74, 0.18)']
                }
                stroke={isDropTarget ? "rgba(255, 255, 255, 0.28)" : (isActiveDocument ? "rgba(255, 255, 255, 0.2)" : "rgba(255, 255, 255, 0.12)")}
                strokeWidth={isDropTarget || isActiveDocument ? 2 : 1}
                cornerRadius={16}
                shadowBlur={isDropTarget || isActiveDocument ? 24 : 14}
                shadowColor="rgba(4, 12, 20, 0.9)"
                shadowOpacity={isDropTarget || isActiveDocument ? 0.3 : 0.18}
                shadowOffset={{ x: 0, y: 12 }}
            />
            {/* Document Label */}
            <Group
                y={-25}
                onClick={(e) => {
                    e.cancelBubble = true;
                    const userInput = window.prompt('Enter new name for the workspace:', doc.name);
                    if (userInput !== null) {
                        const newName = userInput.trim();
                        if (newName) {
                            updateDocument(doc.id, { name: newName });
                        }
                    }
                }}
                style={{ cursor: 'pointer' }}
            >
                <Text
                    text={doc.name}
                    fill="rgba(255,255,255,0.8)"
                    fontSize={14}
                    fontStyle="bold"
                    width={labelMaxWidth}
                    wrap="none"
                    ellipsis
                />
                {/* Modified Indicator */}
                {doc.isModified && (
                    <Group x={labelMaxWidth + 8}>
                        <Rect width={22} height={18} fill="#22c55e" cornerRadius={4} />
                        <Text text="M" fill="white" fontSize={11} x={7} y={3} fontStyle="bold" />
                    </Group>
                )}
            </Group>

            {/* Grid Pages Row inside Document with Viewport Culling */}
            {doc.pages.length === 0 && (
                <Group x={10} y={10}>
                    <Rect
                        width={CARD_WIDTH}
                        height={CARD_HEIGHT}
                        fillLinearGradientStartPoint={{ x: 10, y: 10 }}
                        fillLinearGradientEndPoint={{ x: CARD_WIDTH + 10, y: CARD_HEIGHT + 10 }}
                        fillLinearGradientColorStops={[0, 'rgba(255, 255, 255, 0.06)', 1, 'rgba(28, 52, 74, 0.16)']}
                        stroke="rgba(255, 255, 255, 0.26)"
                        strokeWidth={1.5}
                        dash={[8, 6]}
                        cornerRadius={12}
                    />
                    <Text
                        text="Drop pages here"
                        fill="rgba(241, 245, 249, 0.82)"
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
                const localX = col * (CARD_WIDTH + GAP_X);
                const localY = row * (CARD_HEIGHT + GAP_Y);

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
