import { useEffect, useRef, useState, useMemo } from 'react';
import type Konva from 'konva';
import { useStudioStore, StudioState, PageItem } from './studio-store';
import { StudioPageEditor } from './StudioPageEditor';
import { EditElement, InlineUiState, TextEditorState } from './editor-types';
import { usePlatform } from '../../../app/react/platform-context';
import type { IWorkerCommand, WorkerStudioEditElement } from '../../../core/public/contracts';
import { defaultFilePreviewService } from '../../preview/preview-service';
import { detectStudioEditLocale, getStudioEditMessages } from './studio-edit-i18n';

interface StudioInPlaceEditorProps {
    stageRef: React.RefObject<Konva.Stage | null>;
}

export function StudioInPlaceEditor({ stageRef }: StudioInPlaceEditorProps) {
    const { runtime } = usePlatform();
    const activeEditPageId = useStudioStore((s: StudioState) => s.activeEditPageId);
    const editSession = useStudioStore((s: StudioState) => s.editSession);
    const documents = useStudioStore((s: StudioState) => s.documents);
    const updatePage = useStudioStore((s: StudioState) => s.updatePage);
    const clearEditSession = useStudioStore((s: StudioState) => s.clearEditSession);
    const setActiveEditPageId = useStudioStore((s: StudioState) => s.setActiveEditPageId);

    const [elements, setElements] = useState<EditElement[]>([]);
    const [overlayRect, setOverlayRect] = useState<{ x: number, y: number, w: number, h: number, scale: number } | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [message, setMessage] = useState<string | null>(null);

    const locale = useMemo(() => detectStudioEditLocale(), []);
    const ui = useMemo(() => getStudioEditMessages(locale), [locale]);

    const activePage = useMemo(() => {
        if (!activeEditPageId) return null;
        for (const doc of documents) {
            const page = doc.pages.find(p => p.id === activeEditPageId);
            if (page) return page;
        }
        return null;
    }, [activeEditPageId, documents]);

    // Sync loop using requestAnimationFrame
    useEffect(() => {
        if (!activeEditPageId || !stageRef.current) return;

        let rafId: number;
        const sync = () => {
            const stage = stageRef.current;
            if (!stage) return;
            const pageNode = stage.find('#' + activeEditPageId)[0];
            if (!pageNode) return;

            const box = pageNode.getClientRect();
            const stageScale = stage.scaleX();

            setOverlayRect({
                x: box.x,
                y: box.y,
                w: box.width,
                h: box.height,
                scale: stageScale // We might use this for high-quality text rendering
            });

            rafId = requestAnimationFrame(sync);
        };

        rafId = requestAnimationFrame(sync);
        return () => cancelAnimationFrame(rafId);
    }, [activeEditPageId, stageRef]);

    const handleSave = async () => {
        if (!activePage || isSaving) return;
        setIsSaving(true);
        try {
            const command: IWorkerCommand = {
                id: crypto.randomUUID(),
                type: 'COMMAND',
                payload: {
                    type: 'APPLY_STUDIO_TEXT_EDITS',
                    payload: {
                        fileId: activePage.fileId,
                        pageIndex: activePage.pageIndex,
                        elements: elements as WorkerStudioEditElement[],
                    },
                },
            };
            const finalEvent = await runtime.workerOrchestrator.dispatch(command);
            if (finalEvent.payload.type === 'STUDIO_TEXT_EDITS_APPLIED') {
                const preview = await defaultFilePreviewService.getPdfPagePreview(
                    runtime,
                    finalEvent.payload.payload.outputId,
                    activePage.pageIndex + 1,
                    { scale: 2 },
                );
                updatePage(editSession!.docId, activePage.id, {
                    fileId: finalEvent.payload.payload.outputId,
                    thumbnailUrl: preview?.thumbnailUrl ?? activePage.thumbnailUrl
                });
                handleCancel();
            }
        } catch (e) {
            setMessage(ui.saveFailed);
        } finally {
            setIsSaving(false);
        }
    };

    const handleCancel = () => {
        setActiveEditPageId(null);
        clearEditSession();
    };

    if (!activeEditPageId || !overlayRect || !activePage) return null;

    return (
        <div
            className="studio-inplace-editor-overlay"
            style={{
                position: 'fixed',
                left: overlayRect.x,
                top: overlayRect.y,
                width: overlayRect.w,
                height: overlayRect.h,
                zIndex: 1000,
                pointerEvents: 'none'
            }}
        >
            <div style={{ position: 'relative', width: '100%', height: '100%', pointerEvents: 'auto' }}>
                <StudioPageEditor
                    page={activePage}
                    width={overlayRect.w}
                    height={overlayRect.h}
                    activeTool={editSession?.activeTool ?? 'text'}
                    elements={elements}
                    onElementsChange={setElements}
                    onFinish={handleSave}
                    onDiscard={handleCancel}
                />

                {message && <div className="studio-inplace-error">{message}</div>}
            </div>

            {/* Global Escape Hatch (backdrop-like but transparent) */}
            <div
                style={{ position: 'fixed', inset: 0, zIndex: -1, pointerEvents: 'auto' }}
                onPointerDown={(e) => {
                    if (e.target === e.currentTarget) handleCancel();
                }}
            />
        </div>
    );
}
