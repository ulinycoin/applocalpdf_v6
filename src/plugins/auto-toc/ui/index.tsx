import { useCallback, useState, useRef, useEffect } from 'react';
import { usePlatform } from '../../../app/react/platform-context';
import { LinearIcon } from '../../../v6/components/icons/linear-icon';
import { TocReviewPanel, type ApplyOptions } from './TocReviewPanel';
import { requestTocParse, type TocParseResult } from './toc-parser-client';
import type { HeaderNode } from '../logic/index';

import latinUrl from '@fontsource/noto-sans/files/noto-sans-latin-400-normal.woff?url';
import latinExtUrl from '@fontsource/noto-sans/files/noto-sans-latin-ext-400-normal.woff?url';
import cyrillicUrl from '@fontsource/noto-sans/files/noto-sans-cyrillic-400-normal.woff?url';
import latinBoldUrl from '@fontsource/noto-sans/files/noto-sans-latin-700-normal.woff?url';
import latinExtBoldUrl from '@fontsource/noto-sans/files/noto-sans-latin-ext-700-normal.woff?url';
import cyrillicBoldUrl from '@fontsource/noto-sans/files/noto-sans-cyrillic-700-normal.woff?url';

interface AutoTocConfigProps {
  inputFiles: string[];
  onStart: (options?: Record<string, unknown>) => void;
  onBack: () => void;
}

type UiPhase = 'config' | 'parsing' | 'review';

export default function AutoTocConfig({ inputFiles, onStart, onBack }: AutoTocConfigProps) {
  const { runtime } = usePlatform();
  const [phase, setPhase] = useState<UiPhase>('config');
  const [parseResult, setParseResult] = useState<TocParseResult | null>(null);
  const [headers, setHeaders] = useState<HeaderNode[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const parseRequestId = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  // Abort on unmount
  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  const handleAnalyze = useCallback(async () => {
    if (inputFiles.length === 0) return;

    // Cancel any in-flight parse request
    abortRef.current?.abort();
    const requestId = ++parseRequestId.current;
    const abortController = new AbortController();
    abortRef.current = abortController;

    setPhase('parsing');
    setParseError(null);

    // Telemetry: parse started
    window.posthog?.capture('app_tool_run_started', { toolId: 'auto-toc', action: 'parse', fileCount: inputFiles.length });

    try {
      const result = await requestTocParse(runtime, inputFiles[0], abortController.signal);

      // Stale response guard — ignore if a newer request was started
      if (requestId !== parseRequestId.current) return;

      if (result.error) {
        window.posthog?.capture('app_tool_run_error', { toolId: 'auto-toc', action: 'parse', message: result.error });
        setParseError(result.error);
        setPhase('config');
        return;
      }

      window.posthog?.capture('app_tool_run_success', { toolId: 'auto-toc', action: 'parse', headersFound: result.headingCandidatesFound, totalPages: result.totalPages });

      // Billing check: free plan limited to 5 pages
      const plan = runtime.billing.getContext().plan;
      const pageCount = result.totalPages ?? 0;
      if (plan === 'basic' && pageCount > 5) {
        window.posthog?.capture('app_upsell_shown', { toolId: 'auto-toc', source: 'page_limit', pageCount });
        setParseError(`Free plan limited to 5 pages (this document has ${pageCount}). Upgrade to Pro for unlimited page TOC generation.`);
        setPhase('config');
        return;
      }

      setParseResult(result);
      setHeaders(result.headers);
      setPhase('review');
    } catch (err) {
      if (requestId !== parseRequestId.current) return;
      // AbortError is expected on re-analysis or unmount
      if (err instanceof DOMException && err.name === 'AbortError') return;
      window.posthog?.capture('app_tool_run_error', { toolId: 'auto-toc', action: 'parse', message: err instanceof Error ? err.message : 'Unknown' });
      setParseError(err instanceof Error ? err.message : 'Unknown error');
      setPhase('config');
    }
  }, [inputFiles, runtime]);

  const handleHeadersChange = useCallback((updated: HeaderNode[]) => {
    setHeaders(updated);
  }, []);

  const handleApply = useCallback((options: ApplyOptions) => {
    onStart({
      action: 'apply',
      headers: options.headers,
      bodyTextSize: parseResult?.bodyTextSize,
      generateTocPage: options.generateTocPage,
      fontUrls: {
        latinUrl,
        latinExtUrl,
        cyrillicUrl,
        latinBoldUrl,
        latinExtBoldUrl,
        cyrillicBoldUrl,
      }
    });
  }, [onStart, parseResult]);

  const handleBackToConfig = useCallback(() => {
    setPhase('config');
    setParseResult(null);
    setHeaders([]);
    setParseError(null);
  }, []);

  // ── Parsing phase ──
  if (phase === 'parsing') {
    return (
      <div className="tool-config-root autoc-root">
        <div className="autoc-header" style={{ textAlign: 'center', padding: '40px 0' }}>
          <div className="autoc-spinner" style={{ margin: '0 auto 16px', width: 40, height: 40, border: '3px solid var(--border)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'autoc-spin 0.8s linear infinite' }} />
          <h3 className="autoc-title">Analyzing Document…</h3>
          <p className="tool-config-copy">Extracting text layer and detecting headings.</p>
        </div>
        <style>{`@keyframes autoc-spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // ── Review phase (even with 0 headers — show the empty state) ──
  if (phase === 'review' && parseResult) {
    return (
      <TocReviewPanel
        headers={headers}
        bodyTextSize={parseResult.bodyTextSize}
        headingCandidatesFound={parseResult.headingCandidatesFound}
        totalSpansExtracted={parseResult.totalSpansExtracted}
        onHeadersChange={handleHeadersChange}
        onApply={handleApply}
        onBack={handleBackToConfig}
      />
    );
  }

  // ── Config phase (initial) ──
  return (
    <div className="tool-config-root autoc-root">
      <div className="autoc-header">
        <h3 className="autoc-title">Auto-TOC & Bookmarks</h3>
        <p className="tool-config-copy">
          Automatically scan your PDF for headings, then generate an interactive table of
          contents with bookmarks for easy navigation.
        </p>
      </div>

      <div className="autoc-features">
        <div className="autoc-feature">
          <LinearIcon name="ocr" className="linear-icon icon-md" />
          <div>
            <strong>Smart Detection</strong>
            <p>Finds headings by analyzing font size, weight, and structure.</p>
          </div>
        </div>
        <div className="autoc-feature">
          <LinearIcon name="signature" className="linear-icon icon-md" />
          <div>
            <strong>PDF Bookmarks</strong>
            <p>Adds interactive navigation to your document outline.</p>
          </div>
        </div>
        <div className="autoc-feature">
          <LinearIcon name="edit" className="linear-icon icon-md" />
          <div>
            <strong>Edit & Refine</strong>
            <p>Review detected headings, adjust levels, and customize the final output.</p>
          </div>
        </div>
      </div>

      {parseError && (
        <div className="autoc-error">
          <LinearIcon name="x" className="linear-icon" />
          <span>{parseError}</span>
        </div>
      )}

      {inputFiles.length > 0 && (
        <div className="autoc-file-info">
          <LinearIcon name="file-input" className="linear-icon" />
          <span>{inputFiles.length} file(s) ready for analysis</span>
        </div>
      )}

      <div className="tool-config-actions premium-actions">
        <button className="btn-ghost" onClick={onBack}>
          <span className="btn-inline">
            <LinearIcon name="x" className="linear-icon" />
            Cancel
          </span>
        </button>
        <button
          className="btn-primary btn-premium-glow"
          onClick={handleAnalyze}
          disabled={inputFiles.length === 0}
        >
          <span className="btn-inline">
            <LinearIcon name="play" className="linear-icon" />
            Analyze Document
          </span>
        </button>
      </div>
    </div>
  );
}
