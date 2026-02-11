import { create } from 'zustand';

export interface PageItem {
    id: string;
    fileId: string;
    pageIndex: number;
    thumbnailUrl: string;
    rotation: number;
}

export interface StudioDocument {
    id: string;
    name: string;
    pages: PageItem[];
    x: number;
    y: number;
    isModified?: boolean;
}

interface StudioState {
    documents: StudioDocument[];
    selection: { docId: string; pageId: string }[];
    isDraggingFile: boolean;

    addDocument: (doc: StudioDocument) => void;
    updateDocument: (id: string, updates: Partial<StudioDocument>) => void;
    removeDocument: (id: string) => void;
    setDocuments: (docs: StudioDocument[]) => void;

    movePage: (sourceDocId: string, pageId: string, targetDocId: string, index?: number) => void;
    updatePage: (docId: string, pageId: string, updates: Partial<PageItem>) => void;

    setSelection: (selection: { docId: string; pageId: string }[]) => void;
    setDraggingFile: (isDragging: boolean) => void;
    clear: () => void;
}

export const useStudioStore = create<StudioState>((set) => ({
    documents: [],
    selection: [],
    isDraggingFile: false,

    addDocument: (doc) => set((state) => ({ documents: [...state.documents, doc] })),

    updateDocument: (id, updates) => set((state) => ({
        documents: state.documents.map(d => d.id === id ? { ...d, ...updates } : d)
    })),

    removeDocument: (id) => set((state) => ({
        documents: state.documents.filter(d => d.id !== id)
    })),

    setDocuments: (docs) => set({ documents: docs }), // Added implementation

    updatePage: (docId, pageId, updates) => set((state) => ({
        documents: state.documents.map(d => d.id === docId ? {
            ...d,
            isModified: true,
            pages: d.pages.map(p => p.id === pageId ? { ...p, ...updates } : p)
        } : d)
    })),

    movePage: (sourceDocId, pageId, targetDocId, index) => set((state) => {
        const sourceDoc = state.documents.find(d => d.id === sourceDocId);
        const targetDoc = state.documents.find(d => d.id === targetDocId);
        if (!sourceDoc || !targetDoc) return state;

        const page = sourceDoc.pages.find(p => p.id === pageId);
        if (!page) return state;

        // Correctly handle same-document move
        let newSourcePages = sourceDoc.pages.filter(p => p.id !== pageId);
        let newTargetPages: PageItem[];

        if (sourceDocId === targetDocId) {
            newTargetPages = [...newSourcePages];
            if (typeof index === 'number') {
                newTargetPages.splice(index, 0, page);
            } else {
                newTargetPages.push(page);
            }
            return {
                documents: state.documents.map(d => d.id === sourceDocId ? { ...d, pages: newTargetPages, isModified: true } : d)
            };
        } else {
            newTargetPages = [...targetDoc.pages];
            if (typeof index === 'number') {
                newTargetPages.splice(index, 0, page);
            } else {
                newTargetPages.push(page);
            }
            return {
                documents: state.documents.slice().map(d => {
                    if (d.id === sourceDocId) return { ...d, pages: newSourcePages, isModified: true };
                    if (d.id === targetDocId) return { ...d, pages: newTargetPages, isModified: true };
                    return d;
                }).filter(d => d.pages.length > 0)
            };
        }
    }),

    setSelection: (selection) => set({ selection }),
    setDraggingFile: (isDragging) => set({ isDraggingFile: isDragging }),
    clear: () => set({ documents: [], selection: [] }),
}));
