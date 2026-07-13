import { useCallback, useEffect, useRef, useState } from 'react';
import { LinearIcon } from '../../icons/linear-icon';
import type { PlatformRuntime } from '../../../../app/platform/create-platform';
import { PdfInfoPanel } from '../../../../plugins/pdf-info/ui/PdfInfoPanel';
import { requestPdfInfo } from '../../../../plugins/pdf-info/ui/pdf-info-client';
import type { PdfInfoReport } from '../../../../services/pdf/pdf-info-analyzer';
import { useStudioStore } from '../studio-store';
import { PipelineRunner } from '../../../studio/pipeline/PipelineRunner';
import type { IPipelineRecipe } from '../../../studio/pipeline/types';

interface PdfInfoStudioPanelProps {
  onClose?: () => void;
  inputFileId: string;
  fileName: string;
  runtime: PlatformRuntime;
}

async function resolveStudioInputFileId(
  runtime: PlatformRuntime,
  inputFileId: string,
  fileName: string,
): Promise<string> {
  const activeDocumentId = useStudioStore.getState().activeDocumentId;
  const documents = useStudioStore.getState().documents;
  const activeDoc = documents.find((doc) => doc.id === activeDocumentId);

  if (!activeDoc || activeDoc.pages.length === 0) {
    return inputFileId;
  }

  const sequence = activeDoc.pages.map((page) => ({
    sourceFileId: page.fileId,
    pageIndex: page.pageIndex,
    rotation: page.rotation,
  }));
  const recipe: IPipelineRecipe = {
    inputs: Array.from(new Set(sequence.map((item) => item.sourceFileId))),
    operations: [{ type: 'reorder', sequence }],
    outputName: 'studio-pdf-info-input.pdf',
  };
  const runner = new PipelineRunner(runtime.vfs);
  const pipelineResult = await runner.execute(recipe);
  const payload = new Uint8Array(pipelineResult.buffer.byteLength);
  payload.set(pipelineResult.buffer);
  const blob = new Blob([payload], { type: 'application/pdf' });
  const entry = await runtime.vfs.write(new File([blob], fileName || pipelineResult.fileName, { type: 'application/pdf' }));
  return entry.id;
}

export function PdfInfoStudioPanel({ onClose, inputFileId, fileName, runtime }: PdfInfoStudioPanelProps) {
  const [report, setReport] = useState<PdfInfoReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(true);
  const requestIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  const runAnalysis = useCallback(async () => {
    abortRef.current?.abort();
    const requestId = ++requestIdRef.current;
    const abortController = new AbortController();
    abortRef.current = abortController;

    setIsAnalyzing(true);
    setError(null);
    setReport(null);

    runtime.telemetry.track({
      type: 'TOOL_RUN_STARTED',
      runId: crypto.randomUUID(),
      toolId: 'pdf-info',
      inputCount: 1,
    });

    try {
      const targetFileId = await resolveStudioInputFileId(runtime, inputFileId, fileName);
      const nextReport = await requestPdfInfo(runtime, targetFileId, abortController.signal);
      if (requestId !== requestIdRef.current) {
        return;
      }

      setReport(nextReport);
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
        return;
      }

      const message = err instanceof Error ? err.message : 'Failed to analyze PDF';
      setError(message);
      runtime.telemetry.track({
        type: 'TOOL_RUN_ERROR',
        runId: crypto.randomUUID(),
        toolId: 'pdf-info',
        durationMs: 0,
        code: 'PDF_INFO_FAILED',
        message,
      });
    } finally {
      if (requestId === requestIdRef.current) {
        setIsAnalyzing(false);
      }
    }
  }, [fileName, inputFileId, runtime]);

  useEffect(() => {
    void runAnalysis();
  }, [runAnalysis]);

  return (
    <div className="cvt-shell">
      <nav className="cvt-nav">
        <a className="studio-logo" href="#" onClick={(event) => { event.preventDefault(); onClose?.(); }}>
          <div className="studio-nav-logo-icon">L</div>
          <span className="studio-logo-title">LocalPDF</span>
        </a>
        <span className="studio-nav-sep">/</span>
        <span className="cvt-nav-tool">PDF Info</span>
        <div style={{ flex: 1 }} />
        <button type="button" className="cvt-nav-btn" onClick={onClose} disabled={isAnalyzing}>
          <LinearIcon name="chevron-left" size={12} />
          All tools
        </button>
        <button type="button" className="cvt-nav-btn" onClick={onClose} disabled={isAnalyzing}>
          Studio
        </button>
      </nav>

      <div className="cvt-page-wrap custom-scrollbar">
        <div className="cvt-page">
          <div className="cvt-tool-header">
            <div className="cvt-tool-icon">
              <LinearIcon name="file-input" size={20} />
            </div>
            <div>
              <div className="cvt-tool-title">PDF Info</div>
              <div className="cvt-tool-desc">Inspect pages, PDF version, encryption, fonts, and metadata.</div>
              <div className="cvt-privacy-badge">
                <LinearIcon name="lock" size={10} />
                Processed locally · files never leave your device
              </div>
            </div>
          </div>

          <div className="cvt-stage">
            <div className="cvt-file-item">
              <div className="cvt-file-icon">
                <LinearIcon name="word" size={16} />
              </div>
              <div>
                <div className="cvt-file-name">{fileName}</div>
              </div>
            </div>

            {isAnalyzing && (
              <div className="pdf-info-loading" style={{ justifyContent: 'center', padding: '32px 0' }}>
                <div style={{ width: 32, height: 32, border: '3px solid var(--border)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'cvt-spin 0.8s linear infinite' }} />
                <span>Analyzing PDF locally…</span>
              </div>
            )}

            {error && (
              <div className="pdf-info-alert pdf-info-alert--error">
                <strong>Analysis failed</strong>
                <p>{error}</p>
                <button className="btn-secondary" type="button" onClick={() => void runAnalysis()} style={{ marginTop: 12 }}>
                  Retry analysis
                </button>
              </div>
            )}

            {!isAnalyzing && report && <PdfInfoPanel report={report} />}
          </div>
        </div>
      </div>
    </div>
  );
}
