import { create } from 'zustand';
import type { StudioInteractionMode, StudioOperationScope } from './studio-store-types';

function getDefaultViewportSize(): { width: number; height: number } {
    if (typeof window === 'undefined') {
        return { width: 0, height: 0 };
    }
    return { width: window.innerWidth, height: window.innerHeight };
}

export interface UIState {
    selection: { docId: string; pageId: string }[];
    requestedInlineTool: 'compress-pdf' | null;
    isDraggingFile: boolean;
    activeDocumentId: string | null;
    interactionMode: StudioInteractionMode;
    activeEditPageId: string | null;
    operationScope: StudioOperationScope;
    studioViewScale: number;
    studioViewPosition: { x: number; y: number };
    gridColumns: 3 | 5;
    viewportSize: { width: number; height: number };
    isHistoryOpen: boolean;
    renamingDocId: string | null;

    setSelection: (selection: { docId: string; pageId: string }[]) => void;
    setRenamingDocId: (id: string | null) => void;
    requestInlineTool: (toolId: 'compress-pdf' | null) => void;
    setDraggingFile: (isDragging: boolean) => void;
    setActiveDocument: (id: string | null) => void;
    setInteractionMode: (mode: StudioInteractionMode) => void;
    setActiveEditPageId: (id: string | null) => void;
    setOperationScope: (scope: StudioOperationScope) => void;
    setStudioViewport: (scale: number, position: { x: number; y: number }, size?: { width: number; height: number }) => void;
    setGridColumns: (columns: 3 | 5) => void;
    whiteoutColor: string;
    setWhiteoutColor: (color: string) => void;
    setHistoryOpen: (open: boolean) => void;
    clearUI: () => void;
}

export const useUIStore = create<UIState>((set) => ({
    selection: [],
    requestedInlineTool: null,
    isDraggingFile: false,
    activeDocumentId: null,
    interactionMode: null,
    activeEditPageId: null,
    operationScope: 'selection',
    studioViewScale: 1,
    studioViewPosition: { x: 0, y: 0 },
    gridColumns: 5,
    viewportSize: getDefaultViewportSize(),
    whiteoutColor: '#ffffff',
    isHistoryOpen: false,
    renamingDocId: null,

    setSelection: (selection) => set((state) => ({
        selection,
        requestedInlineTool: selection.length === 0 ? null : state.requestedInlineTool,
    })),
    requestInlineTool: (toolId) => set({ requestedInlineTool: toolId }),
    setDraggingFile: (isDragging) => set({ isDraggingFile: isDragging }),
    setActiveDocument: (id) => set({ activeDocumentId: id }),
    setInteractionMode: (mode) => set({ interactionMode: mode }),
    setActiveEditPageId: (id) => set({ activeEditPageId: id }),
    setOperationScope: (scope) => set({ operationScope: scope }),
    setStudioViewport: (scale, position, size) => set((state) => ({
        studioViewScale: scale,
        studioViewPosition: position,
        viewportSize: size ?? state.viewportSize
    })),
    setGridColumns: (columns) => set({ gridColumns: columns }),
    setWhiteoutColor: (color) => set({ whiteoutColor: color }),
    setHistoryOpen: (open) => set({ isHistoryOpen: open }),
    setRenamingDocId: (id) => set({ renamingDocId: id }),
    clearUI: () => set({
        selection: [],
        requestedInlineTool: null,
        activeDocumentId: null,
        interactionMode: null,
        activeEditPageId: null,
        operationScope: 'selection',
        studioViewScale: 1,
        studioViewPosition: { x: 0, y: 0 },
        // Intentionally not clearing gridColumns and viewportSize on clearUI
        // as they are user preferences / environment state
    }),
}));
