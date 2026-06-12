import { WebFileSystemAdapter } from '../io/web-filesystem-adapter';
import { warmupPdfLib } from '../pdf/page-count';
import { createRegistry } from '../registry/register-tools';
import type { IWorkerCommand } from '../types/contracts';
import { executeWorkerCommand } from './worker-runtime';

// Suppress tesseract.js LSTM-only config warnings ("Parameter not found").
// Tesseract's LSTM engine doesn't use legacy config params, but the library
// still tries to set them. These warnings are harmless noise.
const _warn = console.warn;
console.warn = (...args) => {
  if (typeof args[0] === 'string' && args[0].includes('Parameter not found')) return;
  _warn.apply(console, args);
};

const registry = createRegistry();
const fs = new WebFileSystemAdapter();

// Start loading heavy PDF parser code off the hot path for first pre-check.
void warmupPdfLib().catch(() => {
  // Keep worker startup resilient: metadata calls will retry lazy-load on demand.
});

self.onmessage = async (event: MessageEvent<IWorkerCommand>) => {
  const command = event.data;
  const finalEvent = await executeWorkerCommand(command, { registry, fs }, (progressEvent) => {
    self.postMessage(progressEvent);
  });
  self.postMessage(finalEvent);
};
