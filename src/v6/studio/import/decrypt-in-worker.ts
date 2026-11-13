import type { PlatformRuntime } from '../../../app/platform/create-platform';
import type { IWorkerCommand } from '../../../core/public/contracts';

/**
 * Decrypts a document through the worker: qpdf runs as wasm off the canvas thread, the decrypted
 * copy is read back and its worker-side file is removed so nothing is stored twice.
 */
export async function decryptPdfInWorker(
  runtime: PlatformRuntime,
  fileId: string,
  password: string,
): Promise<Blob> {
  const command: IWorkerCommand = {
    id: crypto.randomUUID(),
    type: 'COMMAND',
    payload: { type: 'DECRYPT_PDF', payload: { fileId, password } },
  };
  const event = await runtime.workerOrchestrator.dispatch(command);
  if (event.payload.type === 'ERROR') {
    throw new Error(event.payload.payload.message);
  }
  if (event.payload.type !== 'PDF_DECRYPTED') {
    throw new Error('Unexpected worker response for PDF decryption');
  }
  const outputId = event.payload.payload.outputId;
  try {
    const entry = await runtime.vfs.read(outputId);
    return await entry.getBlob();
  } finally {
    await runtime.vfs.delete(outputId).catch(() => undefined);
  }
}
