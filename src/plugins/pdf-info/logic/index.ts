import type { ToolLogicFunction } from '../../../core/types/contracts';
import { analyzePdfInfo } from '../../../services/pdf/pdf-info-analyzer';

export const run: ToolLogicFunction = async ({ inputIds, fs, emitProgress }) => {
  if (inputIds.length === 0) {
    throw new Error('PDF Info requires at least one input file');
  }

  emitProgress?.(5);
  const entry = await fs.read(inputIds[0]!);
  const blob = await entry.getBlob();
  emitProgress?.(20);

  const report = await analyzePdfInfo(blob, entry.getName());
  emitProgress?.(90);

  const outputEntry = await fs.write(new Blob([JSON.stringify(report)], { type: 'application/json' }));
  emitProgress?.(100);

  return { outputIds: [outputEntry.id] };
};
