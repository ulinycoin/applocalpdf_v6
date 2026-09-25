import type { PlatformRuntime } from '../../../app/platform/create-platform';
import type { PageItem, StudioDocument } from './store/studio-store-types';
import { useDocumentStore } from './store/document-store';
import { useUIStore } from './store/ui-store';
import { useHistoryStore } from './store/history-store';

export interface PageSelectionRef {
    docId: string;
    pageId: string;
}

type PageOpRuntime = Pick<PlatformRuntime, 'vfs' | 'telemetry'>;

export interface SplitTarget {
    id: string;
    name: string;
    x: number;
    y: number;
}

/**
 * Canvas page operations shared by the tool rail, the floating menu and keyboard shortcuts, so all
 * entry points emit the same telemetry and history checkpoints.
 */

export function pagesSelectedInDoc(
    documents: StudioDocument[],
    selection: PageSelectionRef[],
    docId: string,
): PageItem[] {
    const selectedIds = new Set(selection.filter((item) => item.docId === docId).map((item) => item.pageId));
    if (selectedIds.size === 0) {
        return [];
    }
    const doc = documents.find((candidate) => candidate.id === docId);
    if (!doc) {
        return [];
    }
    return doc.pages.filter((page) => selectedIds.has(page.id));
}

/**
 * A workspace created on purpose (allowEmpty) survives losing its last page; one that came from a
 * file is dropped, the way removing its last page always meant removing the file.
 */
function pruneEmptiedWorkspaces(workspaces: Array<{ id: string; allowEmpty?: boolean }>): void {
    const store = useDocumentStore.getState();
    for (const workspace of workspaces) {
        if (workspace.allowEmpty) {
            continue;
        }
        const current = store.documents.find((doc) => doc.id === workspace.id);
        if (current && current.pages.length === 0) {
            store.removeDocument(workspace.id);
        }
    }
}

export function mergePagesIntoWorkspace(
    runtime: PageOpRuntime,
    params: {
        sourceDocId: string;
        targetDocId: string;
        selection: PageSelectionRef[];
        method: 'button' | 'drag';
    },
): number {
    const { sourceDocId, targetDocId, selection, method } = params;
    if (sourceDocId === targetDocId) {
        return 0;
    }

    const state = useDocumentStore.getState();
    const sourceDoc = state.documents.find((doc) => doc.id === sourceDocId);
    const targetDoc = state.documents.find((doc) => doc.id === targetDocId);
    if (!sourceDoc || !targetDoc) {
        return 0;
    }

    const selected = pagesSelectedInDoc(state.documents, selection, sourceDocId);
    const pagesToMove = selected.length > 0 ? selected : sourceDoc.pages;
    if (pagesToMove.length === 0) {
        return 0;
    }

    const movingIds = new Set(pagesToMove.map((page) => page.id));
    const nextDocs = state.documents.map((doc) => {
        if (doc.id === sourceDocId) {
            return { ...doc, isModified: true, pages: doc.pages.filter((page) => !movingIds.has(page.id)) };
        }
        if (doc.id === targetDocId) {
            return { ...doc, isModified: true, pages: [...doc.pages, ...pagesToMove] };
        }
        return doc;
    });

    state.setDocuments(nextDocs);
    pruneEmptiedWorkspaces([sourceDoc]);
    const uiStore = useUIStore.getState();
    uiStore.setSelection(uiStore.selection.filter((item) => !movingIds.has(item.pageId)));
    uiStore.setActiveDocument(targetDocId);

    runtime.telemetry.track({
        type: 'STUDIO_MERGE_COMPLETED',
        runId: crypto.randomUUID(),
        sourceDocId,
        targetDocId,
        pageCount: pagesToMove.length,
        method,
    });
    void useHistoryStore.getState().createCheckpoint(
        runtime.vfs,
        'move_page',
        `Merged ${pagesToMove.length} page${pagesToMove.length === 1 ? '' : 's'} into ${targetDoc.name}`,
    );

    return pagesToMove.length;
}

export function splitPagesToNewWorkspace(
    runtime: PageOpRuntime,
    params: {
        sourceDocId: string;
        selection: PageSelectionRef[];
        target: SplitTarget;
    },
): number {
    const { sourceDocId, selection, target } = params;
    const state = useDocumentStore.getState();
    const sourceDoc = state.documents.find((doc) => doc.id === sourceDocId);
    if (!sourceDoc) {
        return 0;
    }

    const selected = pagesSelectedInDoc(state.documents, selection, sourceDocId);
    const pagesToMove = selected.length > 0 ? selected : sourceDoc.pages;
    if (pagesToMove.length === 0) {
        return 0;
    }

    const movingIds = new Set(pagesToMove.map((page) => page.id));
    const newDoc: StudioDocument = {
        id: target.id,
        name: target.name,
        x: target.x,
        y: target.y,
        pages: pagesToMove,
        allowEmpty: false,
        includeInExport: true,
        isModified: true,
    };
    const nextDocs = state.documents.map((doc) => (
        doc.id === sourceDocId
            ? { ...doc, isModified: true, pages: doc.pages.filter((page) => !movingIds.has(page.id)) }
            : doc
    ));

    state.setDocuments([...nextDocs, newDoc]);
    pruneEmptiedWorkspaces([sourceDoc]);
    const uiStore = useUIStore.getState();
    uiStore.setSelection(pagesToMove.map((page) => ({ docId: newDoc.id, pageId: page.id })));
    uiStore.setActiveDocument(newDoc.id);

    runtime.telemetry.track({
        type: 'STUDIO_SPLIT_COMPLETED',
        runId: crypto.randomUUID(),
        sourceDocId,
        newDocId: newDoc.id,
        pageCount: pagesToMove.length,
        method: 'button',
    });
    void useHistoryStore.getState().createCheckpoint(
        runtime.vfs,
        'space_new',
        `Split ${pagesToMove.length} page${pagesToMove.length === 1 ? '' : 's'} into a new workspace`,
    );

    return pagesToMove.length;
}

export function deletePages(
    runtime: PageOpRuntime,
    params: { selection: PageSelectionRef[]; method: 'button' | 'keyboard' },
): number {
    const { selection, method } = params;
    if (selection.length === 0) {
        return 0;
    }

    const state = useDocumentStore.getState();
    const pageIds = new Set(selection.map((item) => item.pageId));
    const knownPageIds = new Set(state.documents.flatMap((doc) => doc.pages.map((page) => page.id)));
    const deletedCount = [...pageIds].filter((pageId) => knownPageIds.has(pageId)).length;
    if (deletedCount === 0) {
        return 0;
    }
    const workspacesBeforeDeletion = state.documents.length;

    const nextDocs = state.documents.map((doc) => ({
        ...doc,
        isModified: true,
        pages: doc.pages.filter((page) => !pageIds.has(page.id)),
    }));
    state.setDocuments(nextDocs);
    pruneEmptiedWorkspaces(state.documents);
    useUIStore.getState().setSelection([]);

    runtime.telemetry.track({
        type: 'STUDIO_DELETE_PAGES',
        runId: crypto.randomUUID(),
        pageCount: deletedCount,
        workspaceCount: workspacesBeforeDeletion,
        method,
    });
    void useHistoryStore.getState().createCheckpoint(
        runtime.vfs,
        'delete_page',
        `Deleted ${deletedCount} page${deletedCount === 1 ? '' : 's'}`,
    );

    return deletedCount;
}
