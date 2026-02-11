import React from 'react';
import { Group, Image, Rect, Text } from 'react-konva';
import type Konva from 'konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import useImage from 'use-image';
import { DetachedPageItem, StudioState, useStudioStore } from './studio-store';

interface DetachedPageObjectProps {
    page: DetachedPageItem;
}

export const DetachedPageObject: React.FC<DetachedPageObjectProps> = ({ page }) => {
    const [image] = useImage(page.thumbnailUrl);
    const attachDetachedPage = useStudioStore((s: StudioState) => s.attachDetachedPage);
    const moveDetachedPage = useStudioStore((s: StudioState) => s.moveDetachedPage);
    const activeDocumentId = useStudioStore((s: StudioState) => s.activeDocumentId);

    const handleDragEnd = (e: KonvaEventObject<DragEvent>) => {
        e.cancelBubble = true;
        const node = e.target;
        const stage = node.getStage();
        if (!stage) {
            return;
        }
        const pos = stage.getPointerPosition();
        if (!pos) {
            return;
        }

        node.hide();
        const hit = stage.getIntersection(pos);
        node.show();
        stage.batchDraw();

        let targetDocId: string | null = null;
        let targetDocNode: Konva.Group | null = null;

        if (hit) {
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
            const STEP = 200 + 20;
            const transform = targetDocNode.getAbsoluteTransform().copy().invert();
            const localPos = transform.point(pos);
            const targetIndex = Math.max(0, Math.round(localPos.x / STEP));
            attachDetachedPage(page.id, targetDocId, targetIndex);
            return;
        }

        const inverseTransform = stage.getAbsoluteTransform().copy().invert();
        const worldPos = inverseTransform.point(pos);
        moveDetachedPage(page.id, Math.max(80, worldPos.x - 90), Math.max(80, worldPos.y - 125));
    };

    return (
        <Group
            id={`detached-${page.id}`}
            name="detached-page-object"
            x={page.x}
            y={page.y}
            draggable
            onClick={(e) => {
                e.cancelBubble = true;
                if (!activeDocumentId) {
                    return;
                }
                attachDetachedPage(page.id, activeDocumentId);
            }}
            onDragStart={(e) => {
                e.cancelBubble = true;
                e.target.moveToTop();
            }}
            onDragEnd={handleDragEnd}
            rotation={page.rotation}
        >
            <Rect width={180} height={250} fill="white" shadowBlur={10} shadowOpacity={0.3} cornerRadius={4} />
            {image && (
                <Image
                    image={image}
                    width={180}
                    height={250}
                    cornerRadius={4}
                />
            )}
            <Group x={0} y={-24}>
                <Rect width={180} height={20} fill="rgba(15, 23, 42, 0.75)" cornerRadius={4} />
                <Text text="Detached: click to add" fill="#dbeafe" fontSize={11} x={8} y={4} />
            </Group>
            <Rect
                width={180}
                height={250}
                fill="transparent"
                stroke="rgba(147, 197, 253, 0.8)"
                strokeWidth={1.5}
                dash={[7, 5]}
                cornerRadius={4}
            />
        </Group>
    );
};
