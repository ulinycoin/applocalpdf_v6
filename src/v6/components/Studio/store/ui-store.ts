import { create } from 'zustand';
import type { StudioInteractionMode, StudioOperationScope } from './studio-store-types';

export interface UIState {
    selection: { docId: string; pageId: string }[];
    requestedInlineTool: 'compress-pdf' | null;
    isDraggingFile: boolean;
    activeDocumentId: string | null;
    interactionMode: StudioInteractionMode;
    activeEditPageId: string | null;
    operationScope: StudioOperationScope;

    setSelection: (selection: { docId: string; pageId: string }[]) => void;
    requestInlineTool: (toolId: 'compress-pdf' | null) => void;
    setDraggingFile: (isDragging: boolean) => void;
    setActiveDocument: (id: string | null) => void;
    setInteractionMode: (mode: StudioInteractionMode) => void;
    setActiveEditPageId: (id: string | null) => void;
    setOperationScope: (scope: StudioOperationScope) => void;
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
    clearUI: () => set({
        selection: [],
        requestedInlineTool: null,
        activeDocumentId: null,
        interactionMode: null,
        activeEditPageId: null,
        operationScope: 'selection',
    }),
}));
