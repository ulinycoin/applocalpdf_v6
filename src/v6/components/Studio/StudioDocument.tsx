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

    const handleDragEnd = (e: KonvaEventObject<DragEvent>) => {
        // ONLY handle if the document itself was dragged
        if (e.target.name() !== 'document') return;
        updateDocument(doc.id, { x: e.target.x(), y: e.target.y() });
    };

    const CARD_WIDTH = 200;
    const CARD_HEIGHT = 280;
    const GAP = 20;
    const MODIFIED_BADGE_WIDTH = 22;

    // Calculate doc bounds based on pages (Horizontal Layout)
    const width = Math.max(CARD_WIDTH + GAP, doc.pages.length * (CARD_WIDTH + GAP));
    const height = CARD_HEIGHT + GAP;
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
                fill={isDropTarget ? "rgba(59, 130, 246, 0.15)" : (isActiveDocument ? "rgba(59, 130, 246, 0.12)" : "rgba(59, 130, 246, 0.05)")}
                stroke={isDropTarget ? "rgba(59, 130, 246, 0.6)" : (isActiveDocument ? "rgba(96, 165, 250, 0.9)" : "rgba(59, 130, 246, 0.2)")}
                strokeWidth={isDropTarget || isActiveDocument ? 2 : 1}
                cornerRadius={12}
                shadowBlur={isDropTarget || isActiveDocument ? 15 : 0}
                shadowColor="#3b82f6"
                shadowOpacity={0.3}
            />
            {/* Document Label */}
            <Group y={-25}>
                <Text
                    text={doc.name}
                    fill="rgba(255,255,255,0.6)"
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

            {/* Horizontal Pages Row inside Document */}
            {doc.pages.length === 0 && (
                <Group x={10} y={10}>
                    <Rect
                        width={CARD_WIDTH}
                        height={CARD_HEIGHT}
                        stroke="rgba(148, 197, 253, 0.7)"
                        strokeWidth={1.5}
                        dash={[8, 6]}
                        cornerRadius={8}
                    />
                    <Text
                        text="Drop pages here"
                        fill="rgba(219, 234, 254, 0.92)"
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
                return (
                    <PageObject
                        key={page.id}
                        page={page}
                        docId={doc.id}
                        x={index * (CARD_WIDTH + GAP)}
                        y={0}
                        currentIndex={index}
                    />
                );
            })}
        </Group>
    );
};
