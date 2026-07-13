import { useCallback, useEffect, useRef, useState } from 'react';
import { usePlatform } from '../../../app/react/platform-context';
import type { PdfInfoReport } from '../../../services/pdf/pdf-info-analyzer';
import { PdfInfoPanel } from './PdfInfoPanel';
import { requestPdfInfo } from './pdf-info-client';

interface PdfInfoConfigProps {
  inputFiles: string[];
  onStart: (options?: Record<string, unknown>) => void;
  onBack: () => void;
  onPickFiles?: (files: File[]) => void | Promise<void>;
  onClearFiles?: () => void | Promise<void>;
}

type UiPhase = 'ready' | 'analyzing' | 'report';

export default function PdfInfoConfig({
  inputFiles,
  onBack,
  onPickFiles,
  onClearFiles,
}: PdfInfoConfigProps) {
  const { runtime } = usePlatform();
  const [phase, setPhase] = useState<UiPhase>('ready');
  const [fileName, setFileName] = useState('');
  const [report, setReport] = useState<PdfInfoReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const lastAnalyzedFileRef = useRef<string | null>(null);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (inputFiles.length === 0) {
        setFileName('');
        lastAnalyzedFileRef.current = null;
        setReport(null);
        setError(null);
        setPhase('ready');
        return;
      }
      const entry = await runtime.vfs.read(inputFiles[0]!);
      if (!cancelled) {
        setFileName(entry.getName());
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [inputFiles, runtime.vfs]);

  const handleAnalyze = useCallback(async () => {
    if (inputFiles.length === 0) {
      return;
    }

    abortRef.current?.abort();
    const requestId = ++requestIdRef.current;
    const abortController = new AbortController();
    abortRef.current = abortController;

    setPhase('analyzing');
    setError(null);
    runtime.telemetry.track({
      type: 'TOOL_RUN_STARTED',
      runId: crypto.randomUUID(),
      toolId: 'pdf-info',
      inputCount: 1,
    });

    try {
      const nextReport = await requestPdfInfo(runtime, inputFiles[0]!, abortController.signal);
      if (requestId !== requestIdRef.current) {
        return;
      }

      setReport(nextReport);
      setPhase('report');
      runtime.telemetry.track({
        type: 'TOOL_RUN_RESULT',
        runId: crypto.randomUUID(),
        toolId: 'pdf-info',
        durationMs: 0,
        outputCount: 0,
      });
    } catch (err) {
      if (requestId !== requestIdRef.current) {
        return;
      }
      if (abortController.signal.aborted) {
        setPhase('ready');
        return;
      }

      const message = err instanceof Error ? err.message : 'Failed to analyze PDF';
      setError(message);
      setPhase('ready');
      runtime.telemetry.track({
        type: 'TOOL_RUN_ERROR',
        runId: crypto.randomUUID(),
        toolId: 'pdf-info',
        durationMs: 0,
        code: 'PDF_INFO_FAILED',
        message,
      });
    }
  }, [inputFiles, runtime]);

  useEffect(() => {
    const fileId = inputFiles[0];
    if (!fileId || fileId === lastAnalyzedFileRef.current) {
      return;
    }
    lastAnalyzedFileRef.current = fileId;
    void handleAnalyze();
  }, [handleAnalyze, inputFiles]);

  const handleReset = useCallback(() => {
    abortRef.current?.abort();
    setReport(null);
    setError(null);
    void handleAnalyze();
  }, [handleAnalyze]);

  if (inputFiles.length === 0) {
    return (
      <div className="tool-config-root">
        <p className="tool-config-copy">Upload a PDF to inspect its structure and metadata.</p>
        {onPickFiles && (
          <div className="tool-config-actions">
            <button className="btn-ghost" onClick={onBack}>Back</button>
            <button
              className="btn-primary"
              onClick={() => {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = 'application/pdf';
                input.onchange = () => {
                  const files = input.files ? Array.from(input.files) : [];
                  if (files.length > 0) {
                    void onPickFiles(files);
                  }
                };
                input.click();
              }}
            >
              Choose PDF
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="tool-config-root">
      <div className="pdf-info-header">
        <p className="pdf-info-file-name">{fileName}</p>
        {onClearFiles && (
          <button className="btn-ghost" type="button" onClick={() => void onClearFiles()}>
            Change file
          </button>
        )}
      </div>

      {phase === 'analyzing' && (
        <div className="pdf-info-loading">
          <div className="wz-spinner" />
          <span>Analyzing PDF locally…</span>
        </div>
      )}

      {error && (
        <div className="pdf-info-alert pdf-info-alert--error">
          <strong>Analysis failed</strong>
          <p>{error}</p>
        </div>
      )}

      {phase === 'report' && report && <PdfInfoPanel report={report} />}

      <div className="tool-config-actions">
        <button className="btn-ghost" onClick={onBack}>Back</button>
        {error && phase === 'ready' && (
          <button className="btn-primary" type="button" onClick={() => void handleAnalyze()}>
            Retry analysis
          </button>
        )}
        {phase === 'report' && (
          <button className="btn-secondary" type="button" onClick={handleReset}>
            Analyze again
          </button>
        )}
      </div>
    </div>
  );
}
