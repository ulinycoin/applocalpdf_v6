import { GlobalRegistry } from '../registry/global-registry';
import { getPdfPageCountFromBytes } from '../pdf/page-count';
import { NoopTelemetrySink, type TelemetrySink } from '../telemetry/telemetry';
import type {
  IWorkerCommand,
  IWorkerEvent,
  IFileSystem,
  RunnerProgressEvent,
  RunnerExecuteResult,
  ToolRunContext,
  ToolRunInput,
} from '../types/contracts';
import type { WorkerOrchestrator } from '../workers/worker-orchestrator';

type AccessDeniedResult = Extract<RunnerExecuteResult, { type: 'TOOL_ACCESS_DENIED' }>;
type PageCountFallbackMode = 'off' | 'limited' | 'on';

/**
 * Execution-wise ceiling shared by every plan. A browser tab cannot hold an arbitrarily large PDF,
 * so this number is a technical guard, not a paywall — the business model puts the wall on
 * downloads, and a free user must be able to process the file they already opened.
 *
 * The per-plan `maxFileSize` in a plugin definition keeps only its Pro value as the tool's own
 * ceiling; the Free value is gone. A file above this constant is refused for everyone, and only a
 * Pro ceiling above this constant (compress, delete pages, extract images, share: 500 MB) still
 * buys a larger file.
 */
export const SAFETY_MAX_FILE_SIZE_BYTES = 250 * 1024 * 1024;

/** The size at which the tool refuses the file outright for this plan. */
export function maxFileSizeForPlan(
  limits: { free: number; pro: number },
  plan: 'basic' | 'pro',
): number {
  return plan === 'pro' ? limits.pro : Math.min(limits.pro, SAFETY_MAX_FILE_SIZE_BYTES);
}

export class UnifiedToolRunner {
  private pageCountTimeoutMs: number;
  private firstPageCountTimeoutMs: number;
  private pageCountChecksPerformed = 0;
  private readonly pageCountFallbackMode: PageCountFallbackMode;

  constructor(
    private readonly registry: GlobalRegistry,
    private readonly workerOrchestrator: WorkerOrchestrator,
    private readonly fileSystem: IFileSystem,
    private readonly telemetry: TelemetrySink = new NoopTelemetrySink(),
    options?: { pageCountTimeoutMs?: number; firstPageCountTimeoutMs?: number; pageCountFallbackMode?: PageCountFallbackMode },
  ) {
    this.pageCountTimeoutMs = options?.pageCountTimeoutMs ?? 5_000;
    this.firstPageCountTimeoutMs = options?.firstPageCountTimeoutMs ?? options?.pageCountTimeoutMs ?? 10_000;
    this.pageCountFallbackMode = options?.pageCountFallbackMode ?? 'limited';
  }

  async execute(
    toolId: string,
    input: ToolRunInput,
    context: ToolRunContext,
    onProgress?: (event: RunnerProgressEvent) => void,
    signal?: AbortSignal,
  ): Promise<RunnerExecuteResult> {
    // Calculate total input size if possible
    let totalInputSize = 0;
    try {
      for (const fileId of input.inputIds) {
        const entry = await this.fileSystem.read(fileId);
        totalInputSize += await entry.getSize();
      }
    } catch {
      // Best effort size calculation
    }

    let accessCheck: AccessDeniedResult | null;
    try {
      accessCheck = await this.validateAccess(toolId, input.inputIds, context, totalInputSize);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Access check failed';
      const typed = error as { code?: unknown };
      const code = typeof typed.code === 'string' ? typed.code : 'ACCESS_CHECK_FAILED';
      const runId = `access-check-${crypto.randomUUID()}`;
      this.telemetry.track({
        type: 'TOOL_RUN_ERROR',
        runId,
        toolId,
        durationMs: 0,
        code,
        message,
      });
      this.publishErrorToast(runId, toolId, message);
      return { type: 'TOOL_ERROR', message, code };
    }
    if (accessCheck) {
      return accessCheck;
    }

    const runId = crypto.randomUUID();
    const startedAt = Date.now();
    const command: IWorkerCommand = {
      id: crypto.randomUUID(),
      type: 'COMMAND',
      payload: {
        type: 'PROCESS_TOOL',
        payload: { toolId, inputIds: input.inputIds, options: input.options },
      },
    };

    let event;
    try {
      event = await this.workerOrchestrator.dispatch(command, (workerEvent) => {
        if (workerEvent.payload.type === 'PROGRESS') {
          const { progress, detail } = workerEvent.payload.payload;
          this.telemetry.track({
            type: 'TOOL_RUN_PROGRESS',
            runId,
            toolId,
            progress,
          });
          onProgress?.({
            type: 'TOOL_PROGRESS',
            progress,
            detail,
          });
        }
      }, signal);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unexpected worker dispatch failure';
      this.telemetry.track({
        type: 'TOOL_RUN_ERROR',
        runId,
        toolId,
        durationMs: Date.now() - startedAt,
        code: 'WORKER_DISPATCH_FAILED',
        message,
      });
      this.publishErrorToast(runId, toolId, message);
      return { type: 'TOOL_ERROR', message, code: 'WORKER_DISPATCH_FAILED' };
    }
    if (event.payload.type === 'RESULT') {
      this.telemetry.track({
        type: 'TOOL_RUN_RESULT',
        runId,
        toolId,
        durationMs: Date.now() - startedAt,
        outputCount: event.payload.payload.outputIds.length,
        totalInputSize,
      });
      return { type: 'TOOL_RESULT', outputIds: event.payload.payload.outputIds };
    }
    if (event.payload.type === 'ERROR') {
      this.telemetry.track({
        type: 'TOOL_RUN_ERROR',
        runId,
        toolId,
        durationMs: Date.now() - startedAt,
        code: event.payload.payload.code,
        message: event.payload.payload.message,
      });
      this.publishErrorToast(runId, toolId, event.payload.payload.message);
      return {
        type: 'TOOL_ERROR',
        message: event.payload.payload.message,
        code: event.payload.payload.code,
      };
    }
    this.telemetry.track({
      type: 'TOOL_RUN_ERROR',
      runId,
      toolId,
      durationMs: Date.now() - startedAt,
      code: 'INVALID_WORKER_EVENT',
      message: 'Unexpected worker event type',
    });
    this.publishErrorToast(runId, toolId, 'Unexpected worker event type');
    return { type: 'TOOL_ERROR', message: 'Unexpected worker event type', code: 'INVALID_WORKER_EVENT' };
  }

  private publishErrorToast(runId: string, toolId: string, message: string): void {
    this.telemetry.track({
      type: 'UI_TOAST_SHOWN',
      runId,
      toolId,
      message,
      level: 'error',
    });
  }

  private publishUpsell(runId: string, toolId: string, reason: string): void {
    this.telemetry.track({
      type: 'UI_UPSELL_SHOWN',
      runId,
      toolId,
      reason,
    });
  }

  async validateAccess(
    toolId: string,
    inputIds: string[],
    context: ToolRunContext,
    totalInputSize?: number,
  ): Promise<AccessDeniedResult | null> {
    const definition = this.registry.get(toolId);
    const runId = `access-check-${crypto.randomUUID()}`;

    this.telemetry.track({
      type: 'TOOL_RUN_STARTED',
      runId,
      toolId,
      inputCount: inputIds.length,
      totalInputSize,
    });



    const entitlementCheck = this.checkEntitlements(definition.entitlements, context.entitlements);
    if (entitlementCheck) {
      this.telemetry.track({
        type: 'TOOL_RUN_DENIED',
        runId,
        toolId,
        reason: entitlementCheck.reason,
      });
      this.publishUpsell(runId, toolId, entitlementCheck.details ?? entitlementCheck.reason);
      return entitlementCheck;
    }

    const tierCheck = this.checkFeatureTier(definition.limits?.featureTier, context.plan);
    if (tierCheck) {
      this.telemetry.track({
        type: 'TOOL_RUN_DENIED',
        runId,
        toolId,
        reason: tierCheck.reason,
      });
      this.publishUpsell(runId, toolId, tierCheck.details ?? tierCheck.reason);
      return tierCheck;
    }

    this.telemetry.track({
      type: 'ACCESS_CHECK_STAGE',
      runId,
      toolId,
      stage: 'CHECK_FILE_LIMITS_START',
    });
    const fileLimitsCheck = await this.checkFileLimits(inputIds, definition.limits, context.plan, runId, toolId);
    this.telemetry.track({
      type: 'ACCESS_CHECK_STAGE',
      runId,
      toolId,
      stage: 'CHECK_FILE_LIMITS_DONE',
    });
    if (fileLimitsCheck) {
      const { denial } = fileLimitsCheck;
      this.telemetry.track({
        type: 'TOOL_RUN_DENIED',
        runId,
        toolId,
        reason: denial.reason,
      });
      const message = denial.details ?? denial.reason;
      if (fileLimitsCheck.upsell) {
        this.publishUpsell(runId, toolId, message);
      } else {
        // Nothing to sell: the limit is the browser's, so say it plainly instead of opening a paywall.
        this.publishErrorToast(runId, toolId, message);
      }
      return denial;
    }

    return null;
  }

  private checkEntitlements(required: string[] | undefined, actual: string[]): AccessDeniedResult | null {
    if (!required || required.length === 0) {
      return null;
    }
    const missing = required.filter((x) => !actual.includes(x));
    if (missing.length > 0) {
      return {
        type: 'TOOL_ACCESS_DENIED',
        reason: 'ENTITLEMENT_REQUIRED',
        details: `Missing entitlements: ${missing.join(', ')}`,
      };
    }
    return null;
  }

  private checkFeatureTier(
    required: 'basic' | 'pro' | undefined,
    actual: 'basic' | 'pro',
  ): AccessDeniedResult | null {
    if (!required) {
      return null;
    }
    if (required === 'pro' && actual !== 'pro') {
      return {
        type: 'TOOL_ACCESS_DENIED',
        reason: 'LIMIT_EXCEEDED',
        details: 'This tool requires PRO tier',
      };
    }
    return null;
  }

  private async checkFileLimits(
    fileIds: string[],
    limits:
      | {
        maxFileSize?: { free: number; pro: number };
        maxPagesPerFile?: { free: number; pro: number };
      }
      | undefined,
    plan: 'basic' | 'pro',
    runId: string,
    toolId: string,
  ): Promise<{ denial: AccessDeniedResult; upsell: boolean } | null> {
    if (!limits) {
      return null;
    }

    const maxFileSize = limits.maxFileSize ? maxFileSizeForPlan(limits.maxFileSize, plan) : null;
    const proMaxFileSize = limits.maxFileSize?.pro ?? null;
    const maxPagesPerFile = limits.maxPagesPerFile
      ? (plan === 'pro' ? limits.maxPagesPerFile.pro : limits.maxPagesPerFile.free)
      : null;

    for (const fileId of fileIds) {
      if (maxFileSize !== null) {
        const startedAt = Date.now();
        this.telemetry.track({
          type: 'ACCESS_CHECK_STAGE',
          runId,
          toolId,
          fileId,
          stage: 'MAX_FILE_SIZE_READ_START',
        });
        const entry = await this.fileSystem.read(fileId);
        const size = await entry.getSize();
        this.telemetry.track({
          type: 'ACCESS_CHECK_STAGE',
          runId,
          toolId,
          fileId,
          stage: 'MAX_FILE_SIZE_READ_DONE',
          durationMs: Date.now() - startedAt,
        });
        if (size > maxFileSize) {
          // A Pro ceiling above the safety limit is the only case where paying actually buys a
          // bigger file; otherwise the refusal is technical and must not be sold as an upgrade.
          const upgradeHelps = plan !== 'pro' && proMaxFileSize !== null && proMaxFileSize > maxFileSize;
          const sizeMb = Math.ceil(size / (1024 * 1024));
          const capMb = Math.round(maxFileSize / (1024 * 1024));
          return {
            denial: {
              type: 'TOOL_ACCESS_DENIED',
              reason: 'LIMIT_EXCEEDED',
              details: upgradeHelps
                ? `This file is ${sizeMb} MB. Free handles up to ${capMb} MB, Pro up to ${Math.round(proMaxFileSize! / (1024 * 1024))} MB.`
                : `This file is ${sizeMb} MB — larger than a browser tab can process safely (${capMb} MB limit).`,
            },
            upsell: upgradeHelps,
          };
        }
      }

      if (maxPagesPerFile !== null) {
        this.telemetry.track({
          type: 'ACCESS_CHECK_STAGE',
          runId,
          toolId,
          fileId,
          stage: 'PAGE_COUNT_CHECK_START',
        });
        const pageCount = await this.getPdfPageCount(fileId, runId, toolId);
        this.telemetry.track({
          type: 'ACCESS_CHECK_STAGE',
          runId,
          toolId,
          fileId,
          stage: 'PAGE_COUNT_CHECK_DONE',
        });
        if (pageCount > maxPagesPerFile) {
          return {
            denial: {
              type: 'TOOL_ACCESS_DENIED',
              reason: 'LIMIT_EXCEEDED',
              details: `File ${fileId} exceeds maxPagesPerFile`,
            },
            upsell: true,
          };
        }
      }
    }

    return null;
  }

  private async getPdfPageCount(fileId: string, runId: string, toolId: string): Promise<number> {
    const startedAt = Date.now();
    this.telemetry.track({
      type: 'ACCESS_CHECK_STAGE',
      runId,
      toolId,
      fileId,
      stage: 'READ_FILE_FOR_PAGE_COUNT_START',
    });
    const entry = await this.fileSystem.read(fileId);
    this.telemetry.track({
      type: 'ACCESS_CHECK_STAGE',
      runId,
      toolId,
      fileId,
      stage: 'READ_FILE_FOR_PAGE_COUNT_DONE',
      durationMs: Date.now() - startedAt,
    });
    const mimeType = await entry.getType();
    if (mimeType !== 'application/pdf') {
      this.telemetry.track({
        type: 'PAGE_COUNT_CHECK_RESULT',
        runId,
        toolId,
        fileId,
        pageCount: 1,
        durationMs: Date.now() - startedAt,
      });
      return 1;
    }
    this.telemetry.track({
      type: 'ACCESS_CHECK_STAGE',
      runId,
      toolId,
      fileId,
      stage: 'READ_BLOB_FOR_PAGE_COUNT_START',
    });
    // ── Read file bytes for page count ──────────────────────────────────
    // NOTE: The full file is loaded into main-thread memory here (blob →
    // arrayBuffer). The bytes are then sent to the worker via postMessage
    // (structured clone = second copy). This doubles peak memory for large
    // files. Mitigated by maxFileSize limits (50MB free, 500MB pro).
    //
    // Optimization opportunity: use Transferable postMessage to zero-copy
    // the bytes.buffer to the worker, then re-read from VFS for the
    // main-thread fallback path.
    const blob = await entry.getBlob();
    const bytes = new Uint8Array(await blob.arrayBuffer());
    this.telemetry.track({
      type: 'ACCESS_CHECK_STAGE',
      runId,
      toolId,
      fileId,
      stage: 'READ_BLOB_FOR_PAGE_COUNT_DONE',
      durationMs: Date.now() - startedAt,
    });
    const command: IWorkerCommand = {
      id: crypto.randomUUID(),
      type: 'COMMAND',
      payload: { type: 'GET_PDF_PAGE_COUNT', payload: { fileId, bytes, mimeType } },
    };

    let event: IWorkerEvent;
    const timeoutMs = this.pageCountChecksPerformed === 0 ? this.firstPageCountTimeoutMs : this.pageCountTimeoutMs;
    this.telemetry.track({
      type: 'ACCESS_CHECK_STAGE',
      runId,
      toolId,
      fileId,
      stage: 'PAGE_COUNT_DISPATCH_START',
    });
    const abortController = new AbortController();
    try {
      event = await new Promise<IWorkerEvent>((resolve, reject) => {
        const timer = setTimeout(() => {
          abortController.abort();
          reject(this.createCodedError('PAGE_COUNT_CHECK_TIMEOUT', 'Page-count precheck timed out'));
        }, timeoutMs);

        this.workerOrchestrator
          .dispatch(command, (workerEvent) => {
            if (workerEvent.payload.type === 'DIAGNOSTIC' && workerEvent.payload.payload.channel === 'PAGE_COUNT') {
              this.telemetry.track({
                type: 'PAGE_COUNT_WORKER_STAGE',
                runId,
                toolId,
                fileId,
                stage: workerEvent.payload.payload.stage,
                durationMs: workerEvent.payload.payload.durationMs,
                note: workerEvent.payload.payload.note,
              });
            }
          }, abortController.signal)
          .then(
            (result) => {
              clearTimeout(timer);
              resolve(result);
            },
            (err) => {
              clearTimeout(timer);
              reject(err);
            },
          );
      });
    } catch (error) {
      const typed = error as { code?: unknown; message?: unknown };
      const code = typeof typed.code === 'string' ? typed.code : 'PAGE_COUNT_QUERY_FAILED';
      const message = error instanceof Error ? error.message : 'Page-count precheck failed';
      const canFallbackToMainThread = this.canFallbackToMainThread(code, timeoutMs);
      if (canFallbackToMainThread) {
        this.telemetry.track({
          type: 'ACCESS_CHECK_STAGE',
          runId,
          toolId,
          fileId,
          stage: 'PAGE_COUNT_MAIN_THREAD_FALLBACK_START',
        });
        try {
          const pageCount = await getPdfPageCountFromBytes(bytes, mimeType);
          this.telemetry.track({
            type: 'ACCESS_CHECK_STAGE',
            runId,
            toolId,
            fileId,
            stage: 'PAGE_COUNT_MAIN_THREAD_FALLBACK_DONE',
            durationMs: Date.now() - startedAt,
          });
          this.telemetry.track({
            type: 'PAGE_COUNT_CHECK_RESULT',
            runId,
            toolId,
            fileId,
            pageCount,
            durationMs: Date.now() - startedAt,
          });
          return pageCount;
        } catch (fallbackError) {
          const fallbackMessage = fallbackError instanceof Error ? fallbackError.message : 'Main-thread fallback failed';
          this.telemetry.track({
            type: 'ACCESS_CHECK_STAGE',
            runId,
            toolId,
            fileId,
            stage: 'PAGE_COUNT_MAIN_THREAD_FALLBACK_FAILED',
            durationMs: Date.now() - startedAt,
          });
          this.telemetry.track({
            type: 'PAGE_COUNT_CHECK_ERROR',
            runId,
            toolId,
            fileId,
            code: 'PAGE_COUNT_MAIN_THREAD_FALLBACK_FAILED',
            message: fallbackMessage,
            durationMs: Date.now() - startedAt,
          });
          throw this.createCodedError('PAGE_COUNT_MAIN_THREAD_FALLBACK_FAILED', fallbackMessage);
        }
      }
      this.telemetry.track({
        type: 'PAGE_COUNT_CHECK_ERROR',
        runId,
        toolId,
        fileId,
        code,
        message,
        durationMs: Date.now() - startedAt,
      });
      throw this.createCodedError(code, message);
    } finally {
      this.pageCountChecksPerformed += 1;
    }
    if (event.payload.type === 'PAGE_COUNT_RESULT') {
      this.telemetry.track({
        type: 'PAGE_COUNT_CHECK_RESULT',
        runId,
        toolId,
        fileId,
        pageCount: event.payload.payload.pageCount,
        durationMs: Date.now() - startedAt,
      });
      return event.payload.payload.pageCount;
    }
    if (event.payload.type === 'ERROR') {
      const code = event.payload.payload.code ?? 'PAGE_COUNT_QUERY_FAILED';
      const canFallbackToMainThread = this.canFallbackToMainThread(code, timeoutMs);
      if (canFallbackToMainThread) {
        this.telemetry.track({
          type: 'ACCESS_CHECK_STAGE',
          runId,
          toolId,
          fileId,
          stage: 'PAGE_COUNT_MAIN_THREAD_FALLBACK_START',
        });
        try {
          const pageCount = await getPdfPageCountFromBytes(bytes, mimeType);
          this.telemetry.track({
            type: 'ACCESS_CHECK_STAGE',
            runId,
            toolId,
            fileId,
            stage: 'PAGE_COUNT_MAIN_THREAD_FALLBACK_DONE',
            durationMs: Date.now() - startedAt,
          });
          this.telemetry.track({
            type: 'PAGE_COUNT_CHECK_RESULT',
            runId,
            toolId,
            fileId,
            pageCount,
            durationMs: Date.now() - startedAt,
          });
          return pageCount;
        } catch (fallbackError) {
          const fallbackMessage = fallbackError instanceof Error ? fallbackError.message : 'Main-thread fallback failed';
          this.telemetry.track({
            type: 'ACCESS_CHECK_STAGE',
            runId,
            toolId,
            fileId,
            stage: 'PAGE_COUNT_MAIN_THREAD_FALLBACK_FAILED',
            durationMs: Date.now() - startedAt,
          });
          this.telemetry.track({
            type: 'PAGE_COUNT_CHECK_ERROR',
            runId,
            toolId,
            fileId,
            code: 'PAGE_COUNT_MAIN_THREAD_FALLBACK_FAILED',
            message: fallbackMessage,
            durationMs: Date.now() - startedAt,
          });
          throw this.createCodedError('PAGE_COUNT_MAIN_THREAD_FALLBACK_FAILED', fallbackMessage);
        }
      }
      this.telemetry.track({
        type: 'PAGE_COUNT_CHECK_ERROR',
        runId,
        toolId,
        fileId,
        code,
        message: event.payload.payload.message,
        durationMs: Date.now() - startedAt,
      });
      throw this.createCodedError(code, `${code}: ${event.payload.payload.message}`);
    }
    this.telemetry.track({
      type: 'PAGE_COUNT_CHECK_ERROR',
      runId,
      toolId,
      fileId,
      code: 'PAGE_COUNT_QUERY_INVALID_EVENT',
      message: `Unexpected worker event type: ${event.payload.type}`,
      durationMs: Date.now() - startedAt,
    });
    throw this.createCodedError('PAGE_COUNT_QUERY_INVALID_EVENT', `PAGE_COUNT_QUERY_INVALID_EVENT: ${event.payload.type}`);
  }

  private createCodedError(code: string, message: string): Error & { code: string } {
    const error = new Error(message) as Error & { code: string };
    error.code = code;
    return error;
  }

  private canFallbackToMainThread(code: string, timeoutMs: number): boolean {
    if (this.pageCountFallbackMode === 'off') {
      return false;
    }
    if (this.pageCountFallbackMode === 'on') {
      return timeoutMs >= 1_000;
    }
    return timeoutMs >= 1_000 && (code === 'WORKER_TIMEOUT' || code === 'WORKER_CRASH');
  }
}
