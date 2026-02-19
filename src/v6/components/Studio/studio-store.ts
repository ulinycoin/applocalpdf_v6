import { create } from 'zustand';

export interface PageItem {
    id: string;
    fileId: string;
    pageIndex: number;
    thumbnailUrl: string;
    rotation: number;
}

export interface DetachedPageItem extends PageItem {
    x: number;
    y: number;
}

export interface StudioDocument {
    id: string;
    name: string;
    pages: PageItem[];
    x: number;
    y: number;
    isModified?: boolean;
    allowEmpty?: boolean;
    includeInExport?: boolean;
}

export type StudioInteractionMode = 'edit' | 'convert' | null;
export type StudioOperationScope = 'selection' | 'document';
export type StudioEditToolId = 'text' | 'annotate' | 'whiteout' | 'shapes';

export interface StudioEditSession {
    docId: string;
    pageId: string;
    pageIndex: number;
    sourceFileId: string;
    workingFileId: string;
    activeTool: StudioEditToolId;
    startedAt: number;
}

export interface StudioState {
    documents: StudioDocument[];
    detachedPages: DetachedPageItem[];
    selection: { docId: string; pageId: string }[];
    requestedInlineTool: 'compress-pdf' | null;
    isDraggingFile: boolean;
    activeDocumentId: string | null;
    interactionMode: StudioInteractionMode;
    activeEditPageId: string | null;
    operationScope: StudioOperationScope;
    editSession: StudioEditSession | null;
    workspaceVersion: number;
    lastExportedVersion: number;

    addDocument: (doc: StudioDocument) => void;
    updateDocument: (id: string, updates: Partial<StudioDocument>) => void;
    removeDocument: (id: string) => void;
    setDocuments: (docs: StudioDocument[]) => void;
    setActiveDocument: (id: string | null) => void;
    setInteractionMode: (mode: StudioInteractionMode) => void;
    setActiveEditPageId: (id: string | null) => void;
    setOperationScope: (scope: StudioOperationScope) => void;
    startEditSession: (session: {
        docId: string;
        pageId: string;
        pageIndex: number;
        fileId: string;
        initialTool?: StudioEditToolId;
    }) => void;
    updateEditSessionTool: (tool: StudioEditToolId) => void;
    syncEditSessionTarget: (target: { docId: string; pageId: string; pageIndex: number; workingFileId: string }) => void;
    clearEditSession: () => void;

    movePage: (sourceDocId: string, pageId: string, targetDocId: string, index?: number) => void;
    detachPage: (docId: string, pageId: string, x: number, y: number) => void;
    attachDetachedPage: (detachedPageId: string, targetDocId: string, index?: number) => void;
    moveDetachedPage: (detachedPageId: string, x: number, y: number) => void;
    removePage: (docId: string, pageId: string) => void;
    updatePage: (docId: string, pageId: string, updates: Partial<PageItem>) => void;

    setSelection: (selection: { docId: string; pageId: string }[]) => void;
    requestInlineTool: (toolId: 'compress-pdf' | null) => void;
    setDraggingFile: (isDragging: boolean) => void;
    recountWorkspacePages: () => void;
    markWorkspaceExported: () => void;
    clear: () => void;
}

function normalizeWorkspaceState(state: StudioState): Pick<StudioState, 'documents' | 'activeDocumentId' | 'selection' | 'editSession'> {
    const documents = state.documents.filter((doc) => doc.pages.length > 0 || doc.allowEmpty);
    const activeDocumentId = documents.some((doc) => doc.id === state.activeDocumentId)
        ? state.activeDocumentId
        : (documents[0]?.id ?? null);

    const existingPageIds = new Set(documents.flatMap((doc) => doc.pages.map((page) => page.id)));
    const selection = state.selection.filter((item) => existingPageIds.has(item.pageId));
    const editSession = state.editSession && existingPageIds.has(state.editSession.pageId)
        ? state.editSession
        : null;

    return {
        documents,
        activeDocumentId,
        selection,
        editSession,
    };
}

function commitWorkspaceMutation(prevState: StudioState, nextState: StudioState): StudioState {
    const normalized = normalizeWorkspaceState(nextState);
    return {
        ...nextState,
        ...normalized,
        workspaceVersion: prevState.workspaceVersion + 1,
    };
}

export const useStudioStore = create<StudioState>((set) => ({
    documents: [],
    detachedPages: [],
    selection: [],
    requestedInlineTool: null,
    isDraggingFile: false,
    activeDocumentId: null,
    interactionMode: null,
    activeEditPageId: null,
    operationScope: 'selection',
    editSession: null,
    workspaceVersion: 0,
    lastExportedVersion: 0,

    addDocument: (doc) => set((state) => {
        const nextState: StudioState = {
            ...state,
            documents: [...state.documents, doc],
            activeDocumentId: state.activeDocumentId ?? doc.id,
        };
        return commitWorkspaceMutation(state, nextState);
    }),

    updateDocument: (id, updates) => set((state) => {
        const nextState: StudioState = {
            ...state,
            documents: state.documents.map(d => d.id === id ? { ...d, ...updates } : d),
        };
        return commitWorkspaceMutation(state, nextState);
    }),

    removeDocument: (id) => set((state) => {
        const nextState: StudioState = {
            ...state,
            documents: state.documents.filter(d => d.id !== id),
            activeDocumentId: state.activeDocumentId === id ? null : state.activeDocumentId,
        };
        return commitWorkspaceMutation(state, nextState);
    }),

    setDocuments: (docs) => set((state) => {
        const nextState: StudioState = {
            ...state,
            documents: docs,
            activeDocumentId: docs.some((d) => d.id === state.activeDocumentId) ? state.activeDocumentId : (docs[0]?.id ?? null),
        };
        return commitWorkspaceMutation(state, nextState);
    }),
    setActiveDocument: (id) => set({ activeDocumentId: id }),
    setInteractionMode: (mode) => set({ interactionMode: mode }),
    setActiveEditPageId: (id) => set({ activeEditPageId: id }),
    setOperationScope: (scope) => set({ operationScope: scope }),
    startEditSession: ({ docId, pageId, pageIndex, fileId, initialTool = 'text' }) => set({
        editSession: {
            docId,
            pageId,
            pageIndex,
            sourceFileId: fileId,
            workingFileId: fileId,
            activeTool: initialTool,
            startedAt: Date.now(),
        },
    }),
    updateEditSessionTool: (tool) => set((state) => {
        if (!state.editSession) {
            return state;
        }
        return {
            editSession: {
                ...state.editSession,
                activeTool: tool,
            },
        };
    }),
    syncEditSessionTarget: (target) => set((state) => {
        if (!state.editSession) {
            return state;
        }
        return {
            editSession: {
                ...state.editSession,
                docId: target.docId,
                pageId: target.pageId,
                pageIndex: target.pageIndex,
                workingFileId: target.workingFileId,
            },
        };
    }),
    clearEditSession: () => set({ editSession: null }),

    updatePage: (docId, pageId, updates) => set((state) => {
        const nextState: StudioState = {
            ...state,
            documents: state.documents.map(d => d.id === docId ? {
                ...d,
                isModified: true,
                pages: d.pages.map(p => p.id === pageId ? { ...p, ...updates } : p)
            } : d),
        };
        return commitWorkspaceMutation(state, nextState);
    }),

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
            const nextState: StudioState = {
                ...state,
                documents: state.documents.map(d => d.id === sourceDocId ? { ...d, pages: newTargetPages, isModified: true } : d)
            };
            return commitWorkspaceMutation(state, nextState);
        } else {
            newTargetPages = [...targetDoc.pages];
            if (typeof index === 'number') {
                newTargetPages.splice(index, 0, page);
            } else {
                newTargetPages.push(page);
            }
            const nextState: StudioState = {
                ...state,
                documents: state.documents.slice().map(d => {
                    if (d.id === sourceDocId) return { ...d, pages: newSourcePages, isModified: true };
                    if (d.id === targetDocId) return { ...d, pages: newTargetPages, isModified: true };
                    return d;
                }),
            };
            return commitWorkspaceMutation(state, nextState);
        }
    }),

    detachPage: (docId, pageId, x, y) => set((state) => {
        const sourceDoc = state.documents.find((doc) => doc.id === docId);
        if (!sourceDoc) {
            return state;
        }
        const page = sourceDoc.pages.find((candidate) => candidate.id === pageId);
        if (!page) {
            return state;
        }

        const nextState: StudioState = {
            ...state,
            documents: state.documents.map((doc) => {
                if (doc.id !== docId) {
                    return doc;
                }
                return {
                    ...doc,
                    isModified: true,
                    pages: doc.pages.filter((candidate) => candidate.id !== pageId),
                };
            }),
            detachedPages: [...state.detachedPages, { ...page, x, y }],
            selection: state.selection.filter((item) => item.pageId !== pageId),
        };
        return commitWorkspaceMutation(state, nextState);
    }),

    attachDetachedPage: (detachedPageId, targetDocId, index) => set((state) => {
        const detached = state.detachedPages.find((item) => item.id === detachedPageId);
        const targetDoc = state.documents.find((doc) => doc.id === targetDocId);
        if (!detached || !targetDoc) {
            return state;
        }

        const page: PageItem = {
            id: detached.id,
            fileId: detached.fileId,
            pageIndex: detached.pageIndex,
            thumbnailUrl: detached.thumbnailUrl,
            rotation: detached.rotation,
        };

        const nextState: StudioState = {
            ...state,
            detachedPages: state.detachedPages.filter((item) => item.id !== detachedPageId),
            documents: state.documents.map((doc) => {
                if (doc.id !== targetDocId) {
                    return doc;
                }
                const pages = [...doc.pages];
                if (typeof index === 'number') {
                    pages.splice(index, 0, page);
                } else {
                    pages.push(page);
                }
                return { ...doc, isModified: true, pages };
            }),
        };
        return commitWorkspaceMutation(state, nextState);
    }),

    moveDetachedPage: (detachedPageId, x, y) => set((state) => ({
        detachedPages: state.detachedPages.map((item) => item.id === detachedPageId ? { ...item, x, y } : item),
    })),

    removePage: (docId, pageId) => set((state) => {
        const updatedDocuments = state.documents
            .map((doc) => {
                if (doc.id !== docId) {
                    return doc;
                }
                return {
                    ...doc,
                    isModified: true,
                    pages: doc.pages.filter((page) => page.id !== pageId),
                };
            });
        const nextState: StudioState = {
            ...state,
            documents: updatedDocuments,
            selection: state.selection.filter((item) => item.pageId !== pageId),
        };
        return commitWorkspaceMutation(state, nextState);
    }),

    setSelection: (selection) => set((state) => ({
        selection,
        requestedInlineTool: selection.length === 0 ? null : state.requestedInlineTool,
    })),
    requestInlineTool: (toolId) => set({ requestedInlineTool: toolId }),
    setDraggingFile: (isDragging) => set({ isDraggingFile: isDragging }),
    recountWorkspacePages: () => set((state) => commitWorkspaceMutation(state, state)),
    markWorkspaceExported: () => set((state) => ({ lastExportedVersion: state.workspaceVersion })),
    clear: () => set({
        documents: [],
        detachedPages: [],
        selection: [],
        requestedInlineTool: null,
        activeDocumentId: null,
        interactionMode: null,
        operationScope: 'selection',
        editSession: null,
        workspaceVersion: 0,
        lastExportedVersion: 0
    }),
}));

declare global {
    interface Window {
        __LOCALPDF_STUDIO_STORE__?: typeof useStudioStore;
    }
}

if (typeof window !== 'undefined' && (import.meta.env.DEV || window.navigator.webdriver)) {
    window.__LOCALPDF_STUDIO_STORE__ = useStudioStore;
}
