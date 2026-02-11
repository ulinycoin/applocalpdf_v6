import React from 'react';
import { Group, Rect, Text } from 'react-konva';
import { PageObject } from './PageObject';
import { StudioDocument as IStudioDocument, useStudioStore } from './studio-store';

interface StudioDocumentProps {
    doc: IStudioDocument;
}

export const StudioDocument: React.FC<StudioDocumentProps> = ({ doc }) => {
    const [isDropTarget, setIsDropTarget] = React.useState(false);
    const updateDocument = useStudioStore((s: any) => s.updateDocument);

    const handleDragEnd = (e: any) => {
        // ONLY handle if the document itself was dragged
        if (e.target.name() !== 'document') return;

        // Magnetic grid for the whole document
        const GRID_SIZE = 220;
        const newX = Math.round(e.target.x() / GRID_SIZE) * GRID_SIZE;
        const newY = Math.round(e.target.y() / GRID_SIZE) * GRID_SIZE;

        e.target.to({
            x: newX,
            y: newY,
            duration: 0.2
        });

        updateDocument(doc.id, { x: newX, y: newY });
    };

    const CARD_WIDTH = 200;
    const CARD_HEIGHT = 280;
    const GAP = 20;

    // Calculate doc bounds based on pages (Horizontal Layout)
    const width = doc.pages.length * (CARD_WIDTH + GAP);
    const height = CARD_HEIGHT + GAP;

    return (
        <Group
            x={doc.x}
            y={doc.y}
            draggable
            onDragEnd={handleDragEnd}
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
                fill={isDropTarget ? "rgba(59, 130, 246, 0.15)" : "rgba(59, 130, 246, 0.05)"}
                stroke={isDropTarget ? "rgba(59, 130, 246, 0.6)" : "rgba(59, 130, 246, 0.2)"}
                strokeWidth={isDropTarget ? 2 : 1}
                cornerRadius={12}
                shadowBlur={isDropTarget ? 15 : 0}
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
                />
                {/* Modified Indicator */}
                {doc.isModified && (
                    <Group x={doc.name.length * 8 + 15}>
                        <Rect width={65} height={18} fill="#3b82f6" cornerRadius={4} />
                        <Text text="MODIFIED" fill="white" fontSize={10} x={7} y={4} fontStyle="bold" />
                    </Group>
                )}
            </Group>

            {/* Horizontal Pages Row inside Document */}
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
