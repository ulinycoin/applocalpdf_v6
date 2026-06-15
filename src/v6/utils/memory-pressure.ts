type MemoryPressureCallback = () => void;

const listeners: Set<MemoryPressureCallback> = new Set();
let monitoring = false;
let memoryCheckInterval: ReturnType<typeof setInterval> | null = null;

const MEMORY_WARNING_THRESHOLD_MB = 1500;
const MEMORY_CRITICAL_THRESHOLD_MB = 2500;
const CHECK_INTERVAL_MS = 5000;

function getMemoryUsageMB(): number | null {
  if (typeof performance === 'undefined' || !('memory' in performance)) {
    return null;
  }
  const mem = (performance as any).memory;
  if (mem && typeof mem.usedJSHeapSize === 'number') {
    return mem.usedJSHeapSize / (1024 * 1024);
  }
  return null;
}

function checkMemoryPressure(): void {
  const usageMB = getMemoryUsageMB();
  if (usageMB === null) return;

  if (usageMB > MEMORY_CRITICAL_THRESHOLD_MB || usageMB > MEMORY_WARNING_THRESHOLD_MB) {
    for (const cb of listeners) {
      cb();
    }
  }
}

export function onMemoryPressure(callback: MemoryPressureCallback): () => void {
  listeners.add(callback);
  if (!monitoring) {
    monitoring = true;
    memoryCheckInterval = setInterval(checkMemoryPressure, CHECK_INTERVAL_MS);
  }
  return () => {
    listeners.delete(callback);
    if (listeners.size === 0 && memoryCheckInterval) {
      clearInterval(memoryCheckInterval);
      memoryCheckInterval = null;
      monitoring = false;
    }
  };
}

export function getMemoryStats(): { usedMB: number | null; supported: boolean } {
  return {
    usedMB: getMemoryUsageMB(),
    supported: typeof performance !== 'undefined' && 'memory' in performance,
  };
}
