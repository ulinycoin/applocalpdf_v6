import {
  Component,
  Suspense,
  useEffect,
  type KeyboardEvent,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type ReactNode,
} from 'react';
import { useLocation } from 'react-router-dom';
import { useNavigate } from 'react-router-dom';
import { usePlatform } from '../../../app/react/platform-context';
import { LinearIcon } from '../icons/linear-icon';
import { DEFAULT_TOOL_CONTEXT, useWizardFlow } from '../../hooks/useWizardFlow';
import { useFilePreviews } from '../../hooks/use-file-previews';
import { PreviewPanel } from './PreviewPanel';
import type { IOAdapter, SmartUploadZoneProps, WizardShellProps, WizardStep } from './types';
import { PDFDocument } from 'pdf-lib';
import type { StudioSelectedPageRef, StudioToolRouteState } from '../../studio/navigation/studio-tool-context';

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
        <div className="wizard-config-card" style={{ borderColor: 'rgba(175, 47, 37, 0.32)', background: '#fff4f2', color: '#7c2920' }}>
          <p className="mb-3 text-sm">Failed to load tool settings.</p>
          <button className="btn-secondary" onClick={this.handleRetry}>
            Retry
          </button>
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
      className={classNames('upload-zone', isDragging && 'dragging', disabled && 'disabled')}
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
      <div className="upload-zone-badge">
        <LinearIcon name="upload" className="linear-icon icon-md" />
      </div>
      <p className="upload-zone-title">Drop files here or click to upload</p>
      <p className="upload-zone-copy">All files are written to VFS immediately.</p>
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

const STEP_ORDER: WizardStep[] = ['upload', 'config', 'processing', 'result'];

const PROCESSING_VERB_BY_TOOL: Record<string, string> = {
  'merge-pdf': 'Merging',
  'split-pdf': 'Splitting',
  'rotate-pdf': 'Rotating',
  'delete-pages-pdf': 'Deleting pages',
  'compress-pdf': 'Compressing',
  'ocr-pdf': 'Scanning',
  'pdf-to-jpg': 'Converting',
  'word-to-pdf': 'Converting',
  'excel-to-pdf': 'Converting',
  'encrypt-pdf': 'Encrypting',
  'unlock-pdf': 'Unlocking',
};

const COMPLETION_BY_TOOL: Record<string, string> = {
  'merge-pdf': 'Merge complete',
  'split-pdf': 'Split complete',
  'rotate-pdf': 'Rotation complete',
  'delete-pages-pdf': 'Delete pages complete',
  'compress-pdf': 'Compression complete',
  'ocr-pdf': 'OCR complete',
  'pdf-to-jpg': 'Conversion complete',
  'word-to-pdf': 'Conversion complete',
  'excel-to-pdf': 'Conversion complete',
  'encrypt-pdf': 'Encryption complete',
  'unlock-pdf': 'Unlock complete',
};

function getStepLabel(step: WizardStep): string {
  switch (step) {
    case 'upload':
      return 'Upload';
    case 'config':
      return 'Config';
    case 'processing':
      return 'Processing';
    case 'result':
      return 'Result';
    default:
      return step;
  }
}

function getProcessingLabel(toolId: string): string {
  return PROCESSING_VERB_BY_TOOL[toolId] ?? 'Processing';
}

function getResultLabel(toolId: string): string {
  return COMPLETION_BY_TOOL[toolId] ?? 'Action complete';
}

function getStepStatus(stepIndex: number, currentStepIndex: number): 'pending' | 'active' | 'completed' {
  if (stepIndex < currentStepIndex) {
    return 'completed';
  }
  if (stepIndex === currentStepIndex) {
    return 'active';
  }
  return 'pending';
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

    const sourcePdf = await PDFDocument.load(sourceBytes);
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

export function WizardShell({ toolId, context = DEFAULT_TOOL_CONTEXT, ioAdapter, limitService }: WizardShellProps): JSX.Element {
  const { runtime } = usePlatform();
  const navigate = useNavigate();
  const location = useLocation();
  const [configBoundaryKey, setConfigBoundaryKey] = useState(0);

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
  } = useWizardFlow(toolId, { context, limitService });

  const toolDef = runtime.registry.get(toolId);
  const ConfigComponent = configComponent;
  const previewFileIds = state.step === 'result' ? state.outputIds : state.fileIds;
  const { previews, isLoading: isPreviewLoading } = useFilePreviews(runtime, toolId, previewFileIds);
  const isSplitLayout = (state.step === 'config' || state.step === 'result') && toolDef.layout === 'split';
  const currentStepIndex = useMemo(() => STEP_ORDER.indexOf(state.step), [state.step]);
  const uiRunId = useMemo(() => `wizard-ui-${crypto.randomUUID()}`, []);
  const io = useMemo(() => ioAdapter ?? createBrowserIOAdapter(runtime), [ioAdapter, runtime]);
  const uploadAccept = useMemo(() => {
    if (toolId === 'word-to-pdf') {
      return '.doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    }
    if (toolId === 'excel-to-pdf') {
      return '.xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    }
    if (toolId === 'ocr-pdf') {
      return 'application/pdf,image/*';
    }
    return 'application/pdf';
  }, [toolId]);
  const allowMultiple = useMemo(() => !['ocr-pdf', 'pdf-to-jpg', 'split-pdf'].includes(toolId), [toolId]);
  const routeState = (location.state as StudioToolRouteState | null) ?? null;
  const isStudioFlow = routeState?.source === 'studio';
  const routeStudioContext = routeState?.studioContext;

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

  return (
    <section className={classNames('wizard-shell', isSplitLayout && 'wizard-shell-workspace')}>
      <header className="wizard-header">
        <div>
          <h2 className="wizard-title">{toolDef.name}</h2>
          <p className="wizard-subtitle">Focus mode: Upload -&gt; Config -&gt; Processing -&gt; Result</p>
        </div>
        <div
          className="wizard-steps"
          role="progressbar"
          aria-label={`Wizard progress, current step: ${getStepLabel(state.step)}`}
          aria-valuemin={1}
          aria-valuemax={STEP_ORDER.length}
          aria-valuenow={currentStepIndex + 1}
        >
          {STEP_ORDER.map((step, index) => {
            const status = getStepStatus(index, currentStepIndex);
            return (
              <span key={step} className={classNames('wizard-step-chip', `wizard-step-chip-${status}`)}>
                {getStepLabel(step)}
              </span>
            );
          })}
        </div>
      </header>

      {state.error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 wizard-error-banner">{state.error}</div>
      )}

      {!isSplitLayout && (
        <PreviewPanel
          runtime={runtime}
          previews={previews}
          isLoading={isPreviewLoading}
          toolId={toolId}
          title={state.step === 'result' ? 'Result Preview' : 'Input Preview'}
        />
      )}

      <AnimatePresence>
        {state.step === 'upload' && (
          <div className="animate-fade-in wizard-upload-card">
            <SmartUploadZone
              onFilesAdded={handleFilesAdded}
              disabled={state.isValidating}
              multiple={allowMultiple}
              accept={uploadAccept}
            />
            {state.isValidating && <p className="wizard-subtitle" style={{ marginTop: '0.75rem' }}>Validating access limits...</p>}
          </div>
        )}

        {state.step === 'config' && ConfigComponent && (
          <div className="animate-fade-in wizard-config-card">
            {isSplitLayout ? (
              <div className="wizard-config-split">
                <div className="wizard-config-preview-pane">
                  <PreviewPanel
                    runtime={runtime}
                    previews={previews}
                    isLoading={isPreviewLoading}
                    toolId={toolId}
                    title="Input Preview"
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
                    <Suspense fallback={<p className="wizard-subtitle">Loading configuration...</p>}>
                      <ConfigComponent inputFiles={state.fileIds} onStart={startProcessingWithContext} onBack={() => void resetFlow(true)} />
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
                <Suspense fallback={<p className="wizard-subtitle">Loading configuration...</p>}>
                  <ConfigComponent inputFiles={state.fileIds} onStart={startProcessingWithContext} onBack={() => void resetFlow(true)} />
                </Suspense>
              </ConfigErrorBoundary>
            )}
          </div>
        )}

        {state.step === 'processing' && (
          <div className="animate-fade-in wizard-processing-card" style={{ textAlign: 'center' }}>
            <h3 style={{ margin: 0 }}>{getProcessingLabel(toolId)}...</h3>
            <p className="wizard-subtitle">{getProcessingLabel(toolId)} your file in local worker runtime.</p>
            <div className="wizard-progress-track">
              <div className="wizard-progress-bar" style={{ width: `${state.progress}%` }} />
            </div>
            <p style={{ marginTop: '0.5rem', fontWeight: 700 }}>{state.progress}%</p>
            <div className="wizard-action-row">
              <button className="btn-danger" onClick={cancelProcessing}>
                <span className="btn-inline">
                  <LinearIcon name="x" className="linear-icon" />
                  Cancel
                </span>
              </button>
            </div>
          </div>
        )}

        {state.step === 'result' && (
          <div className="animate-fade-in wizard-result-card" style={{ textAlign: 'center' }}>
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
                  <h3 style={{ margin: 0, color: 'var(--ok)' }}>Ready!</h3>
                  <p className="wizard-subtitle">
                    {getResultLabel(toolId)}. {state.outputIds.length} file(s) generated.
                  </p>
                  <div className="wizard-action-row wizard-action-col">
                    <button
                      className="btn-primary"
                      onClick={() => {
                        void Promise.all(state.outputIds.map(async (fileId) => io.save(fileId)));
                      }}
                    >
                      <span className="btn-inline">
                        <LinearIcon name="download" className="linear-icon" />
                        {state.outputIds.length > 1 ? 'Download ZIP' : 'Download File'}
                      </span>
                    </button>
                    <button className="btn-ghost" onClick={() => void resetFlow(true)}>
                      <span className="btn-inline">
                        <LinearIcon name="refresh" className="linear-icon" />
                        Start over
                      </span>
                    </button>
                    {isStudioFlow && (
                      <button
                        className="btn-secondary"
                        onClick={() =>
                          navigate('/studio', {
                            state: {
                              studioToolResult: {
                                toolId,
                                outputIds: state.outputIds,
                                studioContext: routeStudioContext,
                              },
                            } satisfies StudioToolRouteState,
                          })
                        }
                      >
                        <span className="btn-inline">
                          <LinearIcon name="tool" className="linear-icon" />
                          Return to Studio
                        </span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <>
                <h3 style={{ margin: 0, color: 'var(--ok)' }}>Ready!</h3>
                <p className="wizard-subtitle">
                  {getResultLabel(toolId)}. {state.outputIds.length} file(s) generated.
                </p>
                <div className="wizard-action-row">
                  <button
                    className="btn-primary"
                    onClick={() => {
                      void Promise.all(state.outputIds.map(async (fileId) => io.save(fileId)));
                    }}
                  >
                    <span className="btn-inline">
                      <LinearIcon name="download" className="linear-icon" />
                      {state.outputIds.length > 1 ? 'Download ZIP' : 'Download File'}
                    </span>
                  </button>
                  <button className="btn-ghost" onClick={() => void resetFlow(true)}>
                    <span className="btn-inline">
                      <LinearIcon name="refresh" className="linear-icon" />
                      Start over
                    </span>
                  </button>
                  {isStudioFlow && (
                    <button
                      className="btn-secondary"
                      onClick={() =>
                        navigate('/studio', {
                          state: {
                            studioToolResult: {
                              toolId,
                              outputIds: state.outputIds,
                              studioContext: routeStudioContext,
                            },
                          } satisfies StudioToolRouteState,
                        })
                      }
                    >
                      <span className="btn-inline">
                        <LinearIcon name="tool" className="linear-icon" />
                        Return to Studio
                      </span>
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </AnimatePresence>
    </section>
  );
}

export { SmartUploadZone };
