import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { useDocumentStore } from './document-store';
import { useEditSessionStore } from './session-store';
import { useUIStore } from './ui-store';
import type { PageItem, StudioDocument } from './studio-store-types';

function page(id: string): PageItem {
  return { id, fileId: `file-${id}`, pageIndex: 0, thumbnailUrl: '', rotation: 0 };
}

function doc(id: string, pages: PageItem[], allowEmpty = false): StudioDocument {
  return { id, name: id, pages, x: 0, y: 0, allowEmpty };
}

beforeEach(() => {
  useDocumentStore.setState({ documents: [], detachedPages: [], workspaceVersion: 0, lastExportedVersion: 0 });
  useUIStore.setState({ selection: [], activeDocumentId: null });
  useEditSessionStore.setState({ editSession: null });
});

test('a workspace emptied by moving its last page out disappears from the canvas', () => {
  // The drag path used to compute the pruned workspace list and throw it away, so the emptied
  // workspace stayed on the canvas while only the button path pruned it.
  useDocumentStore.getState().setDocuments([doc('a', [page('p1')]), doc('b', [page('p2')])]);
  useUIStore.getState().setActiveDocument('b');

  useDocumentStore.getState().setDocuments([doc('a', [page('p1'), page('p2')]), doc('b', [])]);

  const state = useDocumentStore.getState();
  assert.deepStrictEqual(state.documents.map((d) => d.id), ['a']);
  assert.equal(useUIStore.getState().activeDocumentId, 'a');
});

test('a workspace the user created by hand survives being empty', () => {
  useDocumentStore.getState().setDocuments([doc('a', [page('p1')]), doc('manual', [], true)]);

  assert.deepStrictEqual(useDocumentStore.getState().documents.map((d) => d.id), ['a', 'manual']);
});

test('selection and edit session are dropped for pages that no longer exist', () => {
  useDocumentStore.getState().setDocuments([doc('a', [page('p1')])]);
  useUIStore.setState({ selection: [{ docId: 'a', pageId: 'p1' }, { docId: 'a', pageId: 'gone' }] });
  useEditSessionStore.setState({
    editSession: {
      docId: 'a',
      pageId: 'gone',
      pageIndex: 0,
      sourceFileId: 'file-gone',
      workingFileId: 'file-gone',
      activeTool: null,
      startedAt: 0,
    },
  });

  useDocumentStore.getState().updateDocument('a', { isModified: true });

  assert.deepStrictEqual(useUIStore.getState().selection, [{ docId: 'a', pageId: 'p1' }]);
  assert.equal(useEditSessionStore.getState().editSession, null);
});
