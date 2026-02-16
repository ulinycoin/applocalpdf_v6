import type { ToolLogicFunction } from '../../../core/types/contracts';

export const run: ToolLogicFunction = async ({ inputIds, fs, options, emitProgress }) => {
  void inputIds;
  void fs;
  void options;
  emitProgress?.(100);
  throw new Error('PDF Editor logic disabled. Rebuild required.');
};
