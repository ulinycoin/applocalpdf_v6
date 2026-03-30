import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import type { IFileEntry, IFileSystem } from '../../../../core/types/contracts';
import { useDocumentStore } from './document-store';
import { useEditSessionStore } from './session-store';
import { useHistoryStore } from './history-store';
import { useUIStore } from './ui-store';
import type { DetachedPageItem, StudioDocument } from './studio-store-types';

class MockFileEntry implements IFileEntry {
  constructor(readonly id: string, private readonly blob: Blob) {}

  getBlob(): Promise<Blob> {
    return Promise.resolve(this.blob);
  }

  getText(): Promise<string> {
    return this.blob.text();
  }

  getName(): string {
    return this.id;
  }

  getSize(): Promise<number> {
    return Promise.resolve(this.blob.size);
  }

  getType(): Promise<string> {
    return Promise.resolve(this.blob.type);
  }
}

class MockFileSystem implements IFileSystem {
  private readonly blobs = new Map<string, Blob>();
  private readonly pins = new Map<string, number>();

  seed(id: string, blob: Blob): void {
    this.blobs.set(id, blob);
  }

  getPinCount(id: string): number {
    return this.pins.get(id) ?? 0;
  }

  async write(data: Blob): Promise<IFileEntry> {
    const id = crypto.randomUUID();
    this.blobs.set(id, data);
    return new MockFileEntry(id, data);
  }

  async read(id: string): Promise<IFileEntry> {
    const blob = this.blobs.get(id);
    if (!blob) {
      throw new Error(`Missing file: ${id}`);
    }
    return new MockFileEntry(id, blob);
  }

  async delete(id: string): Promise<void> {
    if (this.getPinCount(id) > 0) {
      const { FilePinnedError } = await import('../../../../core/types/contracts');
      throw new FilePinnedError(id);
    }
    this.blobs.delete(id);
  }

  async pin(id: string): Promise<void> {
    this.pins.set(id, (this.pins.get(id) ?? 0) + 1);
  }

  async unpin(id: string): Promise<void> {
    const count = this.pins.get(id) ?? 0;
    if (count <= 1) {
      this.pins.delete(id);
      return;
    }
    this.pins.set(id, count - 1);
  }
}

let fs: MockFileSystem;

function makePage(fileId: string, pageId: string, rotation = 0) {
  return {
    id: pageId,
    fileId,
    pageIndex: 0,
    thumbnailUrl: `thumb:${fileId}`,
    rotation,
  };
}

function seedWorkspaceSnapshot(params: {
  documents: StudioDocument[];
  detachedPages?: DetachedPageItem[];
  activeDocumentId: string | null;
  activeEditPageId: string | null;
  requestedInlineTool: 'compress-pdf' | null;
  operationScope: 'selection' | 'document';
  viewScale: number;
  viewPosition: { x: number; y: number };
  selection: { docId: string; pageId: string }[];
  interactionMode: 'edit' | 'convert' | null;
}) {
  useDocumentStore.getState().clearDocs();
  useUIStore.getState().clearUI();
  useEditSessionStore.getState().clearSession();

  useDocumentStore.setState({
    documents: params.documents,
    detachedPages: params.detachedPages ?? [],
    workspaceVersion: 0,
    lastExportedVersion: 0,
  });

  useUIStore.setState({
    activeDocumentId: params.activeDocumentId,
    activeEditPageId: params.activeEditPageId,
    requestedInlineTool: params.requestedInlineTool,
    operationScope: params.operationScope,
    studioViewScale: params.viewScale,
    studioViewPosition: params.viewPosition,
    selection: params.selection,
    interactionMode: params.interactionMode,
  });
}

beforeEach(() => {
  fs = new MockFileSystem();
  useHistoryStore.setState({ timeline: [], historyIndex: -1, maxCheckpoints: 20 });
  useDocumentStore.getState().clearDocs();
  useUIStore.getState().clearUI();
  useEditSessionStore.getState().clearSession();
});

afterEach(async () => {
  await useHistoryStore.getState().clearHistory(fs);
  useDocumentStore.getState().clearDocs();
  useUIStore.getState().clearUI();
  useEditSessionStore.getState().clearSession();
});

test('createCheckpoint clears redo history and unpins truncated future snapshots', async () => {
  fs.seed('file-a', new Blob([new Uint8Array([1])]));
  fs.seed('file-b', new Blob([new Uint8Array([2])]));

  seedWorkspaceSnapshot({
    documents: [
      {
        id: 'doc-1',
        name: 'Doc A',
        pages: [makePage('file-a', 'page-a')],
        x: 10,
        y: 20,
      },
    ],
    activeDocumentId: 'doc-1',
    activeEditPageId: 'page-a',
    requestedInlineTool: null,
    operationScope: 'selection',
    viewScale: 1,
    viewPosition: { x: 0, y: 0 },
    selection: [{ docId: 'doc-1', pageId: 'page-a' }],
    interactionMode: null,
  });

  await useHistoryStore.getState().createCheckpoint(fs, 'upload', 'Uploaded A');

  seedWorkspaceSnapshot({
    documents: [
      {
        id: 'doc-1',
        name: 'Doc B',
        pages: [makePage('file-b', 'page-b')],
        x: 10,
        y: 20,
      },
    ],
    activeDocumentId: 'doc-1',
    activeEditPageId: 'page-b',
    requestedInlineTool: null,
    operationScope: 'selection',
    viewScale: 1,
    viewPosition: { x: 0, y: 0 },
    selection: [{ docId: 'doc-1', pageId: 'page-b' }],
    interactionMode: null,
  });

  await useHistoryStore.getState().createCheckpoint(fs, 'convert', 'Converted to B');
  assert.equal(useHistoryStore.getState().timeline.length, 2);
  assert.equal(fs.getPinCount('file-a'), 1);
  assert.equal(fs.getPinCount('file-b'), 1);

  useHistoryStore.getState().restoreCheckpoint(0);

  seedWorkspaceSnapshot({
    documents: [
      {
        id: 'doc-1',
        name: 'Doc A again',
        pages: [makePage('file-a', 'page-a')],
        x: 10,
        y: 20,
      },
    ],
    activeDocumentId: 'doc-1',
    activeEditPageId: 'page-a',
    requestedInlineTool: null,
    operationScope: 'selection',
    viewScale: 1,
    viewPosition: { x: 0, y: 0 },
    selection: [{ docId: 'doc-1', pageId: 'page-a' }],
    interactionMode: null,
  });

  await useHistoryStore.getState().createCheckpoint(fs, 'system', 'New action after restore');

  const history = useHistoryStore.getState();
  assert.equal(history.timeline.length, 2);
  assert.equal(history.historyIndex, 1);
  assert.equal(history.timeline[1].label, 'New action after restore');
  assert.equal(fs.getPinCount('file-b'), 0);

  await assert.doesNotReject(() => fs.delete('file-b'));
});

test('restoreCheckpoint restores workspace and UI state atomically enough for Studio', async () => {
  fs.seed('file-a', new Blob([new Uint8Array([1])]));

  seedWorkspaceSnapshot({
    documents: [
      {
        id: 'doc-1',
        name: 'Original',
        pages: [makePage('file-a', 'page-a')],
        x: 12,
        y: 34,
      },
    ],
    detachedPages: [
      {
        id: 'detached-1',
        fileId: 'file-a',
        pageIndex: 0,
        thumbnailUrl: 'thumb:file-a',
        rotation: 90,
        x: 300,
        y: 200,
      },
    ],
    activeDocumentId: 'doc-1',
    activeEditPageId: 'page-a',
    requestedInlineTool: 'compress-pdf',
    operationScope: 'document',
    viewScale: 1.75,
    viewPosition: { x: 120, y: -45 },
    selection: [{ docId: 'doc-1', pageId: 'page-a' }],
    interactionMode: 'convert',
  });

  useEditSessionStore.getState().startEditSession({
    docId: 'doc-1',
    pageId: 'page-a',
    pageIndex: 0,
    fileId: 'file-a',
    initialTool: null,
  });

  await useHistoryStore.getState().createCheckpoint(fs, 'upload', 'Original snapshot');

  seedWorkspaceSnapshot({
    documents: [
      {
        id: 'doc-2',
        name: 'Mutated',
        pages: [makePage('file-a', 'page-b')],
        x: 999,
        y: 888,
      },
    ],
    detachedPages: [],
    activeDocumentId: 'doc-2',
    activeEditPageId: 'page-b',
    requestedInlineTool: null,
    operationScope: 'selection',
    viewScale: 0.5,
    viewPosition: { x: 0, y: 0 },
    selection: [],
    interactionMode: null,
  });

  useEditSessionStore.getState().startEditSession({
    docId: 'doc-2',
    pageId: 'page-b',
    pageIndex: 0,
    fileId: 'file-a',
    initialTool: 'text',
  });

  await useHistoryStore.getState().createCheckpoint(fs, 'convert', 'Mutated snapshot');

  useHistoryStore.getState().restoreCheckpoint(0);

  const documents = useDocumentStore.getState().documents;
  const ui = useUIStore.getState();
  const session = useEditSessionStore.getState();

  assert.equal(documents.length, 1);
  assert.equal(documents[0].id, 'doc-1');
  assert.equal(documents[0].name, 'Original');
  assert.equal(useDocumentStore.getState().detachedPages.length, 1);
  assert.equal(ui.activeDocumentId, 'doc-1');
  assert.equal(ui.activeEditPageId, 'page-a');
  assert.equal(ui.requestedInlineTool, 'compress-pdf');
  assert.equal(ui.operationScope, 'document');
  assert.equal(ui.interactionMode, 'convert');
  assert.equal(ui.studioViewScale, 1.75);
  assert.deepEqual(ui.studioViewPosition, { x: 120, y: -45 });
  assert.deepEqual(ui.selection, [{ docId: 'doc-1', pageId: 'page-a' }]);
  assert.equal(session.editSession, null);
  assert.equal(session.saveUndoStack.length, 0);
  assert.equal(session.commandUndoStack.length, 0);
});
