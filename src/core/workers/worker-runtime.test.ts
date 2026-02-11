import assert from 'node:assert/strict';
import test from 'node:test';
import { GlobalRegistry } from '../registry/global-registry';
import type { IFileEntry, IFileSystem, IToolDefinition } from '../types/contracts';
import { createValidPdfBlob } from '../../shared/test/create-valid-pdf';
import { executeWorkerCommand } from './worker-runtime';

class MemEntry implements IFileEntry {
  constructor(readonly id: string, private readonly blob: Blob) {}
  getBlob(): Promise<Blob> { return Promise.resolve(this.blob); }
  getText(): Promise<string> { return this.blob.text(); }
  getName(): string { return this.id; }
  getSize(): Promise<number> { return Promise.resolve(this.blob.size); }
  getType(): Promise<string> { return Promise.resolve(this.blob.type); }
}

class MemFs implements IFileSystem {
  private readonly entries = new Map<string, Blob>();

  seed(id: string, blob: Blob): void {
    this.entries.set(id, blob);
  }

  async write(data: Blob): Promise<IFileEntry> {
    const id = crypto.randomUUID();
    this.entries.set(id, data);
    return new MemEntry(id, data);
  }

  async read(id: string): Promise<IFileEntry> {
    const blob = this.entries.get(id);
    if (!blob) {
      throw new Error(`Missing file: ${id}`);
    }
    return new MemEntry(id, blob);
  }

  async delete(): Promise<void> {}
}

test('executeWorkerCommand propagates custom error codes', async () => {
  const registry = new GlobalRegistry();
  const tool: IToolDefinition = {
    id: 't1',
    name: 'T1',
    description: 'test',
    uiLoader: async () => ({ default: () => null }),
    logicLoader: async () => ({
      run: async () => {
        const err = new Error('boom') as Error & { code?: string };
        err.code = 'CUSTOM_CODE';
        throw err;
      },
    }),
  };
  registry.register(tool);

  const event = await executeWorkerCommand(
    {
      id: 'cmd-1',
      type: 'COMMAND',
      payload: { type: 'PROCESS_TOOL', payload: { toolId: 't1', inputIds: [] } },
    },
    { registry, fs: new MemFs() },
  );

  assert.equal(event.payload.type, 'ERROR');
  if (event.payload.type === 'ERROR') {
    assert.equal(event.payload.payload.code, 'CUSTOM_CODE');
  }
});

test('executeWorkerCommand returns PAGE_COUNT_RESULT for GET_PDF_PAGE_COUNT', async () => {
  const registry = new GlobalRegistry();
  const fs = new MemFs();
  fs.seed('pdf-1', await createValidPdfBlob(3));

  const event = await executeWorkerCommand(
    {
      id: 'cmd-page-count',
      type: 'COMMAND',
      payload: { type: 'GET_PDF_PAGE_COUNT', payload: { fileId: 'pdf-1' } },
    },
    { registry, fs },
  );

  assert.equal(event.payload.type, 'PAGE_COUNT_RESULT');
  if (event.payload.type === 'PAGE_COUNT_RESULT') {
    assert.equal(event.payload.payload.fileId, 'pdf-1');
    assert.equal(event.payload.payload.pageCount, 3);
  }
});

test('executeWorkerCommand supports GET_PDF_PAGE_COUNT with inline bytes payload', async () => {
  const registry = new GlobalRegistry();
  const blob = await createValidPdfBlob(2);
  const bytes = new Uint8Array(await blob.arrayBuffer());

  const event = await executeWorkerCommand(
    {
      id: 'cmd-page-count-inline',
      type: 'COMMAND',
      payload: { type: 'GET_PDF_PAGE_COUNT', payload: { fileId: 'inline-pdf', bytes, mimeType: 'application/pdf' } },
    },
    { registry, fs: new MemFs() },
  );

  assert.equal(event.payload.type, 'PAGE_COUNT_RESULT');
  if (event.payload.type === 'PAGE_COUNT_RESULT') {
    assert.equal(event.payload.payload.fileId, 'inline-pdf');
    assert.equal(event.payload.payload.pageCount, 2);
  }
});

test('executeWorkerCommand emits DIAGNOSTIC worker stages for GET_PDF_PAGE_COUNT', async () => {
  const registry = new GlobalRegistry();
  const fs = new MemFs();
  fs.seed('pdf-diag', await createValidPdfBlob(1));
  const seenStages: string[] = [];

  const event = await executeWorkerCommand(
    {
      id: 'cmd-page-count-diag',
      type: 'COMMAND',
      payload: { type: 'GET_PDF_PAGE_COUNT', payload: { fileId: 'pdf-diag' } },
    },
    { registry, fs },
    (progressEvent) => {
      if (progressEvent.payload.type === 'DIAGNOSTIC') {
        seenStages.push(progressEvent.payload.payload.stage);
      }
    },
  );

  assert.equal(event.payload.type, 'PAGE_COUNT_RESULT');
  assert.ok(seenStages.includes('WORKER_FS_READ_START'));
  assert.ok(seenStages.includes('WORKER_PARSE_START'));
  assert.ok(seenStages.includes('WORKER_COMMAND_DONE'));
});
