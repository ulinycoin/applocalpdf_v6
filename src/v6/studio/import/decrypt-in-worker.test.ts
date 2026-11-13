import assert from 'node:assert/strict';
import test from 'node:test';
import type { PlatformRuntime } from '../../../app/platform/create-platform';
import type { IWorkerCommand, IWorkerEvent } from '../../../core/public/contracts';
import { decryptPdfInWorker } from './decrypt-in-worker';

function fakeRuntime(options: {
  event: IWorkerEvent;
  blob?: Blob;
  onCommand?: (command: IWorkerCommand) => void;
}): { runtime: PlatformRuntime; deleted: string[] } {
  const deleted: string[] = [];
  const runtime = {
    workerOrchestrator: {
      dispatch: async (command: IWorkerCommand) => {
        options.onCommand?.(command);
        return options.event;
      },
    },
    vfs: {
      read: async () => ({ getBlob: async () => options.blob ?? new Blob([new Uint8Array([1])]) }),
      delete: async (id: string) => { deleted.push(id); },
    },
  } as unknown as PlatformRuntime;
  return { runtime, deleted };
}

test('the password travels to the worker and the decrypted copy comes back', async () => {
  let received: IWorkerCommand | undefined;
  const output = new Blob([new Uint8Array([7, 7, 7])], { type: 'application/pdf' });
  const { runtime, deleted } = fakeRuntime({
    event: {
      id: 'c1',
      type: 'EVENT',
      payload: { type: 'PDF_DECRYPTED', payload: { fileId: 'locked', outputId: 'open' } },
    },
    blob: output,
    onCommand: (command) => { received = command; },
  });

  const result = await decryptPdfInWorker(runtime, 'locked', 'secret');

  assert.equal(new Uint8Array(await result.arrayBuffer()).length, 3);
  assert.deepEqual(received?.payload, { type: 'DECRYPT_PDF', payload: { fileId: 'locked', password: 'secret' } });
  assert.deepEqual(deleted, ['open'], 'the worker copy must not be left in the store');
});

test('a wrong password is reported as the worker reported it', async () => {
  const { runtime } = fakeRuntime({
    event: {
      id: 'c1',
      type: 'EVENT',
      payload: { type: 'ERROR', payload: { message: 'qpdf could not open the file with that password.' } },
    },
  });

  await assert.rejects(() => decryptPdfInWorker(runtime, 'locked', 'nope'), /password/u);
});
