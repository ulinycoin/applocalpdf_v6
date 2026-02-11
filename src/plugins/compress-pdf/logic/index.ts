import type { ToolLogicFunction } from '../../../core/types/contracts';
import { createCompressEngine } from '../../../services/pdf/compress-engine';

export const run: ToolLogicFunction = async ({ inputIds, fs, options, emitProgress }) => {
    if (inputIds.length === 0) {
        throw new Error('Compress PDF requires at least one input file');
    }

    const engine = await createCompressEngine();
    const outputIds: string[] = [];

    for (let i = 0; i < inputIds.length; i++) {
        const entry = await fs.read(inputIds[i]);
        const blob = await entry.getBlob();

        // Perform compression
        const compressedBlob = await engine.compress(blob, {
            quality: (options?.quality as 'low' | 'medium' | 'high') || 'medium'
        });

        const outEntry = await fs.write(compressedBlob);
        outputIds.push(outEntry.id);

        const progress = Math.round(((i + 1) / inputIds.length) * 100);
        emitProgress?.(progress);
    }

    return { outputIds };
};
