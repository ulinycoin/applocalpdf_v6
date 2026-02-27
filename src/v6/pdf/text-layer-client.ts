import { IWorkerCommand } from '../../core/public/contracts';
import { TextLayerSpan } from '../components/Studio/editor-types';

export async function requestTextLayerSpans(
    runtime: any,
    fileId: string,
    pageNumber: number,
    signal?: AbortSignal,
): Promise<TextLayerSpan[]> {
    const command: IWorkerCommand = {
        id: crypto.randomUUID(),
        type: 'COMMAND',
        payload: {
            type: 'GET_PDF_TEXT_LAYER',
            payload: { fileId, pageNumber },
        },
    };
    const finalEvent = await runtime.workerOrchestrator.dispatch(command, undefined, signal);
    if (finalEvent.payload.type === 'TEXT_LAYER_RESULT') {
        return finalEvent.payload.payload.spans;
    }
    if (finalEvent.payload.type === 'ERROR') {
        const error = new Error(finalEvent.payload.payload.message) as Error & { code?: string };
        error.code = finalEvent.payload.payload.code;
        throw error;
    }
    throw new Error('Unexpected worker response for text layer request');
}

export async function requestTextLayerSpansFallback(
    runtime: any,
    fileId: string,
    pageNumber: number,
): Promise<TextLayerSpan[]> {
    const fallbackSpan = (text: string): TextLayerSpan => ({
        id: `fallback-span-${fileId}-${pageNumber}`,
        text,
        xRatio: 0.08,
        yRatio: 0.12,
        widthRatio: 0.84,
        heightRatio: 0.06,
        fontSizeRatio: 0.018,
        pageHeightPt: 842,
    });
    const containsTextOperators = (data: Uint8Array): boolean => {
        if (data.byteLength === 0) {
            return false;
        }
        const sample = new TextDecoder('latin1').decode(data.slice(0, 240_000));
        return /\bBT\b/u.test(sample) && /\b(Tj|TJ)\b/u.test(sample);
    };
    const tryInflateDeflate = async (raw: Uint8Array): Promise<Uint8Array | null> => {
        if (typeof DecompressionStream === 'undefined' || raw.byteLength === 0) {
            return null;
        }
        for (const format of ['deflate', 'deflate-raw'] as const) {
            try {
                const stream = new DecompressionStream(format);
                const writer = stream.writable.getWriter();
                await writer.write(new Uint8Array(raw));
                await writer.close();
                const inflated = await new Response(stream.readable).arrayBuffer();
                return new Uint8Array(inflated);
            } catch {
                // Try next format.
            }
        }
        return null;
    };
    const detectTextOperatorsWithPdfLib = async (data: Uint8Array): Promise<boolean> => {
        try {
            const { PDFDocument, PDFName } = await import('pdf-lib');
            const doc = await PDFDocument.load(data);
            const page = doc.getPage(Math.max(0, pageNumber - 1));
            const contentsRef = page.node.get(PDFName.of('Contents'));
            if (!contentsRef) {
                return false;
            }
            const resolved = doc.context.lookup(contentsRef as any) as any;
            const streams: any[] = [];
            if (resolved && typeof resolved.size === 'function' && typeof resolved.get === 'function') {
                const count = Number(resolved.size());
                for (let i = 0; i < count; i += 1) {
                    streams.push(doc.context.lookup(resolved.get(i)));
                }
            } else {
                streams.push(resolved);
            }
            for (const stream of streams) {
                if (!stream || typeof stream.getContents !== 'function') {
                    continue;
                }
                const raw = stream.getContents() as Uint8Array;
                if (containsTextOperators(raw)) {
                    return true;
                }
                const inflated = await tryInflateDeflate(raw);
                if (inflated && containsTextOperators(inflated)) {
                    return true;
                }
            }
            return false;
        } catch {
            return false;
        }
    };

    const entry = await runtime.vfs.read(fileId);
    const blob = await entry.getBlob();
    const bytes = new Uint8Array(await blob.arrayBuffer());
    if (containsTextOperators(bytes) || await detectTextOperatorsWithPdfLib(bytes)) {
        return [fallbackSpan('Editable text')];
    }
    return [];
}
