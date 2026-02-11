import { GlobalRegistry } from '../registry/global-registry';
import type { IFileSystem, IWorkerCommand, IWorkerEvent } from '../types/contracts';
import { getPdfPageCountFromBytes } from '../pdf/page-count';

export interface WorkerRuntimeDeps {
  registry: GlobalRegistry;
  fs: IFileSystem;
}

export async function executeWorkerCommand(
  command: IWorkerCommand,
  deps: WorkerRuntimeDeps,
  onProgress?: (event: IWorkerEvent) => void,
): Promise<IWorkerEvent> {
  try {
    if (command.payload.type === 'GET_PDF_PAGE_COUNT') {
      const commandStartedAt = Date.now();
      const { fileId, bytes, mimeType } = command.payload.payload;
      const emitDiagnostic = (stage: string, durationMs?: number, note?: string): void => {
        onProgress?.({
          id: command.id,
          type: 'EVENT',
          payload: {
            type: 'DIAGNOSTIC',
            payload: { channel: 'PAGE_COUNT', stage, fileId, durationMs, note },
          },
        });
      };

      emitDiagnostic('WORKER_COMMAND_RECEIVED');
      let pdfBytes = bytes;
      let effectiveMimeType = mimeType;
      if (pdfBytes === undefined) {
        const readStartedAt = Date.now();
        emitDiagnostic('WORKER_FS_READ_START');
        const entry = await deps.fs.read(fileId);
        emitDiagnostic('WORKER_FS_READ_DONE', Date.now() - readStartedAt);
        const typeStartedAt = Date.now();
        emitDiagnostic('WORKER_GET_TYPE_START');
        effectiveMimeType = await entry.getType();
        emitDiagnostic('WORKER_GET_TYPE_DONE', Date.now() - typeStartedAt, effectiveMimeType);
        const blobStartedAt = Date.now();
        emitDiagnostic('WORKER_GET_BLOB_START');
        const blob = await entry.getBlob();
        emitDiagnostic('WORKER_GET_BLOB_DONE', Date.now() - blobStartedAt);
        const bufferStartedAt = Date.now();
        emitDiagnostic('WORKER_ARRAY_BUFFER_START');
        pdfBytes = new Uint8Array(await blob.arrayBuffer());
        emitDiagnostic('WORKER_ARRAY_BUFFER_DONE', Date.now() - bufferStartedAt, `${pdfBytes.byteLength} bytes`);
      } else {
        emitDiagnostic('WORKER_INLINE_BYTES_RECEIVED', undefined, `${pdfBytes.byteLength} bytes`);
      }
      const parseStartedAt = Date.now();
      emitDiagnostic('WORKER_PARSE_START');
      const pageCount = await getPdfPageCountFromBytes(pdfBytes, effectiveMimeType);
      emitDiagnostic('WORKER_PARSE_DONE', Date.now() - parseStartedAt, `pages=${pageCount}`);
      emitDiagnostic('WORKER_COMMAND_DONE', Date.now() - commandStartedAt);
      return {
        id: command.id,
        type: 'EVENT',
        payload: { type: 'PAGE_COUNT_RESULT', payload: { fileId, pageCount } },
      };
    }

    if (command.payload.type === 'PROCESS_TOOL') {
      const { toolId, inputIds, options } = command.payload.payload;
      const definition = deps.registry.get(toolId);
      const logicModule = await definition.logicLoader();
      const output = await logicModule.run({
        inputIds,
        options,
        fs: deps.fs,
        emitProgress: (progress) => {
          onProgress?.({
            id: command.id,
            type: 'EVENT',
            payload: { type: 'PROGRESS', payload: { progress } },
          });
        },
      });
      return {
        id: command.id,
        type: 'EVENT',
        payload: { type: 'RESULT', payload: { outputIds: output.outputIds } },
      };
    }

    if (command.payload.type === 'READ_FILE') {
      const file = await deps.fs.read(command.payload.payload.fileId);
      return {
        id: command.id,
        type: 'EVENT',
        payload: { type: 'RESULT', payload: { outputIds: [file.id] } },
      };
    }

    return {
      id: command.id,
      type: 'EVENT',
      payload: { type: 'ERROR', payload: { message: 'Unknown command', code: 'UNKNOWN_COMMAND' } },
    };
  } catch (error) {
    const typed = error as { code?: unknown; message?: unknown };
    return {
      id: command.id,
      type: 'EVENT',
      payload: {
        type: 'ERROR',
        payload: {
          message: error instanceof Error ? error.message : 'Worker runtime failure',
          code: typeof typed.code === 'string' ? typed.code : 'WORKER_RUNTIME_ERROR',
        },
      },
    };
  }
}
