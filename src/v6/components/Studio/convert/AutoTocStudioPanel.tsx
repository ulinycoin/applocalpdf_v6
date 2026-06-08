import { useCallback, useState, useRef, useEffect } from 'react';
import { LinearIcon } from '../../icons/linear-icon';
import type { PlatformRuntime } from '../../../../app/platform/create-platform';
import { TocReviewPanel, type ApplyOptions } from '../../../../plugins/auto-toc/ui/TocReviewPanel';
import { requestTocParse, type TocParseResult } from '../../../../plugins/auto-toc/ui/toc-parser-client';
import type { HeaderNode } from '../../../../plugins/auto-toc/logic/index';

import latinUrl from '@fontsource/noto-sans/files/noto-sans-latin-400-normal.woff?url';
import latinExtUrl from '@fontsource/noto-sans/files/noto-sans-latin-ext-400-normal.woff?url';
import cyrillicUrl from '@fontsource/noto-sans/files/noto-sans-cyrillic-400-normal.woff?url';
import latinBoldUrl from '@fontsource/noto-sans/files/noto-sans-latin-700-normal.woff?url';
import latinExtBoldUrl from '@fontsource/noto-sans/files/noto-sans-latin-ext-700-normal.woff?url';
import cyrillicBoldUrl from '@fontsource/noto-sans/files/noto-sans-cyrillic-700-normal.woff?url';

import { useStudioStore } from '../studio-store';
import { PipelineRunner } from '../../../studio/pipeline/PipelineRunner';
import type { IPipelineRecipe } from '../../../studio/pipeline/types';

interface AutoTocStudioPanelProps {
    onClose?: () => void;
    inputFileId: string;
    fileName: string;
    runtime: PlatformRuntime;
}

type Phase = 'config' | 'parsing' | 'review' | 'applying' | 'result';

export function AutoTocStudioPanel({ onClose, inputFileId, fileName, runtime }: AutoTocStudioPanelProps) {
    const [phase, setPhase] = useState<Phase>('config');
    const [parseResult, setParseResult] = useState<TocParseResult | null>(null);
    const [headers, setHeaders] = useState<HeaderNode[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [outputUrl, setOutputUrl] = useState<string | null>(null);
    const [activeInputFileId, setActiveInputFileId] = useState<string>(inputFileId);
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
            // Собираем текущие страницы холста в один временный PDF
            const activeDocumentId = useStudioStore.getState().activeDocumentId;
            const documents = useStudioStore.getState().documents;
            const activeDoc = documents.find((d) => d.id === activeDocumentId);
            
            let targetFileId = inputFileId;
            if (activeDoc && activeDoc.pages.length > 0) {
                const sequence = activeDoc.pages.map((p) => ({
                    sourceFileId: p.fileId,
                    pageIndex: p.pageIndex,
                    rotation: p.rotation,
                }));
                const recipe: IPipelineRecipe = {
                    inputs: Array.from(new Set(sequence.map((item) => item.sourceFileId))),
                    operations: [{ type: 'reorder', sequence }],
                    outputName: 'studio-autotoc-input.pdf',
                };
                const runner = new PipelineRunner(runtime.vfs);
                const pipelineResult = await runner.execute(recipe);
                const payload = new Uint8Array(pipelineResult.buffer.byteLength);
                payload.set(pipelineResult.buffer);
                const blob = new Blob([payload], { type: 'application/pdf' });
                const entry = await runtime.vfs.write(new File([blob], pipelineResult.fileName, { type: 'application/pdf' }));
                targetFileId = entry.id;
            }

            setActiveInputFileId(targetFileId);

            const result = await requestTocParse(runtime, targetFileId, ac.signal);
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

        const base = import.meta.env.BASE_URL || '/';
        const robotoUrl = `${base}fonts/Roboto-Regular.ttf`.replace(/\/+/g, '/');
        const robotoBoldUrl = `${base}fonts/Roboto-Bold.ttf`.replace(/\/+/g, '/');

        try {
            const result = await runtime.runner.execute(
                'auto-toc',
                {
                    inputIds: [activeInputFileId],
                    options: {
                        action: 'apply',
                        headers: options.headers,
                        generateTocPage: options.generateTocPage,
                        fontUrls: {
                            latinUrl,
                            latinExtUrl,
                            cyrillicUrl,
                            latinBoldUrl,
                            latinExtBoldUrl,
                            cyrillicBoldUrl,
                            robotoUrl,
                            robotoBoldUrl,
                        }
                    },
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
    }, [runtime, activeInputFileId]);

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
                        <div className="cvt-stage" style={{ maxWidth: 480, margin: '40px auto 0' }}>
                            <div style={{ textAlign: 'center', padding: '36px 24px', background: 'var(--bg-1)', borderRadius: 8, border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}>
                                <div style={{ fontSize: 40, marginBottom: 16 }}>🎉</div>
                                <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 6, color: 'var(--text)' }}>Bookmarks generated successfully</div>
                                <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 24 }}>
                                    {headers.filter((h) => h.enabled).length} headings added to your document outline.
                                </div>
                                <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap', alignItems: 'center' }}>
                                    <a href={outputUrl} download={`${fileName.replace(/\.pdf$/i, '')}-with-toc.pdf`} style={{ textDecoration: 'none' }}>
                                        <button className="cvt-btn-primary">
                                            <LinearIcon name="download" size={14} />
                                            Download PDF
                                        </button>
                                    </a>
                                    <button className="cvt-btn-ghost" onClick={() => setPhase('review')}>
                                        <LinearIcon name="chevron-left" size={14} />
                                        Back to Edit
                                    </button>
                                    <button className="cvt-btn-ghost" onClick={onClose}>
                                        <LinearIcon name="x" size={14} />
                                        Close
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
