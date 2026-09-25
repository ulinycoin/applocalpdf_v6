import assert from 'node:assert/strict';
import test from 'node:test';
import { useDocumentStore } from './store/document-store';
import { useUIStore } from './store/ui-store';
import { useHistoryStore } from './store/history-store';
import { deletePages, mergePagesIntoWorkspace, splitPagesToNewWorkspace } from './studio-page-ops';
import type { PageItem, StudioDocument } from './store/studio-store-types';

function makePage(id: string): PageItem {
    return { id, fileId: `file-${id}`, pageIndex: 0, thumbnailUrl: `thumb-${id}`, rotation: 0 };
}

function makeDoc(id: string, pageIds: string[]): StudioDocument {
    return { id, name: id, x: 0, y: 0, pages: pageIds.map(makePage), includeInExport: true };
}

function createRuntime() {
    const events: Array<Record<string, unknown>> = [];
    return {
        events,
        runtime: {
            vfs: { pin: async () => undefined, unpin: async () => undefined },
            telemetry: { track: (event: Record<string, unknown>) => { events.push(event); } },
        },
    };
}

function resetStores(documents: StudioDocument[], selection: Array<{ docId: string; pageId: string }> = []) {
    useDocumentStore.setState({
        documents,
        detachedPages: [],
        workspaceVersion: 0,
        lastExportedVersion: 0,
    });
    useUIStore.setState({
        selection,
        activeDocumentId: documents[0]?.id ?? null,
    });
    useHistoryStore.setState({ timeline: [], historyIndex: -1 });
}

test('mergePagesIntoWorkspace moves only the selected pages and reports the merge', () => {
    resetStores([makeDoc('doc-a', ['p1', 'p2', 'p3']), makeDoc('doc-b', ['p9'])]);
    const { events, runtime } = createRuntime();

    const moved = mergePagesIntoWorkspace(runtime as never, {
        sourceDocId: 'doc-a',
        targetDocId: 'doc-b',
        selection: [{ docId: 'doc-a', pageId: 'p1' }, { docId: 'doc-a', pageId: 'p3' }],
        method: 'button',
    });

    assert.equal(moved, 2);
    const state = useDocumentStore.getState();
    assert.deepEqual(state.documents.find((doc) => doc.id === 'doc-a')?.pages.map((page) => page.id), ['p2']);
    assert.deepEqual(state.documents.find((doc) => doc.id === 'doc-b')?.pages.map((page) => page.id), ['p9', 'p1', 'p3']);
    assert.equal(useUIStore.getState().activeDocumentId, 'doc-b');
    assert.deepEqual(useUIStore.getState().selection, []);

    const event = events.find((item) => item.type === 'STUDIO_MERGE_COMPLETED');
    assert.ok(event, 'expected a STUDIO_MERGE_COMPLETED event');
    assert.equal(event?.pageCount, 2);
    assert.equal(event?.method, 'button');
    assert.equal(event?.sourceDocId, 'doc-a');
    assert.equal(event?.targetDocId, 'doc-b');
});

test('mergePagesIntoWorkspace with no selection merges the whole workspace', () => {
    resetStores([makeDoc('doc-a', ['p1', 'p2']), makeDoc('doc-b', [])]);
    const { events, runtime } = createRuntime();

    const moved = mergePagesIntoWorkspace(runtime as never, {
        sourceDocId: 'doc-a',
        targetDocId: 'doc-b',
        selection: [],
        method: 'button',
    });

    assert.equal(moved, 2);
    assert.deepEqual(useDocumentStore.getState().documents.map((doc) => doc.id), ['doc-b']);
    assert.deepEqual(useDocumentStore.getState().documents[0]?.pages.map((page) => page.id), ['p1', 'p2']);
    assert.equal(events.find((item) => item.type === 'STUDIO_MERGE_COMPLETED')?.pageCount, 2);
});

test('splitPagesToNewWorkspace moves selected pages into a new workspace and reports the split', () => {
    resetStores([makeDoc('doc-a', ['p1', 'p2', 'p3'])]);
    const { events, runtime } = createRuntime();

    const moved = splitPagesToNewWorkspace(runtime as never, {
        sourceDocId: 'doc-a',
        selection: [{ docId: 'doc-a', pageId: 'p2' }],
        target: { id: 'doc-split', name: 'doc-a (split)', x: 480, y: 0 },
    });

    assert.equal(moved, 1);
    const state = useDocumentStore.getState();
    assert.deepEqual(state.documents.find((doc) => doc.id === 'doc-a')?.pages.map((page) => page.id), ['p1', 'p3']);
    assert.deepEqual(state.documents.find((doc) => doc.id === 'doc-split')?.pages.map((page) => page.id), ['p2']);
    assert.deepEqual(useUIStore.getState().selection, [{ docId: 'doc-split', pageId: 'p2' }]);
    assert.equal(useUIStore.getState().activeDocumentId, 'doc-split');

    const event = events.find((item) => item.type === 'STUDIO_SPLIT_COMPLETED');
    assert.ok(event, 'expected a STUDIO_SPLIT_COMPLETED event');
    assert.equal(event?.pageCount, 1);
    assert.equal(event?.newDocId, 'doc-split');
});

test('deletePages removes selected pages and reports the deletion', () => {
    resetStores([makeDoc('doc-a', ['p1', 'p2']), makeDoc('doc-b', ['p3'])]);
    const { events, runtime } = createRuntime();

    const deleted = deletePages(runtime as never, {
        selection: [{ docId: 'doc-a', pageId: 'p1' }, { docId: 'doc-b', pageId: 'p3' }],
        method: 'keyboard',
    });

    assert.equal(deleted, 2);
    const state = useDocumentStore.getState();
    assert.deepEqual(state.documents.map((doc) => doc.id), ['doc-a']);
    assert.deepEqual(state.documents[0]?.pages.map((page) => page.id), ['p2']);
    assert.deepEqual(useUIStore.getState().selection, []);

    const event = events.find((item) => item.type === 'STUDIO_DELETE_PAGES');
    assert.ok(event, 'expected a STUDIO_DELETE_PAGES event');
    assert.equal(event?.pageCount, 2);
    assert.equal(event?.method, 'keyboard');
    assert.equal(event?.workspaceCount, 2);
});

test('deletePages ignores stale selection entries', () => {
    resetStores([makeDoc('doc-a', ['p1'])]);
    const { events, runtime } = createRuntime();

    const deleted = deletePages(runtime as never, {
        selection: [{ docId: 'doc-a', pageId: 'gone' }],
        method: 'button',
    });

    assert.equal(deleted, 0);
    assert.equal(events.length, 0);
    assert.deepEqual(useDocumentStore.getState().documents[0]?.pages.map((page) => page.id), ['p1']);
});
