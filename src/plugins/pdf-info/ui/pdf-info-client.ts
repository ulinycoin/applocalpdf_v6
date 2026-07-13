import type { PlatformRuntime } from '../../../app/platform/create-platform';
import type { IWorkerCommand, ToolRunResult } from '../../../core/public/contracts';
import type { PdfInfoReport } from '../../../services/pdf/pdf-info-analyzer';

export async function requestPdfInfo(
  runtime: PlatformRuntime,
  fileId: string,
  signal?: AbortSignal,
): Promise<PdfInfoReport> {
  const command: IWorkerCommand = {
    id: crypto.randomUUID(),
    type: 'COMMAND',
    payload: {
      type: 'PROCESS_TOOL',
      payload: {
        toolId: 'pdf-info',
        inputIds: [fileId],
      },
    },
  };

  const finalEvent = await runtime.workerOrchestrator.dispatch(command, undefined, signal);

  if (finalEvent.payload.type === 'RESULT') {
    const result = finalEvent.payload.payload as ToolRunResult;
    if (result.outputIds.length === 0) {
      throw new Error('No analysis output returned');
    }

    const entry = await runtime.vfs.read(result.outputIds[0]!);
    const text = await entry.getText();
    const parsed = JSON.parse(text) as PdfInfoReport;
    await runtime.vfs.delete(result.outputIds[0]!);
    return parsed;
  }

  if (finalEvent.payload.type === 'ERROR') {
    throw new Error(finalEvent.payload.payload.message || 'PDF analysis failed');
  }

  throw new Error('Unexpected worker response');
}
