import { create } from 'zustand';
import type { IWorkspaceSnapshot, ITimelineEvent, TimelineEventType } from './studio-store-types';
import { useDocumentStore } from './document-store';
import { useUIStore } from './ui-store';
import { useEditSessionStore } from './session-store';
import type { IFileSystem } from '../../../../core/public';

export interface HistoryState {
    timeline: ITimelineEvent[];
    historyIndex: number;
    maxCheckpoints: number;

    recordEvent: (type: TimelineEventType, label: string) => void;
    createCheckpoint: (vfs: IFileSystem, type: TimelineEventType, label: string, isManualVersion?: boolean) => Promise<void>;
    restoreCheckpoint: (index: number) => void;
    pruneHistory: (vfs: IFileSystem) => Promise<void>;
    clearHistory: (vfs: IFileSystem) => Promise<void>;
}

function getFileIdsFromSnapshot(snapshot: IWorkspaceSnapshot): Set<string> {
    const ids = new Set<string>();
    for (const doc of snapshot.documents) {
        for (const page of doc.pages) {
            ids.add(page.fileId);
        }
    }
    for (const page of snapshot.detachedPages) {
        ids.add(page.fileId);
    }
    return ids;
}

function cloneSnapshot(snapshot: IWorkspaceSnapshot): IWorkspaceSnapshot {
    return {
        documents: JSON.parse(JSON.stringify(snapshot.documents)),
        detachedPages: JSON.parse(JSON.stringify(snapshot.detachedPages)),
        activeDocumentId: snapshot.activeDocumentId,
        activeEditPageId: snapshot.activeEditPageId,
        requestedInlineTool: snapshot.requestedInlineTool,
        operationScope: snapshot.operationScope,
        viewScale: snapshot.viewScale,
        viewPosition: JSON.parse(JSON.stringify(snapshot.viewPosition)),
        selection: JSON.parse(JSON.stringify(snapshot.selection)),
        interactionMode: snapshot.interactionMode,
    };
}

async function unpinSnapshotFiles(vfs: IFileSystem, snapshot: IWorkspaceSnapshot): Promise<void> {
    if (!vfs.unpin) {
        return;
    }

    const fileIds = getFileIdsFromSnapshot(snapshot);
    for (const fileId of fileIds) {
        await vfs.unpin(fileId).catch(console.warn);
    }
}

function captureSnapshot(): IWorkspaceSnapshot {
    const docState = useDocumentStore.getState();
    const uiState = useUIStore.getState();

    return cloneSnapshot({
        documents: docState.documents,
        detachedPages: docState.detachedPages,
        activeDocumentId: uiState.activeDocumentId,
        activeEditPageId: uiState.activeEditPageId,
        requestedInlineTool: uiState.requestedInlineTool,
        operationScope: uiState.operationScope,
        viewScale: uiState.studioViewScale,
        viewPosition: uiState.studioViewPosition,
        selection: uiState.selection,
        interactionMode: uiState.interactionMode,
    });
}

export const useHistoryStore = create<HistoryState>((set, get) => ({
    timeline: [],
    historyIndex: -1,
    maxCheckpoints: 20,

    recordEvent: (type, label) => {
        set((state) => {
            const newTimeline = state.timeline.slice(0, state.historyIndex + 1);
            newTimeline.push({
                id: crypto.randomUUID(),
                type,
                label,
                timestamp: Date.now(),
            });
            return { timeline: newTimeline, historyIndex: newTimeline.length - 1 };
        });
    },

    createCheckpoint: async (vfs, type, label, isManualVersion) => {
        const state = get();
        const futureEvents = state.timeline.slice(state.historyIndex + 1);
        for (const event of futureEvents) {
            if (event.snapshot) {
                await unpinSnapshotFiles(vfs, event.snapshot);
            }
        }

        const snapshot = captureSnapshot();
        const fileIdsToPin = getFileIdsFromSnapshot(snapshot);
        for (const fileId of fileIdsToPin) {
            await vfs.pin(fileId).catch(console.warn);
        }

        set((state) => {
            const newTimeline = state.timeline.slice(0, state.historyIndex + 1);
            newTimeline.push({
                id: crypto.randomUUID(),
                type,
                label,
                timestamp: Date.now(),
                snapshot,
                isManualVersion,
            });
            return { timeline: newTimeline, historyIndex: newTimeline.length - 1 };
        });

        await get().pruneHistory(vfs);
    },

    restoreCheckpoint: (index) => {
        const { timeline, historyIndex } = get();
        if (index < 0 || index >= timeline.length || index === historyIndex) {
            return;
        }

        const event = timeline[index];
        if (!event.snapshot) {
            console.warn('Cannot restore an event without a snapshot');
            return;
        }

        const snap = cloneSnapshot(event.snapshot);

        useDocumentStore.setState((state) => ({
            ...state,
            documents: snap.documents,
            detachedPages: snap.detachedPages,
            workspaceVersion: state.workspaceVersion + 1,
        }));

        useUIStore.setState({
            activeDocumentId: snap.activeDocumentId,
            activeEditPageId: snap.activeEditPageId,
            requestedInlineTool: snap.requestedInlineTool,
            operationScope: snap.operationScope,
            studioViewScale: snap.viewScale,
            studioViewPosition: snap.viewPosition,
            selection: snap.selection,
            interactionMode: snap.interactionMode,
        });

        useEditSessionStore.getState().clearSession();

        set({ historyIndex: index });
    },

    pruneHistory: async (vfs) => {
        const state = get();
        if (state.timeline.length <= state.maxCheckpoints) {
            return;
        }

        const newTimeline = [...state.timeline];
        const numToRemove = newTimeline.length - state.maxCheckpoints;
        const removedEvents = newTimeline.splice(0, numToRemove);

        const newHistoryIndex = Math.max(-1, state.historyIndex - numToRemove);

        set({ timeline: newTimeline, historyIndex: newHistoryIndex });

        for (const event of removedEvents) {
            if (event.snapshot) {
                await unpinSnapshotFiles(vfs, event.snapshot);
            }
        }
    },

    clearHistory: async (vfs) => {
        const state = get();
        for (const event of state.timeline) {
            if (event.snapshot) {
                await unpinSnapshotFiles(vfs, event.snapshot);
            }
        }
        set({ timeline: [], historyIndex: -1 });
    }
}));
