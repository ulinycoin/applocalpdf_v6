import { useCallback, useState, useRef, useEffect } from 'react';
import { LinearIcon } from '../../icons/linear-icon';
import { usePlatform } from '../../../../app/react/platform-context';
import { TocReviewPanel, type ApplyOptions } from '../../../../plugins/auto-toc/ui/TocReviewPanel';
import { requestTocParse, type TocParseResult } from '../../../../plugins/auto-toc/ui/toc-parser-client';
import type { HeaderNode } from '../../../../plugins/auto-toc/logic/index';

interface AutoTocStudioPanelProps {
    onClose?: () => void;
    inputFileId: string;
    fileName: string;
}

type Phase = 'config' | 'parsing' | 'review' | 'applying' | 'result';

export function AutoTocStudioPanel({ onClose, inputFileId, fileName }: AutoTocStudioPanelProps) {
    const { runtime } = usePlatform();
    const [phase, setPhase] = useState<Phase>('config');
    const [parseResult, setParseResult] = useState<TocParseResult | null>(null);
    const [headers, setHeaders] = useState<HeaderNode[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [outputUrl, setOutputUrl] = useState<string | null>(null);
    const parseRequestId = useRef(0);
    const abortRef = useRef<AbortController | null>(null);

    useEffect(() => {
        return () => abortRef.current?.abort();
    }, []);

    const handleAnalyze = useCallback(async () => {
        abortRef.current?.abort();
        const requestId = ++parseRequestId.current;
        const ac = new AbortController();
        abortRef.current = ac;

        setPhase('parsing');
        setError(null);
        window.posthog?.capture('app_tool_run_started', { toolId: 'auto-toc', action: 'parse' });

        try {
            const result = await requestTocParse(runtime, inputFileId, ac.signal);
            if (requestId !== parseRequestId.current) return;

            if (result.error) {
                window.posthog?.capture('app_tool_run_error', { toolId: 'auto-toc', message: result.error });
                setError(result.error);
                setPhase('config');
                return;
            }

            window.posthog?.capture('app_tool_run_success', { toolId: 'auto-toc', action: 'parse', headersFound: result.headingCandidatesFound });

            const plan = runtime.billing.getContext().plan;
            const pageCount = result.totalPages ?? 0;
            if (plan === 'basic' && pageCount > 5) {
                window.posthog?.capture('app_upsell_shown', { toolId: 'auto-toc', source: 'page_limit', pageCount });
                setError(`Free plan limited to 5 pages (this document has ${pageCount}). Upgrade to Pro for unlimited page TOC generation.`);
                setPhase('config');
                return;
            }

            setParseResult(result);
            setHeaders(result.headers);
            setPhase('review');
        } catch (err) {
            if (requestId !== parseRequestId.current) return;
            if (err instanceof DOMException && err.name === 'AbortError') return;
            window.posthog?.capture('app_tool_run_error', { toolId: 'auto-toc', message: 'Parse failed' });
            setError(err instanceof Error ? err.message : 'Parse failed');
            setPhase('config');
        }
    }, [runtime, inputFileId]);

    const handleApply = useCallback(async (options: ApplyOptions) => {
        setPhase('applying');
        setError(null);
        window.posthog?.capture('app_tool_run_started', { toolId: 'auto-toc', action: 'apply' });

        try {
            const result = await runtime.runner.execute(
                'auto-toc',
                {
                    inputIds: [inputFileId],
                    options: { action: 'apply', headers: options.headers, generateTocPage: options.generateTocPage },
                },
                runtime.billing.getContext(),
            );

            if (result.type === 'TOOL_ACCESS_DENIED') {
                setError('Upgrade to Pro to use this feature.');
                setPhase('review');
                return;
            }
            if (result.type === 'TOOL_ERROR') {
                setError(result.message);
                setPhase('review');
                return;
            }

            const url = URL.createObjectURL(await (await runtime.vfs.read(result.outputIds[0])).getBlob());
            setOutputUrl(url);
            window.posthog?.capture('app_tool_run_success', { toolId: 'auto-toc', action: 'apply' });
            setPhase('result');
        } catch (err) {
            window.posthog?.capture('app_tool_run_error', { toolId: 'auto-toc', message: 'Apply failed' });
            setError(err instanceof Error ? err.message : 'Apply failed');
            setPhase('review');
        }
    }, [runtime, inputFileId]);

    return (
        <div className="cvt-shell">
            <nav className="cvt-nav">
                <a className="studio-logo" href="#" onClick={(e) => { e.preventDefault(); onClose?.(); }}>
                    <div className="studio-nav-logo-icon">L</div>
                    <span className="studio-logo-title">LocalPDF</span>
                </a>
                <span className="studio-nav-sep">/</span>
                <span className="cvt-nav-tool">Auto-TOC & Bookmarks</span>
                <div style={{ flex: 1 }} />
                <button type="button" className="cvt-nav-btn" onClick={onClose} disabled={phase === 'parsing' || phase === 'applying'}>
                    <LinearIcon name="chevron-left" size={12} />
                    All tools
                </button>
                <button type="button" className="cvt-nav-btn" onClick={onClose} disabled={phase === 'parsing' || phase === 'applying'}>
                    Studio
                </button>
            </nav>

            <div className="cvt-page-wrap custom-scrollbar">
                <div className="cvt-page">
                    {/* Tool header */}
                    <div className="cvt-tool-header">
                        <div className="cvt-tool-icon">
                            <LinearIcon name="edit" size={20} />
                        </div>
                        <div>
                            <div className="cvt-tool-title">Auto-TOC & Bookmarks</div>
                            <div className="cvt-tool-desc">Detect headings and generate interactive bookmarks for your PDF.</div>
                            <div className="cvt-privacy-badge">
                                <LinearIcon name="lock" size={10} />
                                Processed locally · files never leave your device
                            </div>
                        </div>
                    </div>

                    {error && (
                        <div className="autoc-error" style={{ marginBottom: 16 }}>
                            <LinearIcon name="x" className="linear-icon" />
                            <span>{error}</span>
                        </div>
                    )}

                    {phase === 'config' && (
                        <div className="cvt-stage">
                            <div className="cvt-file-item">
                                <div className="cvt-file-icon">
                                    <LinearIcon name="word" size={16} />
                                </div>
                                <div>
                                    <div className="cvt-file-name">{fileName}</div>
                                </div>
                            </div>
                            <div style={{ textAlign: 'center', padding: '24px 0' }}>
                                <button className="btn-primary btn-premium-glow" onClick={handleAnalyze}>
                                    <span className="btn-inline">
                                        <LinearIcon name="play" className="linear-icon" />
                                        Analyze Document
                                    </span>
                                </button>
                            </div>
                        </div>
                    )}

                    {phase === 'parsing' && (
                        <div className="cvt-stage" style={{ textAlign: 'center', padding: '40px 0' }}>
                            <div style={{ width: 32, height: 32, border: '3px solid var(--border)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'cvt-spin 0.8s linear infinite', margin: '0 auto 16px' }} />
                            <div style={{ fontWeight: 600 }}>Analyzing document…</div>
                            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>Extracting text and detecting headings</div>
                        </div>
                    )}

                    {phase === 'review' && parseResult && (
                        <div className="cvt-stage">
                            <TocReviewPanel
                                headers={headers}
                                bodyTextSize={parseResult.bodyTextSize}
                                headingCandidatesFound={parseResult.headingCandidatesFound}
                                totalSpansExtracted={parseResult.totalSpansExtracted}
                                onHeadersChange={setHeaders}
                                onApply={handleApply}
                                onBack={() => { setPhase('config'); setParseResult(null); setHeaders([]); }}
                                isProcessing={false}
                            />
                        </div>
                    )}

                    {phase === 'applying' && (
                        <div className="cvt-stage" style={{ textAlign: 'center', padding: '40px 0' }}>
                            <div style={{ width: 32, height: 32, border: '3px solid var(--border)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'cvt-spin 0.8s linear infinite', margin: '0 auto 16px' }} />
                            <div style={{ fontWeight: 600 }}>Generating bookmarks…</div>
                        </div>
                    )}

                    {phase === 'result' && outputUrl && (
                        <div className="cvt-stage">
                            <div style={{ textAlign: 'center', padding: '32px 0' }}>
                                <div style={{ fontSize: 32, marginBottom: 12 }}>✅</div>
                                <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>Bookmarks generated</div>
                                <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>
                                    {headers.filter((h) => h.enabled).length} headings added
                                </div>
                                <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                                    <a href={outputUrl} download={`${fileName.replace(/\.pdf$/i, '')}-with-toc.pdf`}>
                                        <button className="btn-primary btn-premium-glow">
                                            <span className="btn-inline">
                                                <LinearIcon name="download" className="linear-icon" />
                                                Download PDF
                                            </span>
                                        </button>
                                    </a>
                                    <button className="btn-ghost" onClick={onClose}>
                                        <span className="btn-inline">
                                            <LinearIcon name="x" className="linear-icon" />
                                            Close
                                        </span>
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
