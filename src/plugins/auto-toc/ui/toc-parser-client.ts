import type { PlatformRuntime } from '../../../app/platform/create-platform';
import type { HeaderNode } from '../logic/index';
import type { IWorkerCommand, ToolRunResult } from '../../../core/types/contracts';

/**
 * Result from parsing a PDF for headings.
 */
export interface TocParseResult {
    headers: HeaderNode[];
    bodyTextSize: number | null;
    totalSpansExtracted: number;
    headingCandidatesFound: number;
    totalPages?: number;
    error?: string;
}

/**
 * Dispatch a tool command to the worker to parse a PDF for headings.
 * Uses the same worker orchestrator as the wizard flow but returns
 * structured data instead of a VFS file.
 */
export async function requestTocParse(
    runtime: PlatformRuntime,
    fileId: string,
    signal?: AbortSignal,
): Promise<TocParseResult> {
    const command: IWorkerCommand = {
        id: crypto.randomUUID(),
        type: 'COMMAND',
        payload: {
            type: 'PROCESS_TOOL',
            payload: {
                toolId: 'auto-toc',
                inputIds: [fileId],
                options: { action: 'parse' },
            },
        },
    };

    const finalEvent = await runtime.workerOrchestrator.dispatch(command, undefined, signal);

    if (finalEvent.payload.type === 'RESULT') {
        const result = finalEvent.payload.payload as ToolRunResult;
        // The tool writes a JSON file to VFS. Read it back.
        if (result.outputIds.length > 0) {
            const jsonFileId = result.outputIds[0];
            const entry = await runtime.vfs.read(jsonFileId);
            const text = await entry.getText();
            try {
                const parsed = JSON.parse(text) as Record<string, unknown>;
                const headers = Array.isArray(parsed.headers) ? parsed.headers as TocParseResult['headers'] : [];
                return {
                    headers,
                    bodyTextSize: (typeof parsed.bodyTextSize === 'number' ? parsed.bodyTextSize : null) as number | null,
                    totalSpansExtracted: typeof parsed.totalSpansExtracted === 'number' ? parsed.totalSpansExtracted : 0,
                    headingCandidatesFound: typeof parsed.headingCandidatesFound === 'number' ? parsed.headingCandidatesFound : 0,
                    totalPages: typeof parsed.totalPages === 'number' ? parsed.totalPages : undefined,
                    error: typeof parsed.error === 'string' ? parsed.error : undefined,
                } satisfies TocParseResult;
            } catch {
                return {
                    headers: [],
                    bodyTextSize: null,
                    totalSpansExtracted: 0,
                    headingCandidatesFound: 0,
                    error: 'Failed to parse tool output',
                };
            }
        }
        return {
            headers: [],
            bodyTextSize: null,
            totalSpansExtracted: 0,
            headingCandidatesFound: 0,
            error: 'No output from tool',
        };
    }

    if (finalEvent.payload.type === 'ERROR') {
        return {
            headers: [],
            bodyTextSize: null,
            totalSpansExtracted: 0,
            headingCandidatesFound: 0,
            error: finalEvent.payload.payload.message,
        };
    }

    return {
        headers: [],
        bodyTextSize: null,
        totalSpansExtracted: 0,
        headingCandidatesFound: 0,
        error: 'Unexpected worker response',
    };
}
