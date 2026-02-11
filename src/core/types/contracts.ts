import type { ComponentType } from 'react';

export type FeatureTier = 'basic' | 'pro';

export interface TieredNumberLimit {
  free: number;
  pro: number;
}

export interface ToolLimits {
  maxFileSize?: TieredNumberLimit;
  maxPagesPerFile?: TieredNumberLimit;
  monthlyQuota?: TieredNumberLimit;
  featureTier?: FeatureTier;
}

export interface ToolRunContext {
  userId: string;
  plan: FeatureTier;
  entitlements: string[];
  usageThisMonthByTool?: Record<string, number>;
}

export interface ToolRunInput {
  inputIds: string[];
  options?: Record<string, unknown>;
}

export interface ToolRunResult {
  outputIds: string[];
}

export interface ToolUiModule {
  default: ComponentType<any>;
}

export type ToolLogicFunction = (params: {
  inputIds: string[];
  options?: Record<string, unknown>;
  fs: IFileSystem;
  emitProgress?: (percent: number) => void;
}) => Promise<{ outputIds: string[] }>;

export interface ToolLogicModule {
  run: ToolLogicFunction;
}

export interface IToolDefinition {
  id: string;
  name: string;
  description: string;
  entitlements?: string[];
  limits?: ToolLimits;
  uiLoader: () => Promise<ToolUiModule>;
  logicLoader: () => Promise<ToolLogicModule>;
  layout?: 'default' | 'split';
  premiumVisuals?: boolean;
}

export interface IFileEntry {
  readonly id: string;
  getBlob(): Promise<Blob>;
  getText(): Promise<string>;
  getName(): string;
  getSize(): Promise<number>;
  getType(): Promise<string>;
}

export interface IFileSystem {
  write(data: Blob): Promise<IFileEntry>;
  read(id: string): Promise<IFileEntry>;
  delete(id: string): Promise<void>;
}

export interface IFileMetadataService {
  getPageCount(fileId: string): Promise<number>;
}

export type WorkerCommandPayload =
  | { type: 'PROCESS_TOOL'; payload: { toolId: string; inputIds: string[]; options?: Record<string, unknown> } }
  | { type: 'GET_PDF_PAGE_COUNT'; payload: { fileId: string; bytes?: Uint8Array; mimeType?: string } }
  | { type: 'READ_FILE'; payload: { fileId: string } };

export interface IWorkerCommand {
  id: string;
  type: 'COMMAND';
  payload: WorkerCommandPayload;
}

export type WorkerEventPayload =
  | { type: 'PROGRESS'; payload: { progress: number } }
  | { type: 'DIAGNOSTIC'; payload: { channel: 'PAGE_COUNT'; stage: string; fileId?: string; durationMs?: number; note?: string } }
  | { type: 'RESULT'; payload: { outputIds: string[] } }
  | { type: 'PAGE_COUNT_RESULT'; payload: { fileId: string; pageCount: number } }
  | { type: 'ERROR'; payload: { message: string; code?: string } };

export interface IWorkerEvent {
  id: string;
  type: 'EVENT';
  payload: WorkerEventPayload;
}

export type ToolAccessDeniedReason = 'ENTITLEMENT_REQUIRED' | 'LIMIT_EXCEEDED';

export type RunnerExecuteResult =
  | { type: 'TOOL_ACCESS_DENIED'; reason: ToolAccessDeniedReason; details?: string }
  | { type: 'TOOL_RESULT'; outputIds: string[] }
  | { type: 'TOOL_ERROR'; message: string; code?: string };

export type RunnerProgressEvent = {
  type: 'TOOL_PROGRESS';
  progress: number;
};

export type RunnerTelemetryEvent =
  | { type: 'TOOL_RUN_STARTED'; runId: string; toolId: string; inputCount: number }
  | { type: 'TOOL_RUN_PROGRESS'; runId: string; toolId: string; progress: number }
  | { type: 'TOOL_RUN_DENIED'; runId: string; toolId: string; reason: 'ENTITLEMENT_REQUIRED' | 'LIMIT_EXCEEDED' }
  | { type: 'TOOL_RUN_RESULT'; runId: string; toolId: string; durationMs: number; outputCount: number }
  | { type: 'TOOL_RUN_ERROR'; runId: string; toolId: string; durationMs: number; code?: string; message: string }
  | { type: 'ACCESS_CHECK_STAGE'; runId: string; toolId: string; stage: string; fileId?: string; durationMs?: number }
  | { type: 'PAGE_COUNT_WORKER_STAGE'; runId: string; toolId: string; fileId: string; stage: string; durationMs?: number; note?: string }
  | { type: 'PAGE_COUNT_CHECK_RESULT'; runId: string; toolId: string; fileId: string; pageCount: number; durationMs: number }
  | { type: 'PAGE_COUNT_CHECK_ERROR'; runId: string; toolId: string; fileId: string; code?: string; message: string; durationMs: number }
  | { type: 'UI_TOAST_SHOWN'; runId: string; toolId: string; message: string; level: 'info' | 'error' }
  | { type: 'UI_UPSELL_SHOWN'; runId: string; toolId: string; reason: string }
  | { type: 'UI_TOAST_DEDUPED'; runId: string; toolId: string; key: string; suppressedCount: number }
  | { type: 'UI_UPSELL_CTA_CLICKED'; runId: string; toolId: string; destination: string }
  | { type: 'UI_PREVIEW_RENDERED'; runId: string; toolId: string; fileId: string; durationMs: number; pageCount?: number }
  | { type: 'UI_PREVIEW_ERROR'; runId: string; toolId: string; fileId: string; message: string };
