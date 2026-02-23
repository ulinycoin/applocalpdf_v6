import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePlatform } from '../../../../app/react/platform-context';
import type { IWorkerCommand, WorkerStudioEditElement } from '../../../../core/public/contracts';
import { defaultFilePreviewService } from '../../../preview/preview-service';
import {
    useStudioStore,
    type PageItem,
    type StudioDocument,
    type StudioEditToolId,
    type SaveCheckpointEntry,
} from '../studio-store';
import { requestTextLayerSpans, requestTextLayerSpansFallback } from '../../../services/pdf-text-layer.service';
import { CommandExecutor, type AnyCommand } from '../store/command-manager';
const USE_COMMAND_PATTERN_FOR_SAVES = true;
import {
    EditElement,
    TextEditorState,
    InlineUiState,
    TextLayerSpan,
    EditorToolId
} from '../editor-types';

export interface SelectedPage {
    docId: string;
    docName: string;
    page: PageItem;
    indexInDoc: number;
}

function buildSelectedPages(
    documents: StudioDocument[],
    selection: Array<{ docId: string; pageId: string }>,
): SelectedPage[] {
    const out: SelectedPage[] = [];
    for (const selected of selection) {
        const doc = documents.find((item) => item.id === selected.docId);
        if (!doc) continue;
        const indexInDoc = doc.pages.findIndex((page) => page.id === selected.pageId);
        if (indexInDoc < 0) continue;
        out.push({
            docId: doc.id,
            docName: doc.name,
            page: doc.pages[indexInDoc],
            indexInDoc,
        });
    }
    return out;
}

export function useStudioEditController(ui: any) {
    const navigate = useNavigate();
    const { runtime } = usePlatform();

    // Store reads
    const documents = useStudioStore((s) => s.documents);
    const selection = useStudioStore((s) => s.selection);
    const activeDocumentId = useStudioStore((s) => s.activeDocumentId);
    const updatePage = useStudioStore((s) => s.updatePage);
    const editSession = useStudioStore((s) => s.editSession);
    const clearEditSession = useStudioStore((s) => s.clearEditSession);
    const updateEditSessionTool = useStudioStore((s) => s.updateEditSessionTool);
    const syncEditSessionTarget = useStudioStore((s) => s.syncEditSessionTarget);

    const saveUndoStack = useStudioStore((s) => s.saveUndoStack);
    const saveRedoStack = useStudioStore((s) => s.saveRedoStack);
    const pushSaveUndo = useStudioStore((s) => s.pushSaveUndo);
    const popSaveUndo = useStudioStore((s) => s.popSaveUndo);
    const pushSaveRedo = useStudioStore((s) => s.pushSaveRedo);
    const popSaveRedo = useStudioStore((s) => s.popSaveRedo);
    const clearSaveStacks = useStudioStore((s) => s.clearSaveStacks);

    const commandUndoStack = useStudioStore((s) => s.commandUndoStack);
    const commandRedoStack = useStudioStore((s) => s.commandRedoStack);
    const pushCommandUndo = useStudioStore((s) => s.pushCommandUndo);
    const popCommandUndo = useStudioStore((s) => s.popCommandUndo);
    const pushCommandRedo = useStudioStore((s) => s.pushCommandRedo);
    const popCommandRedo = useStudioStore((s) => s.popCommandRedo);

    // Local State
    const [tool, setTool] = useState<EditorToolId>(editSession?.activeTool ?? 'text');
    const [elements, setElements] = useState<EditElement[]>([]);
    const [history, setHistory] = useState<EditElement[][]>([[]]);
    const [historyIndex, setHistoryIndex] = useState(0);
    const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
    const [message, setMessage] = useState<string | null>(null);
    const [isApplying, setIsApplying] = useState(false);
    const [textEditor, setTextEditor] = useState<TextEditorState | null>(null);
    const [inlineUiState, setInlineUiState] = useState<InlineUiState>('idle');
    const [textLayerSpans, setTextLayerSpans] = useState<TextLayerSpan[]>([]);
    const [zoomLevel, setZoomLevel] = useState(1);
    const [isSelectMode, setIsSelectMode] = useState(false);
    const [textSelectionMode, setTextSelectionMode] = useState<'line' | 'word'>('line');
    const [applyToSelection, setApplyToSelection] = useState(true);

    const selectedPages = useMemo(() => buildSelectedPages(documents, selection), [documents, selection]);
    const activeDocument = useMemo(() => documents.find((doc) => doc.id === activeDocumentId) ?? null, [activeDocumentId, documents]);

    const preview = useMemo(() => {
        if (editSession) {
            const sessionDoc = documents.find((doc) => doc.id === editSession.docId);
            const sessionPage = sessionDoc?.pages.find((page) => page.id === editSession.pageId);
            const sessionIndexInDoc = sessionPage ? sessionDoc?.pages.findIndex((page) => page.id === sessionPage.id) ?? -1 : -1;
            if (sessionDoc && sessionPage && sessionIndexInDoc >= 0) {
                return { docId: sessionDoc.id, docName: sessionDoc.name, page: sessionPage, indexInDoc: sessionIndexInDoc };
            }
        }
        if (selectedPages[0]) return selectedPages[0];
        if (activeDocument && activeDocument.pages[0]) {
            return { docId: activeDocument.id, docName: activeDocument.name, page: activeDocument.pages[0], indexInDoc: 0 };
        }
        return null;
    }, [activeDocument, documents, editSession, selectedPages]);

    const canApplyToSelection = selectedPages.length > 1;

    useEffect(() => {
        if (editSession?.activeTool && editSession.activeTool !== tool) setTool(editSession.activeTool);
    }, [editSession?.activeTool, tool]);

    useEffect(() => {
        if (!preview) return;
        syncEditSessionTarget({
            docId: preview.docId,
            pageId: preview.page.id,
            pageIndex: preview.page.pageIndex,
            workingFileId: preview.page.fileId,
        });
    }, [preview?.docId, preview?.page.fileId, preview?.page.id, preview?.page.pageIndex, syncEditSessionTarget]);

    useEffect(() => {
        if (!canApplyToSelection && applyToSelection) {
            setApplyToSelection(false);
            return;
        }
        if (canApplyToSelection && !applyToSelection) setApplyToSelection(true);
    }, [applyToSelection, canApplyToSelection]);

    const selectTool = useCallback((nextTool: StudioEditToolId) => {
        setTool(nextTool);
        updateEditSessionTool(nextTool);
    }, [updateEditSessionTool]);

    const hasDirtyChanges = historyIndex > 0 || Boolean(textEditor && textEditor.value !== textEditor.initialValue);

    useEffect(() => {
        const onBeforeUnload = (event: BeforeUnloadEvent) => {
            if (!hasDirtyChanges) return;
            event.preventDefault();
            event.returnValue = '';
        };
        window.addEventListener('beforeunload', onBeforeUnload);
        return () => window.removeEventListener('beforeunload', onBeforeUnload);
    }, [hasDirtyChanges]);

    useEffect(() => {
        setElements([]);
        setHistory([[]]);
        setHistoryIndex(0);
        setSelectedElementId(null);
        setTextEditor(null);
        setInlineUiState('idle');
        clearSaveStacks();
    }, [preview?.page.id, preview?.page.pageIndex, clearSaveStacks]);

    useEffect(() => {
        if (!preview) return;
        const abortController = new AbortController();
        void (async () => {
            try {
                const workerSpans = await requestTextLayerSpans(runtime, preview.page.fileId, preview.page.pageIndex + 1, abortController.signal);
                if (abortController.signal.aborted) return;
                const spans = workerSpans.length > 0 ? workerSpans : await requestTextLayerSpansFallback(runtime, preview.page.fileId, preview.page.pageIndex + 1);
                if (abortController.signal.aborted) return;
                setTextLayerSpans(spans);
                if (spans.length === 0) setMessage(ui.noTextLayer);
            } catch (error) {
                if (abortController.signal.aborted) return;
                try {
                    const fallbackSpans = await requestTextLayerSpansFallback(runtime, preview.page.fileId, preview.page.pageIndex + 1);
                    if (abortController.signal.aborted) return;
                    setTextLayerSpans(fallbackSpans);
                    if (fallbackSpans.length === 0) setMessage(ui.noTextLayer);
                } catch (fallbackError) {
                    if (abortController.signal.aborted) return;
                    setMessage(ui.noTextLayer);
                }
            }
        })();
        return () => abortController.abort();
    }, [preview?.page.id, preview?.page.fileId, preview?.page.pageIndex, runtime, ui.noTextLayer]);

    const pushHistory = useCallback((next: EditElement[]) => {
        setHistory((prev) => {
            const trimmed = prev.slice(0, historyIndex + 1);
            return [...trimmed, next];
        });
        setHistoryIndex((prev) => prev + 1);
    }, [historyIndex]);

    const undo = useCallback(() => {
        if (historyIndex <= 0) return;
        const nextIndex = historyIndex - 1;
        setHistoryIndex(nextIndex);
        setElements(history[nextIndex] ?? []);
        setSelectedElementId(null);
        setTextEditor(null);
    }, [history, historyIndex]);

    const redo = useCallback(() => {
        if (historyIndex >= history.length - 1) return;
        const nextIndex = historyIndex + 1;
        setHistoryIndex(nextIndex);
        setElements(history[nextIndex] ?? []);
        setSelectedElementId(null);
        setTextEditor(null);
    }, [history, historyIndex]);

    const deleteSelected = useCallback(() => {
        if (!selectedElementId) return;
        const next = elements.filter((item) => item.id !== selectedElementId);
        setElements(next);
        pushHistory(next);
        setSelectedElementId(null);
        setTextEditor(null);
    }, [elements, pushHistory, selectedElementId]);

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if ((event.key === 'Delete' || event.key === 'Backspace') && !textEditor) deleteSelected();
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
                event.preventDefault();
                event.shiftKey ? redo() : undo();
            }
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [deleteSelected, redo, textEditor, undo]);

    const handleElementAction = useCallback((id: string, action: 'delete' | 'duplicate' | 'update', patch?: any) => {
        if (action === 'delete') {
            const next = elements.filter(el => el.id !== id);
            setElements(next);
            pushHistory(next);
            setSelectedElementId(null);
        } else if (action === 'duplicate') {
            const el = elements.find(e => e.id === id);
            if (el) {
                const nextX = ('x' in el) ? el.x + 0.02 : 0;
                const nextY = ('y' in el) ? el.y + 0.02 : 0;
                const next = [...elements, { ...el, id: crypto.randomUUID(), ...(('x' in el) ? { x: nextX, y: nextY } : {}) } as EditElement];
                setElements(next);
                pushHistory(next);
            }
        } else if (action === 'update' && patch) {
            setElements(elements.map(el => el.id === id ? { ...el, ...patch } : el));
        }
    }, [elements, pushHistory]);

    const commitTextEditor = useCallback(() => {
        if (!textEditor) return;
        if (textEditor.value !== textEditor.initialValue) pushHistory(elements);
        setInlineUiState(selectedElementId ? 'selected' : 'idle');
        setTextEditor(null);
    }, [elements, pushHistory, selectedElementId, textEditor]);

    const applyChanges = async () => {
        if (!preview) return;
        const targets = applyToSelection && canApplyToSelection ? selectedPages : [preview];
        let overflowCount = 0;
        let failureCount = 0;
        setIsApplying(true);
        setInlineUiState('saving');
        setMessage(null);
        const runId = crypto.randomUUID();
        try {
            const failureDetails: string[] = [];
            const checkpointEntries: SaveCheckpointEntry[] = [];

            for (const target of targets) {
                try {
                    const prevFileId = target.page.fileId;
                    const prevThumbnailUrl = target.page.thumbnailUrl;
                    const command: IWorkerCommand = {
                        id: crypto.randomUUID(),
                        type: 'COMMAND',
                        payload: {
                            type: 'APPLY_STUDIO_TEXT_EDITS',
                            payload: { fileId: target.page.fileId, pageIndex: target.page.pageIndex, elements: elements as WorkerStudioEditElement[] },
                        },
                    };
                    const finalEvent = await runtime.workerOrchestrator.dispatch(command);
                    if (finalEvent.payload.type === 'ERROR') {
                        const error = new Error(finalEvent.payload.payload.message) as Error & { code?: string };
                        error.code = finalEvent.payload.payload.code;
                        throw error;
                    }
                    if (finalEvent.payload.type !== 'STUDIO_TEXT_EDITS_APPLIED') throw new Error('Unexpected worker response for studio text edits');
                    if (finalEvent.payload.payload.overflowDetected) overflowCount += 1;
                    if (!finalEvent.payload.payload.trueReplaceApplied && finalEvent.payload.payload.trueReplaceFallbackReason) {
                        runtime.telemetry.track({
                            type: 'STUDIO_EDIT_GUARDRAIL', runId, toolId: 'studio.edit.text', fileId: target.page.fileId, pageIndex: target.page.pageIndex,
                            code: `STUDIO_TRUE_REPLACE_FALLBACK_${finalEvent.payload.payload.trueReplaceFallbackReason}`, message: 'True replace fallback path used',
                        });
                    }
                    const previewPromise = defaultFilePreviewService.getPdfPagePreview(runtime, finalEvent.payload.payload.outputId, target.page.pageIndex + 1, { scale: 2 });
                    const previewData = await Promise.race([previewPromise, new Promise<null>((resolve) => setTimeout(() => resolve(null), 8000))]);
                    const nextThumbnailUrl = previewData?.thumbnailUrl ?? target.page.thumbnailUrl;
                    updatePage(target.docId, target.page.id, { fileId: finalEvent.payload.payload.outputId, pageIndex: target.page.pageIndex, thumbnailUrl: nextThumbnailUrl });
                    checkpointEntries.push({ docId: target.docId, pageId: target.page.id, pageIndex: target.page.pageIndex, prevFileId, prevThumbnailUrl, nextFileId: finalEvent.payload.payload.outputId, nextThumbnailUrl });
                } catch (targetError) {
                    failureCount += 1;
                    const details = targetError instanceof Error ? targetError.message : ui.saveFailed;
                    const typed = targetError as { code?: unknown; message?: unknown };
                    const code = typeof typed.code === 'string' ? typed.code : undefined;
                    if (code?.startsWith('STUDIO_EDIT_')) {
                        runtime.telemetry.track({ type: 'STUDIO_EDIT_GUARDRAIL', runId, toolId: 'studio.edit.text', fileId: target.page.fileId, pageIndex: target.page.pageIndex, code, message: typeof typed.message === 'string' ? typed.message : details });
                    }
                    failureDetails.push(details);
                }
            }
            if (failureCount > 0 && failureCount === targets.length) throw new Error(failureDetails[0] ?? ui.saveFailed);

            setInlineUiState(failureCount > 0 ? 'error' : 'saved');
            setTextEditor(null);
            setSelectedElementId(null);
            setHistory([elements]);
            setHistoryIndex(0);
            if (checkpointEntries.length > 0) {
                if (USE_COMMAND_PATTERN_FOR_SAVES) {
                    pushCommandUndo({
                        id: crypto.randomUUID(),
                        type: 'APPLY_TEXT_EDITS',
                        timestamp: Date.now(),
                        payload: { entries: checkpointEntries }
                    });
                } else {
                    pushSaveUndo({ entries: checkpointEntries });
                }
            }

            runtime.telemetry.track({
                type: 'STUDIO_EDIT_SAVE_ACTION', runId, toolId: 'studio.edit.text', action: 'apply', scope: targets.length > 1 ? 'selection' : 'single',
                pagesTotal: targets.length, pagesSucceeded: targets.length - failureCount, pagesFailed: failureCount, overflowCount, message: failureCount > 0 ? ui.partialSaveFailed : ui.changesApplied,
            });

            if (targets.length > 1) {
                const baseMessage = `${ui.changesAppliedSelection} ${targets.length}`;
                const overflowMessage = overflowCount > 0 ? ` ${ui.overflowWarning}` : '';
                const partialMessage = failureCount > 0 ? ` ${ui.partialSaveFailed}` : '';
                setMessage(`${baseMessage}.${overflowMessage}${partialMessage}`.trim());
            } else {
                setMessage(overflowCount > 0 ? `${ui.changesApplied} ${ui.overflowWarning}` : ui.changesApplied);
            }
        } catch (error) {
            setInlineUiState('error');
            const details = error instanceof Error ? error.message : ui.saveFailed;
            const pagesFailed = failureCount > 0 ? failureCount : targets.length;
            const typed = error as { code?: unknown; message?: unknown };
            const code = typeof typed.code === 'string' ? typed.code : undefined;
            if (code?.startsWith('STUDIO_EDIT_')) runtime.telemetry.track({ type: 'STUDIO_EDIT_GUARDRAIL', runId, toolId: 'studio.edit.text', fileId: preview.page.fileId, pageIndex: preview.page.pageIndex, code, message: typeof typed.message === 'string' ? typed.message : details });
            runtime.telemetry.track({ type: 'STUDIO_EDIT_SAVE_ACTION', runId, toolId: 'studio.edit.text', action: 'apply', scope: targets.length > 1 ? 'selection' : 'single', pagesTotal: targets.length, pagesSucceeded: Math.max(0, targets.length - pagesFailed), pagesFailed, overflowCount, message: details });
            setMessage(`${ui.saveFailed}${details ? ` ${details}` : ''}`.trim());
        } finally {
            setIsApplying(false);
        }
    };

    const undoLastSave = useCallback(() => {
        if (USE_COMMAND_PATTERN_FOR_SAVES) {
            const command = popCommandUndo();
            if (!command || isApplying) return;
            const runId = crypto.randomUUID();
            setIsApplying(true);
            try {
                CommandExecutor.undo(command, updatePage);
                pushCommandRedo(command);
                setMessage(ui.saveReverted);
                setInlineUiState('saved');
                runtime.telemetry.track({ type: 'STUDIO_EDIT_SAVE_ACTION', runId, toolId: 'studio.edit.text', action: 'undo', scope: command.payload.entries.length > 1 ? 'selection' : 'single', pagesTotal: command.payload.entries.length, pagesSucceeded: command.payload.entries.length, pagesFailed: 0, message: ui.saveReverted });
            } finally {
                setIsApplying(false);
            }
        } else {
            const checkpoint = popSaveUndo();
            if (!checkpoint || isApplying) return;
            const runId = crypto.randomUUID();
            setIsApplying(true);
            try {
                for (const entry of checkpoint.entries) updatePage(entry.docId, entry.pageId, { fileId: entry.prevFileId, pageIndex: entry.pageIndex, thumbnailUrl: entry.prevThumbnailUrl });
                pushSaveRedo(checkpoint);
                setMessage(ui.saveReverted);
                setInlineUiState('saved');
                runtime.telemetry.track({ type: 'STUDIO_EDIT_SAVE_ACTION', runId, toolId: 'studio.edit.text', action: 'undo', scope: checkpoint.entries.length > 1 ? 'selection' : 'single', pagesTotal: checkpoint.entries.length, pagesSucceeded: checkpoint.entries.length, pagesFailed: 0, message: ui.saveReverted });
            } finally {
                setIsApplying(false);
            }
        }
    }, [popCommandUndo, pushCommandRedo, popSaveUndo, pushSaveRedo, isApplying, runtime, ui.saveReverted, updatePage]);

    const redoLastSave = useCallback(() => {
        if (USE_COMMAND_PATTERN_FOR_SAVES) {
            const command = popCommandRedo();
            if (!command || isApplying) return;
            pushCommandUndo(command);
            const runId = crypto.randomUUID();
            setIsApplying(true);
            try {
                CommandExecutor.execute(command, updatePage);
                setMessage(command.payload.entries.length > 1 ? `${ui.changesAppliedSelection} ${command.payload.entries.length}.` : ui.changesApplied);
                setInlineUiState('saved');
                runtime.telemetry.track({ type: 'STUDIO_EDIT_SAVE_ACTION', runId, toolId: 'studio.edit.text', action: 'redo', scope: command.payload.entries.length > 1 ? 'selection' : 'single', pagesTotal: command.payload.entries.length, pagesSucceeded: command.payload.entries.length, pagesFailed: 0, message: command.payload.entries.length > 1 ? `${ui.changesAppliedSelection} ${command.payload.entries.length}.` : ui.changesApplied });
            } finally {
                setIsApplying(false);
            }
        } else {
            const checkpoint = popSaveRedo();
            if (!checkpoint) return;
            pushSaveUndo(checkpoint);
            const runId = crypto.randomUUID();
            setIsApplying(true);
            try {
                for (const entry of checkpoint.entries) updatePage(entry.docId, entry.pageId, { fileId: entry.nextFileId, pageIndex: entry.pageIndex, thumbnailUrl: entry.nextThumbnailUrl });
                setMessage(checkpoint.entries.length > 1 ? `${ui.changesAppliedSelection} ${checkpoint.entries.length}.` : ui.changesApplied);
                setInlineUiState('saved');
                runtime.telemetry.track({ type: 'STUDIO_EDIT_SAVE_ACTION', runId, toolId: 'studio.edit.text', action: 'redo', scope: checkpoint.entries.length > 1 ? 'selection' : 'single', pagesTotal: checkpoint.entries.length, pagesSucceeded: checkpoint.entries.length, pagesFailed: 0, message: checkpoint.entries.length > 1 ? `${ui.changesAppliedSelection} ${checkpoint.entries.length}.` : ui.changesApplied });
            } finally {
                setIsApplying(false);
            }
        }
    }, [popCommandRedo, pushCommandUndo, popSaveRedo, pushSaveUndo, runtime, ui.changesApplied, ui.changesAppliedSelection, updatePage]);

    return {
        navigate,
        tool, setTool: selectTool,
        elements, setElements,
        pushHistory, undo, redo,
        history, historyIndex,
        selectedElementId, setSelectedElementId, handleElementAction,
        message, setMessage,
        isApplying,
        textEditor, setTextEditor, commitTextEditor,
        inlineUiState, setInlineUiState,
        textLayerSpans,
        zoomLevel, setZoomLevel,
        isSelectMode, setIsSelectMode,
        textSelectionMode, setTextSelectionMode,
        applyToSelection, setApplyToSelection,
        hasDirtyChanges, canApplyToSelection,
        applyChanges, undoLastSave, redoLastSave,
        clearEditSession,
        preview, selectedPages, activeDocument,
        saveUndoStack: USE_COMMAND_PATTERN_FOR_SAVES ? commandUndoStack : saveUndoStack,
        saveRedoStack: USE_COMMAND_PATTERN_FOR_SAVES ? commandRedoStack : saveRedoStack,
    };
}
