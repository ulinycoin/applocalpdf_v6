import type { ReactNode } from 'react';
import { createContext, useContext, useEffect, useMemo } from 'react';
import { bootstrapPlatform, type PlatformBootstrap } from '../platform/bootstrap';

const PlatformContext = createContext<PlatformBootstrap | null>(null);

export function PlatformProvider({ children }: { children: ReactNode }) {
  const value = useMemo(() => bootstrapPlatform('browser-worker'), []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const workerOrchestrator = value.runtime.workerOrchestrator as {
      dispatch: (command: any, onEvent?: (event: any) => void, signal?: AbortSignal) => Promise<any>;
      terminateForTest?: () => void;
    };
    const originalDispatch = workerOrchestrator.dispatch.bind(workerOrchestrator);
    let pageCountDelayMs = 0;
    let crashNextProcessToolRun = false;
    let crashNextPageCountRun = false;

    const delayedDispatch: typeof originalDispatch = async (command, onEvent, signal) => {
      if (crashNextPageCountRun && command?.payload?.type === 'GET_PDF_PAGE_COUNT') {
        crashNextPageCountRun = false;
        workerOrchestrator.terminateForTest?.();
        return {
          id: command.id,
          type: 'EVENT',
          payload: {
            type: 'ERROR',
            payload: { message: 'Injected page-count crash (e2e)', code: 'WORKER_CRASH' },
          },
        };
      }
      if (crashNextProcessToolRun && command?.payload?.type === 'PROCESS_TOOL') {
        crashNextProcessToolRun = false;
        workerOrchestrator.terminateForTest?.();
        return {
          id: command.id,
          type: 'EVENT',
          payload: {
            type: 'ERROR',
            payload: { message: 'Injected worker crash (e2e)', code: 'WORKER_CRASH' },
          },
        };
      }
      if (pageCountDelayMs > 0 && command?.payload?.type === 'GET_PDF_PAGE_COUNT') {
        await new Promise<void>((resolve) => {
          setTimeout(resolve, pageCountDelayMs);
        });
      }
      return originalDispatch(command, onEvent, signal);
    };
    workerOrchestrator.dispatch = delayedDispatch;

    (window as any).__LOCALPDF_V6_TEST_API = {
      trackTelemetry: (event: unknown) => value.runtime.telemetry.track(event as any),
      getTelemetrySnapshot: () => value.runtime.telemetry.snapshot(),
      clearTelemetry: () => value.runtime.telemetry.clear(),
      setPageCountDelayMs: (ms: number) => {
        pageCountDelayMs = Math.max(0, Math.floor(ms));
      },
      setPageCountTimeoutMs: (ms: number) => {
        const timeout = Math.max(1, Math.floor(ms));
        (value.runtime.runner as any).pageCountTimeoutMs = timeout;
        (value.runtime.runner as any).firstPageCountTimeoutMs = timeout;
      },
      setPageCountFallbackMode: (mode: 'off' | 'limited' | 'on') => {
        (value.runtime.runner as any).pageCountFallbackMode = mode;
      },
      injectProcessToolCrashOnce: () => {
        crashNextProcessToolRun = true;
      },
      injectPageCountCrashOnce: () => {
        crashNextPageCountRun = true;
      },
      resetWorkerTestHooks: () => {
        pageCountDelayMs = 0;
        crashNextProcessToolRun = false;
        crashNextPageCountRun = false;
        (value.runtime.runner as any).pageCountTimeoutMs = 5_000;
        (value.runtime.runner as any).firstPageCountTimeoutMs = 10_000;
        (value.runtime.runner as any).pageCountFallbackMode = 'limited';
      },
    };
    return () => {
      workerOrchestrator.dispatch = originalDispatch;
      delete (window as any).__LOCALPDF_V6_TEST_API;
    };
  }, [value.runtime.telemetry]);

  return <PlatformContext.Provider value={value}>{children}</PlatformContext.Provider>;
}

export function usePlatform(): PlatformBootstrap {
  const value = useContext(PlatformContext);
  if (!value) {
    throw new Error('PlatformProvider is not mounted');
  }
  return value;
}
