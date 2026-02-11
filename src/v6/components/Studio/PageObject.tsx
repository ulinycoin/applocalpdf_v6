import React, { useRef } from 'react';
import { Group, Image, Rect, Text } from 'react-konva';
import Konva from 'konva';
import useImage from 'use-image';
import { PageItem, useStudioStore } from './studio-store';

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

// Define the StudioStore interface based on usage
interface StudioStore {
    updatePage: (docId: string, pageId: string, updates: Partial<PageItem>) => void;
    selection: SelectionItem[];
    setSelection: (selection: SelectionItem[]) => void;
    movePage: (sourceDocId: string, pageId: string, targetDocId: string, index?: number) => void;
}

export const PageObject: React.FC<PageObjectProps> = ({ page, docId, x, y, currentIndex }) => {
    const groupRef = useRef<Konva.Group>(null);
    const [image] = useImage(page.thumbnailUrl);
    const updatePage = useStudioStore((s: StudioStore) => s.updatePage);
    const selection = useStudioStore((s: StudioStore) => s.selection);
    const setSelection = useStudioStore((s: StudioStore) => s.setSelection);
    const isSelected = selection.some((s: SelectionItem) => s.pageId === page.id);

    const GRID_SIZE = 220;
    const snapToGrid = (val: number) => Math.round(val / GRID_SIZE) * GRID_SIZE;

    const movePage = useStudioStore((s: StudioStore) => s.movePage);

    const handleDragStart = (e: any) => {
        e.cancelBubble = true; // Don't drag the document
        const node = e.target;
        node.moveToTop(); // Bring to front
    };

    const handleDragEnd = (e: any) => {
        e.cancelBubble = true; // Prevent document from dragging when page is dragged
        const node = e.target;
        const stage = node.getStage();
        const pos = stage.getPointerPosition();

        if (!pos) return;

        // Find what is under the pointer
        const hit = stage.getIntersection(pos);
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

        if (targetDocId && targetDocNode) {
            const STEP = 200 + 20; // CARD_WIDTH + GAP

            // Get local position relative to the target document
            const transform = targetDocNode.getAbsoluteTransform().copy().invert();
            const localPos = transform.point(pos);

            // Calculate index based on local X position in the horizontal pages row
            const targetIndex = Math.max(0, Math.round(localPos.x / STEP));

            movePage(docId, page.id, targetDocId, targetIndex);
        } else {
            // Return to original position if not dropped on a document
            node.to({
                x, y, duration: 0.2, easing: Konva.Easings.EaseOut
            });
        }
    };

    const handleClick = (e: any) => {
        e.cancelBubble = true;
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
                    width={PAGE_WIDTH + 8}
                    height={PAGE_HEIGHT + 8}
                    x={-4}
                    y={-4}
                    fill="rgba(59, 130, 246, 0.4)"
                    cornerRadius={8}
                    filters={[]} // Can add Blur if needed
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
                stroke={isSelected ? "#3b82f6" : "transparent"}
                strokeWidth={2}
                cornerRadius={4}
            />
        </Group>
    );
};
