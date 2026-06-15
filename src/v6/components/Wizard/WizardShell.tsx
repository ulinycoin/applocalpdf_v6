import {
  Component,
  Suspense,
  useCallback,
  useEffect,
  type KeyboardEvent,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type ChangeEvent,
  type DragEvent,
  type ReactNode,
} from 'react';
import { useLocation } from 'react-router-dom';
import { useNavigate } from 'react-router-dom';
import { usePlatform } from '../../../app/react/platform-context';
import { LinearIcon } from '../icons/linear-icon';
import { useWizardFlow } from '../../hooks/useWizardFlow';
import { useFilePreviews } from '../../hooks/use-file-previews';
import { PreviewPanel } from './PreviewPanel';
import type { IOAdapter, SmartUploadZoneProps, WizardShellProps } from './types';
import type { StudioReturnContext, StudioSelectedPageRef, StudioToolRouteState } from '../../studio/navigation/studio-tool-context';
import { getPdfLib } from '../../services/pdf/pdf-loader';

function classNames(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

function AnimatePresence({ children }: { children: ReactNode }): JSX.Element {
  return <>{children}</>;
}

class ConfigErrorBoundary extends Component<
  { onRetry: () => void; children: ReactNode },
  { hasError: boolean }
> {
  constructor(props: { onRetry: () => void; children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }

  handleRetry = (): void => {
    this.setState({ hasError: false });
    this.props.onRetry();
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="wz-card wz-card-body" style={{ borderColor: 'rgba(224,62,62,0.25)', background: 'rgba(224,62,62,0.06)', color: 'var(--red)' }}>
          <p style={{ fontSize: 13, marginBottom: 12 }}>Failed to load tool settings.</p>
          <button className="wz-btn wz-btn-ghost" onClick={this.handleRetry}>Retry</button>
        </div>
      );
    }

    return this.props.children;
  }
}

function SmartUploadZone({ disabled, accept = 'application/pdf', multiple = true, onFilesAdded }: SmartUploadZoneProps): JSX.Element {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const pushFiles = async (fileList: FileList | null): Promise<void> => {
    if (!fileList || fileList.length === 0 || disabled) {
      return;
    }
    await onFilesAdded(Array.from(fileList));
  };

  const onDrop = async (event: DragEvent<HTMLDivElement>): Promise<void> => {
    event.preventDefault();
    setIsDragging(false);
    await pushFiles(event.dataTransfer.files);
  };

  const onInput = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    await pushFiles(event.target.files);
    event.target.value = '';
  };

  return (
    <div
      className={classNames('wz-upload-zone', isDragging && 'wz-upload-zone--dragging', disabled && 'wz-upload-zone--disabled')}
      onClick={() => inputRef.current?.click()}
      onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          inputRef.current?.click();
        }
      }}
      onDragOver={(event) => {
        event.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={onDrop}
      role="button"
      tabIndex={0}
      aria-label="Upload files"
      title="Upload files"
    >
      <div className="wz-upload-icon">
        <LinearIcon name="upload" className="linear-icon icon-md" />
      </div>
      <p className="wz-upload-title">Drop files here or click to upload</p>
      <p className="wz-upload-hint">Supports {accept.includes('image') ? 'PDF and images' : 'PDF files'}</p>
      <input ref={inputRef} type="file" accept={accept} multiple={multiple} className="hidden" onChange={onInput} disabled={disabled} />
    </div>
  );
}

function createBrowserIOAdapter(runtime: ReturnType<typeof usePlatform>['runtime']): IOAdapter {
  return {
    async save(fileId: string): Promise<void> {
      const entry = await runtime.vfs.read(fileId);
      const blob = await entry.getBlob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = entry.getName();
      anchor.click();
      URL.revokeObjectURL(objectUrl);
    },
  };
}

const PROCESSING_VERB_BY_TOOL: Record<string, string> = {
  'merge-pdf': 'Merging',
  'split-pdf': 'Splitting',
  'rotate-pdf': 'Rotating',
  'delete-pages-pdf': 'Deleting pages',
  'pdf-editor': 'Applying edits',
  'compress-pdf': 'Compressing',
  'ocr-pdf': 'Scanning',
  'pdf-to-jpg': 'Converting',
  'word-to-pdf': 'Converting',
  'excel-to-pdf': 'Converting',
  'encrypt-pdf': 'Encrypting',
  'protect-pdf': 'Protecting',
  'unlock-pdf': 'Unlocking',
  'share-pdf': 'Preparing share',
};

const COMPLETION_BY_TOOL: Record<string, string> = {
  'merge-pdf': 'Merge complete',
  'split-pdf': 'Split complete',
  'rotate-pdf': 'Rotation complete',
  'delete-pages-pdf': 'Delete pages complete',
  'pdf-editor': 'Edits applied',
  'compress-pdf': 'Compression complete',
  'ocr-pdf': 'OCR complete',
  'pdf-to-jpg': 'Conversion complete',
  'word-to-pdf': 'Conversion complete',
  'excel-to-pdf': 'Conversion complete',
  'encrypt-pdf': 'Encryption complete',
  'protect-pdf': 'Protection complete',
  'unlock-pdf': 'Unlock complete',
  'share-pdf': 'Share ready',
};

function getProcessingLabel(toolId: string): string {
  return PROCESSING_VERB_BY_TOOL[toolId] ?? 'Processing';
}

function getResultLabel(toolId: string): string {
  return COMPLETION_BY_TOOL[toolId] ?? 'Action complete';
}

async function buildSinglePageInputIdsFromSelection(
  runtime: ReturnType<typeof usePlatform>['runtime'],
  selectedPages: StudioSelectedPageRef[],
): Promise<string[]> {
  const sourceBytesByFileId = new Map<string, Uint8Array>();
  const outputIds: string[] = [];

  for (const selected of selectedPages) {
    if (!Number.isInteger(selected.pageIndex) || selected.pageIndex < 0) {
      continue;
    }

    let sourceBytes = sourceBytesByFileId.get(selected.fileId);
    if (!sourceBytes) {
      const sourceEntry = await runtime.vfs.read(selected.fileId);
      const sourceBlob = await sourceEntry.getBlob();
      sourceBytes = new Uint8Array(await sourceBlob.arrayBuffer());
      sourceBytesByFileId.set(selected.fileId, sourceBytes);
    }

    const { PDFDocument } = await getPdfLib();
    const sourcePdf = await PDFDocument.load(sourceBytes, { ignoreEncryption: true });
    if (selected.pageIndex >= sourcePdf.getPageCount()) {
      continue;
    }

    const pageOnlyPdf = await PDFDocument.create();
    const [copiedPage] = await pageOnlyPdf.copyPages(sourcePdf, [selected.pageIndex]);
    pageOnlyPdf.addPage(copiedPage);

    const outputBytes = new Uint8Array(await pageOnlyPdf.save());
    const outputFile = new File(
      [outputBytes],
      `studio-page-${selected.pageIndex + 1}.pdf`,
      { type: 'application/pdf' },
    );
    const outputEntry = await runtime.vfs.write(outputFile);
    outputIds.push(outputEntry.id);
  }

  return outputIds;
}

type WizardStep = 'upload' | 'config' | 'processing' | 'result';

function StepIndicator({ step }: { step: WizardStep }) {
  const stepLabels = ['Configure', 'Processing', 'Result'];
  const idx = step === 'upload' || step === 'config' ? 0 : step === 'processing' ? 1 : 2;

  return (
    <div className="wz-steps">
      {stepLabels.map((label, i) => {
        const done = i < idx;
        const active = i === idx;
        return (
          <div key={label} style={{ display: 'flex', alignItems: 'center' }}>
            <div className={`wz-step${active ? ' wz-step--active' : done ? ' wz-step--done' : ''}`}>
              <div className="wz-step-num">{done ? '✓' : i + 1}</div>
              <span className="wz-step-label">{label}</span>
            </div>
            {i < stepLabels.length - 1 && (
              <div className={`wz-step-line${done ? ' wz-step-line--done' : ''}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

const ALSO_TRY_TOOLS = [
  { label: 'Compress PDF', path: '/compress-pdf' },
  { label: 'PDF to JPG', path: '/pdf-to-jpg' },
  { label: 'Merge PDF', path: '/merge-pdf' },
  { label: 'Protect PDF', path: '/protect-pdf' },
  { label: 'Auto-TOC', path: '/auto-toc' },
];

export function WizardShell({ toolId, context, ioAdapter, limitService }: WizardShellProps): JSX.Element {

  const { runtime } = usePlatform();
  const navigate = useNavigate();
  const location = useLocation();
  const [configBoundaryKey, setConfigBoundaryKey] = useState(0);

  const effectiveContext = context ?? runtime.billing.getContext();

  const {
    state,
    configComponent,
    handleFilesAdded,
    hydrateFromFileIds,
    startProcessing,
    cancelProcessing,
    resetFlow,
    retryConfigLoad,
    dismissToast,
    dismissUpsell,
  } = useWizardFlow(toolId, { context: effectiveContext, limitService });

  const toolDef = runtime.registry.get(toolId);
  const ConfigComponent = configComponent;
  const WordConfigComponent = ConfigComponent as ComponentType<any> | null;
  const previewFileIds = state.step === 'result' ? state.outputIds : state.fileIds;
  const { previews, isLoading: isPreviewLoading } = useFilePreviews(runtime, toolId, previewFileIds);
  const isSplitLayout = (state.step === 'config' || state.step === 'result') && toolDef.layout === 'split';
  const uiRunId = useMemo(() => `wizard-ui-${crypto.randomUUID()}`, []);
  const io = useMemo(() => ioAdapter ?? createBrowserIOAdapter(runtime), [ioAdapter, runtime]);
  const uploadAccept = useMemo(() => {
    if (toolId === 'word-to-pdf') {
      return '.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    }
    if (toolId === 'excel-to-pdf') {
      return '.xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    }
    if (toolId === 'ocr-pdf') {
      return 'application/pdf,image/*';
    }
    return 'application/pdf';
  }, [toolId]);
  const allowMultiple = useMemo(() => !['pdf-to-jpg', 'split-pdf'].includes(toolId), [toolId]);
  const routeState = (location.state as StudioToolRouteState | null) ?? null;
  const isStudioFlow = routeState?.source === 'studio';
  const routeStudioContext = routeState?.studioContext;
  const routeReturnContext = routeState?.studioReturnContext;
  const isInlineUploadConfigFlow = toolId === 'word-to-pdf' || toolId === 'excel-to-pdf' || toolId === 'pdf-to-jpg' || toolId === 'pdf-editor';
  const isWordSinglePageFlow = toolId === 'word-to-pdf' || toolId === 'excel-to-pdf' || (toolId === 'pdf-to-jpg' && !isStudioFlow) || toolId === 'pdf-editor';
  const allowStandaloneFlow = toolId === 'word-to-pdf' || toolId === 'excel-to-pdf';
  const requiresStudioFlow = !allowStandaloneFlow;

  const buildReturnContext = (): StudioReturnContext | undefined => routeReturnContext;

  const navigateToStudio = (includeResult: boolean): void => {
    navigate('/studio', {
      state: {
        source: 'studio',
        studioReturnContext: buildReturnContext(),
        ...(includeResult
          ? {
            studioToolResult: {
              toolId,
              outputIds: state.outputIds,
              studioContext: routeStudioContext,
            },
          }
          : {}),
      } satisfies StudioToolRouteState,
    });
  };

  const handleBackAction = (): void => {
    if (isStudioFlow) {
      navigateToStudio(false);
      return;
    }
    void resetFlow(true);
  };

  const handleWordFilesPicked = useCallback(
    async (files: File[]): Promise<void> => {
      if (files.length === 0) {
        return;
      }
      if (state.fileIds.length > 0) {
        await resetFlow(true);
      }
      await handleFilesAdded(files);
    },
    [handleFilesAdded, resetFlow, state.fileIds.length],
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const preloadedFileIds = Array.isArray(routeState?.preloadedFileIds)
        ? routeState.preloadedFileIds.filter((value): value is string => typeof value === 'string' && value.length > 0)
        : [];
      const selectedPages = routeStudioContext?.mode === 'page-selection'
        ? routeStudioContext.selectedPages
        : [];

      let inputIds = preloadedFileIds;
      if (selectedPages.length > 0) {
        try {
          const extractedIds = await buildSinglePageInputIdsFromSelection(runtime, selectedPages);
          if (extractedIds.length > 0) {
            inputIds = extractedIds;
          }
        } catch (error) {
          console.error('Failed to prepare selected Studio pages for tool input:', error);
        }
      }

      if (cancelled || inputIds.length === 0) {
        return;
      }
      await hydrateFromFileIds(inputIds);
    })();

    return () => {
      cancelled = true;
    };
  }, [hydrateFromFileIds, location.key, routeState?.preloadedFileIds, routeStudioContext, runtime]);

  const startProcessingWithContext = (payload?: Record<string, unknown>): Promise<void> => {
    if (!routeStudioContext) {
      return startProcessing(payload);
    }
    return startProcessing({
      ...(payload ?? {}),
      studioContext: routeStudioContext,
    });
  };

  useEffect(() => {
    if (!state.toast) {
      return;
    }
    runtime.telemetry.track({
      type: 'UI_TOAST_SHOWN',
      runId: uiRunId,
      toolId,
      message: state.toast,
      level: 'error',
    });
    dismissToast();
  }, [dismissToast, runtime.telemetry, state.toast, toolId, uiRunId]);

  useEffect(() => {
    if (!state.upsellReason) {
      return;
    }
    dismissUpsell();
  }, [dismissUpsell, state.upsellReason]);

  if (requiresStudioFlow && !isStudioFlow) {
    return (
      <div className="wz-page">
        <div className="wz-tool-header">
          <div className="wz-tool-icon" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
            </svg>
          </div>
          <div>
            <div className="wz-tool-title">{toolDef.name}</div>
            <div className="wz-tool-desc">{toolDef.description}</div>
          </div>
        </div>
        <div className="wz-card wz-card-body">
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
            This workflow is Studio-first. Select a document in Studio and launch the tool from there.
          </p>
          <button className="wz-btn wz-btn-primary" onClick={() => navigate('/studio')}>
            Go to Studio
          </button>
        </div>
      </div>
    );
  }

  const processingLabel = getProcessingLabel(toolId);
  const resultLabel = getResultLabel(toolId);

  return (
    <div
      className={classNames(
        'wz-page',
        isSplitLayout && 'wz-page--split',
        (toolId === 'word-to-pdf' || toolId === 'excel-to-pdf') && 'wz-page--fullwidth',
      )}
    >
      {/* Tool header */}
      <div className="wz-tool-header">
        <div className="wz-tool-icon" aria-hidden="true">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="16" y1="13" x2="8" y2="13"/>
            <line x1="16" y1="17" x2="8" y2="17"/>
          </svg>
        </div>
        <div>
          <div className="wz-tool-title">{toolDef.name}</div>
          <div className="wz-tool-desc">{toolDef.description}</div>
          <div className="wz-tool-privacy">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
            Processed locally · files never leave your device
          </div>
        </div>
      </div>

      {/* Step indicator — not shown for single-page flows */}
      {!isWordSinglePageFlow && (
        <StepIndicator step={state.step as WizardStep} />
      )}

      {/* Error */}
      {state.error && (
        <div className="wz-error">
          <strong>Error:</strong> {state.error}
        </div>
      )}

      {/* Preview panel for non-split, non-word flows */}
      {!isWordSinglePageFlow && !isSplitLayout && toolId !== 'excel-to-pdf' && toolId !== 'pdf-editor' && (
        <PreviewPanel
          runtime={runtime}
          previews={previews}
          isLoading={isPreviewLoading}
          toolId={toolId}
          title={state.step === 'result' ? 'Result Preview' : 'Preview'}
        />
      )}

      <AnimatePresence>

        {/* Word/Excel/PDF-editor single-page flow */}
        {isWordSinglePageFlow && WordConfigComponent && (
          <div className="wz-stage-fade">
            <ConfigErrorBoundary
              onRetry={() => {
                retryConfigLoad();
                setConfigBoundaryKey((current) => current + 1);
              }}
              key={configBoundaryKey}
            >
              <Suspense fallback={<p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Loading configuration…</p>}>
                <WordConfigComponent
                  inputFiles={state.fileIds}
                  onStart={startProcessingWithContext}
                  onBack={handleBackAction}
                  onPickFiles={state.isProcessing ? undefined : handleWordFilesPicked}
                  onClearFiles={() => void resetFlow(true)}
                  currentStep={state.step}
                  progress={state.progress}
                  outputCount={state.outputIds.length}
                  onDownload={
                    isStudioFlow
                      ? undefined
                      : () => {
                        void Promise.all(state.outputIds.map(async (fileId) => io.save(fileId)));
                      }
                  }
                />
              </Suspense>
            </ConfigErrorBoundary>
          </div>
        )}

        {/* Upload step */}
        {!isWordSinglePageFlow && state.step === 'upload' && (
          isInlineUploadConfigFlow && ConfigComponent ? (
            <div className="wz-stage-fade">
              <ConfigErrorBoundary
                onRetry={() => {
                  retryConfigLoad();
                  setConfigBoundaryKey((current) => current + 1);
                }}
                key={configBoundaryKey}
              >
                <Suspense fallback={<p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Loading configuration…</p>}>
                  <ConfigComponent
                    inputFiles={state.fileIds}
                    onStart={startProcessingWithContext}
                    onBack={handleBackAction}
                    onPickFiles={handleWordFilesPicked}
                    onClearFiles={() => void resetFlow(true)}
                  />
                </Suspense>
              </ConfigErrorBoundary>
            </div>
          ) : (
            <div className="wz-stage-fade">
              <SmartUploadZone
                onFilesAdded={handleFilesAdded}
                disabled={state.isValidating}
                multiple={allowMultiple}
                accept={uploadAccept}
              />
              {state.isValidating && (
                <p style={{ marginTop: 12, fontSize: 13, color: 'var(--text-muted)' }}>Validating access limits…</p>
              )}
              {isStudioFlow && (
                <div style={{ marginTop: 12 }}>
                  <button className="wz-btn wz-btn-ghost" onClick={handleBackAction}>Back to Studio</button>
                </div>
              )}
            </div>
          )
        )}

        {/* Config step */}
        {!isWordSinglePageFlow && state.step === 'config' && ConfigComponent && (
          <div className="wz-stage-fade">
            {isSplitLayout ? (
              <div className="wizard-config-split">
                <div className="wizard-config-preview-pane">
                  <PreviewPanel
                    runtime={runtime}
                    previews={previews}
                    isLoading={isPreviewLoading}
                    toolId={toolId}
                    title="Preview"
                  />
                </div>
                <div className="wizard-config-controls-pane">
                  <ConfigErrorBoundary
                    onRetry={() => {
                      retryConfigLoad();
                      setConfigBoundaryKey((current) => current + 1);
                    }}
                    key={configBoundaryKey}
                  >
                    <Suspense fallback={<p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Loading configuration…</p>}>
                      <ConfigComponent
                        inputFiles={state.fileIds}
                        onStart={startProcessingWithContext}
                        onBack={handleBackAction}
                        onPickFiles={isInlineUploadConfigFlow ? handleWordFilesPicked : undefined}
                        onClearFiles={isInlineUploadConfigFlow ? (() => void resetFlow(true)) : undefined}
                      />
                    </Suspense>
                  </ConfigErrorBoundary>
                </div>
              </div>
            ) : (
              <ConfigErrorBoundary
                onRetry={() => {
                  retryConfigLoad();
                  setConfigBoundaryKey((current) => current + 1);
                }}
                key={configBoundaryKey}
              >
                <Suspense fallback={<p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Loading configuration…</p>}>
                  <ConfigComponent
                    inputFiles={state.fileIds}
                    onStart={startProcessingWithContext}
                    onBack={handleBackAction}
                    onPickFiles={isInlineUploadConfigFlow ? handleWordFilesPicked : undefined}
                    onClearFiles={isInlineUploadConfigFlow ? (() => void resetFlow(true)) : undefined}
                  />
                </Suspense>
              </ConfigErrorBoundary>
            )}
          </div>
        )}

        {/* Processing step */}
        {!isWordSinglePageFlow && state.step === 'processing' && (
          <div className="wz-stage-fade">
            <div className="wz-card">
              <div className="wz-card-body" style={{ padding: '24px 20px' }}>
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 5, color: 'var(--text)' }}>
                    {processingLabel}…
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                    Processing in your browser. Your file stays on your device.
                  </div>
                </div>

                <div className="wz-progress-track">
                  <div className="wz-progress-fill" style={{ width: `${Math.max(2, state.progress)}%` }} />
                </div>

                <div className="wz-progress-labels">
                  <span>{processingLabel}…</span>
                  <span className="wz-progress-pct">{Math.round(state.progress)}%</span>
                </div>

                <div className="wz-processing-note">
                  <div className="wz-spinner" />
                  Worker executing in private sandbox · 0 bytes sent to server
                </div>

                <div style={{ marginTop: 18 }}>
                  <button className="wz-btn wz-btn-ghost wz-btn-danger" onClick={() => cancelProcessing()}>
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Result step */}
        {!isWordSinglePageFlow && state.step === 'result' && (
          <div className="wz-stage-fade">
            {isSplitLayout ? (
              <div className="wizard-result-split">
                <div className="wizard-result-preview-pane">
                  <PreviewPanel
                    runtime={runtime}
                    previews={previews}
                    isLoading={isPreviewLoading}
                    toolId={toolId}
                    title="Result Preview"
                  />
                </div>
                <div className="wizard-result-controls-pane">
                  <div className="wz-result-hero" style={{ padding: '20px 0 16px' }}>
                    <div className="wz-result-check">✓</div>
                    <div className="wz-result-title">Done</div>
                    <div className="wz-result-sub">{resultLabel} · {state.outputIds.length} file{state.outputIds.length !== 1 ? 's' : ''} generated</div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {!isStudioFlow && (
                      <button className="wz-btn wz-btn-primary" style={{ width: '100%', justifyContent: 'center' }}
                        onClick={() => void Promise.all(state.outputIds.map(async (fileId) => io.save(fileId)))}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                          <polyline points="7 10 12 15 17 10"/>
                          <line x1="12" y1="15" x2="12" y2="3"/>
                        </svg>
                        {state.outputIds.length > 1 ? 'Download ZIP' : 'Download File'}
                      </button>
                    )}
                    <button className="wz-btn wz-btn-ghost" style={{ justifyContent: 'center' }} onClick={() => void resetFlow(true)}>
                      Run again
                    </button>
                    {isStudioFlow && (
                      <button className="wz-btn wz-btn-primary" style={{ justifyContent: 'center' }} onClick={() => navigateToStudio(true)}>
                        Save to Studio
                      </button>
                    )}
                    {isStudioFlow && (
                      <button className="wz-btn wz-btn-ghost" style={{ justifyContent: 'center' }} onClick={() => navigateToStudio(false)}>
                        Discard and Return
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <>
                <div className="wz-card">
                  <div className="wz-result-hero">
                    <div className="wz-result-check">✓</div>
                    <div className="wz-result-title">Done</div>
                    <div className="wz-result-sub">
                      {resultLabel} · {state.outputIds.length} file{state.outputIds.length !== 1 ? 's' : ''} generated
                    </div>
                  </div>

                  <div className="wz-output-row">
                    <div className="wz-output-icon">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0f7b6c" strokeWidth="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                        <polyline points="14 2 14 8 20 8"/>
                      </svg>
                    </div>
                    <div>
                      <div className="wz-output-name">
                        {state.outputIds.length} file{state.outputIds.length !== 1 ? 's' : ''} generated
                      </div>
                      <div className="wz-output-meta">Ready for download</div>
                    </div>
                    {!isStudioFlow && (
                      <button className="wz-btn-download"
                        onClick={() => void Promise.all(state.outputIds.map(async (fileId) => io.save(fileId)))}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                          <polyline points="7 10 12 15 17 10"/>
                          <line x1="12" y1="15" x2="12" y2="3"/>
                        </svg>
                        Download
                      </button>
                    )}
                  </div>

                  <div className="wz-result-actions">
                    <button className="wz-btn wz-btn-ghost" onClick={() => void resetFlow(true)}>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                        <polyline points="1 4 1 10 7 10"/>
                        <path d="M3.51 15a9 9 0 1 0 .49-4.5"/>
                      </svg>
                      Run again
                    </button>
                    {isStudioFlow ? (
                      <>
                        <button className="wz-btn wz-btn-primary" onClick={() => navigateToStudio(true)}>
                          Save to Studio
                        </button>
                        <button className="wz-btn wz-btn-ghost" style={{ marginLeft: 'auto' }} onClick={() => navigateToStudio(false)}>
                          ← Back to Studio
                        </button>
                      </>
                    ) : (
                      <button className="wz-btn wz-btn-ghost" style={{ marginLeft: 'auto' }} onClick={handleBackAction}>
                        ← Back to Studio
                      </button>
                    )}
                  </div>
                </div>

                {/* Also try */}
                <div className="wz-also-try">
                  <div className="wz-also-try-label">Also try</div>
                  <div className="wz-also-try-list">
                    {ALSO_TRY_TOOLS.filter(t => !t.path.includes(toolId)).slice(0, 4).map((item) => (
                      <div key={item.label} className="wz-also-try-item" onClick={() => navigate(item.path)}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                        </svg>
                        {item.label}
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

      </AnimatePresence>
    </div>
  );
}

export { SmartUploadZone };
