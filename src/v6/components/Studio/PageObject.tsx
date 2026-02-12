import React, { useRef } from 'react';
import { Group, Image, Rect, Text } from 'react-konva';
import Konva from 'konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import useImage from 'use-image';
import { PageItem, StudioState, useStudioStore } from './studio-store';

interface PageObjectProps {
    page: PageItem;
    docId: string;
    x: number;
    y: number;
    currentIndex: number;
}

// Define the type for a selection item
interface SelectionItem {
    docId: string;
    pageId: string;
}

export const PageObject: React.FC<PageObjectProps> = ({ page, docId, x, y, currentIndex }) => {
    const groupRef = useRef<Konva.Group>(null);
    const [image] = useImage(page.thumbnailUrl);
    const documents = useStudioStore((s: StudioState) => s.documents);
    const detachPage = useStudioStore((s: StudioState) => s.detachPage);
    const selection = useStudioStore((s: StudioState) => s.selection);
    const setSelection = useStudioStore((s: StudioState) => s.setSelection);
    const setActiveDocument = useStudioStore((s: StudioState) => s.setActiveDocument);
    const isSelected = selection.some((s: SelectionItem) => s.pageId === page.id);

    const movePage = useStudioStore((s: StudioState) => s.movePage);

    const handleDragStart = (e: KonvaEventObject<DragEvent>) => {
        e.cancelBubble = true; // Don't drag the document
        const node = e.target;
        node.moveToTop(); // Bring to front
    };

    const handleDragEnd = (e: KonvaEventObject<DragEvent>) => {
        e.cancelBubble = true; // Prevent document from dragging when page is dragged
        const node = e.target;
        const stage = node.getStage();
        if (!stage) return;
        const pos = stage.getPointerPosition();

        if (!pos) return;
        const inverseTransform = stage.getAbsoluteTransform().copy().invert();
        const worldPos = inverseTransform.point(pos);

        // Ignore the dragged page itself to resolve drop target underneath.
        node.hide();
        const hit = stage.getIntersection(pos);
        node.show();
        stage.batchDraw();
        let targetDocId = null;
        let targetDocNode: Konva.Group | null = null;

        if (hit) {
            // Find the parent document group
            let parent = hit.getParent();
            while (parent && parent.attrs.name !== 'document') {
                parent = parent.getParent();
            }
            if (parent) {
                targetDocId = parent.attrs.id;
                targetDocNode = parent as Konva.Group;
            }

        }

        const sourceDoc = documents.find((doc) => doc.id === docId);
        const sourceDocWidth = Math.max(220, (sourceDoc?.pages.length ?? 1) * 220 + 20);
        const sourceMinX = (sourceDoc?.x ?? 0) - 12;
        const sourceMaxX = (sourceDoc?.x ?? 0) + sourceDocWidth + 12;
        const sourceMinY = (sourceDoc?.y ?? 0) - 32;
        const sourceMaxY = (sourceDoc?.y ?? 0) + 342;
        const droppedOutsideSourceDoc =
            !sourceDoc
            || worldPos.x < sourceMinX
            || worldPos.x > sourceMaxX
            || worldPos.y < sourceMinY
            || worldPos.y > sourceMaxY;

        if (targetDocId && targetDocNode && !(targetDocId === docId && droppedOutsideSourceDoc)) {
            const STEP = 200 + 20; // CARD_WIDTH + GAP

            // Get local position relative to the target document
            const transform = targetDocNode.getAbsoluteTransform().copy().invert();
            const localPos = transform.point(pos);

            // Calculate index based on local X position in the horizontal pages row
            const targetIndex = Math.max(0, Math.round(localPos.x / STEP));

            movePage(docId, page.id, targetDocId, targetIndex);
        } else {
            const detachedX = Number.isFinite(worldPos.x) ? Math.max(80, worldPos.x - 90) : x;
            const detachedY = Number.isFinite(worldPos.y) ? Math.max(80, worldPos.y - 125) : y;
            detachPage(docId, page.id, detachedX, detachedY);
        }
    };

    const handleClick = (e: KonvaEventObject<MouseEvent>) => {
        e.cancelBubble = true;
        setActiveDocument(docId);
        if (e.evt.shiftKey) {
            setSelection(isSelected
                ? selection.filter(s => s.pageId !== page.id)
                : [...selection, { docId, pageId: page.id }]);
        } else {
            setSelection([{ docId, pageId: page.id }]);
        }
    };

    const PAGE_WIDTH = 180;
    const PAGE_HEIGHT = 250;

    return (
        <Group
            ref={groupRef}
            id={page.id}
            name="page-object"
            x={x}
            y={y}
            draggable
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onClick={handleClick}
            rotation={page.rotation}
        >
            {/* Shadow/Glow for selection */}
            {isSelected && (
                <Rect
                    width={PAGE_WIDTH + 20}
                    height={PAGE_HEIGHT + 20}
                    x={-10}
                    y={-10}
                    fill="rgba(56, 189, 248, 0.42)"
                    stroke="rgba(125, 211, 252, 0.95)"
                    strokeWidth={3}
                    cornerRadius={12}
                    shadowColor="#38bdf8"
                    shadowBlur={24}
                    shadowOpacity={0.9}
                />
            )}

            {/* Page Content */}
            <Rect
                width={PAGE_WIDTH}
                height={PAGE_HEIGHT}
                fill="white"
                shadowBlur={10}
                shadowOpacity={0.3}
                cornerRadius={4}
            />
            {image && (
                <Image
                    image={image}
                    width={PAGE_WIDTH}
                    height={PAGE_HEIGHT}
                    imageSmoothingEnabled={false}
                    cornerRadius={4}
                />
            )}

            {/* Page Number Badge */}
            <Group x={PAGE_WIDTH - 24} y={PAGE_HEIGHT - 24}>
                <Rect width={20} height={20} fill="rgba(0,0,0,0.6)" cornerRadius={4} />
                <Text
                    text={`${currentIndex + 1}`}
                    fill="white"
                    fontSize={10}
                    x={5}
                    y={5}
                    align="center"
                />
            </Group>

            {/* Interactions Overlay */}
            <Rect
                width={PAGE_WIDTH}
                height={PAGE_HEIGHT}
                fill="transparent"
                stroke={isSelected ? "#7dd3fc" : "transparent"}
                strokeWidth={isSelected ? 3 : 2}
                cornerRadius={4}
            />
        </Group>
    );
};
