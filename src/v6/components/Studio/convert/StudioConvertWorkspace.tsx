import React, { useEffect, useMemo, useState, useCallback, useSyncExternalStore } from 'react';
import { LinearIcon } from '../../icons/linear-icon';
import { useStudioConvertController } from './use-studio-convert-controller';
import { trackMonetizationEvent, trackPaywallShown } from '../../../../app/react/monetization-telemetry';
import { openCheckout } from '../../../../app/react/billing';
import { activateProTrial } from '../../../../app/react/studio-paywall';
import { getTrialState } from '../../../../app/platform/trial-manager';
import { usePlatform } from '../../../../app/react/platform-context';
import { useDownloadMomentUpsell } from '../../../../app/react/download-moment-upsell';
import { createZipBlob } from '../../../utils/zip';

interface StudioConvertWorkspaceProps {
  onClose?: () => void;
  initialTool?: string;
}

const TOOL_META: Record<string, { title: string; desc: string; runLabel: (pageCount: number) => string }> = {
  'ocr-pdf': {
    title: 'OCR PDF',
    desc: 'Extract text from scanned PDFs. Makes your document searchable and copy-pasteable.',
    runLabel: (n) => `Run OCR on ${n} page${n !== 1 ? 's' : ''}`,
  },
  'pdf-to-jpg': {
    title: 'PDF to JPG',
    desc: 'Convert each PDF page to a high-quality JPG image.',
    runLabel: (n) => `Convert ${n} page${n !== 1 ? 's' : ''} to JPG`,
  },
  'compress-pdf': {
    title: 'Compress PDF',
    desc: 'Reduce PDF file size while preserving quality.',
    runLabel: () => 'Compress PDF',
  },
  'extract-images': {
    title: 'Extract Images',
    desc: 'Extract embedded images from your PDF and download them.',
    runLabel: (n) => `Extract ${n} image${n !== 1 ? 's' : ''}`,
  },
  'auto-toc': {
    title: 'Auto-TOC & Bookmarks',
    desc: 'Automatically detect headings and generate interactive bookmarks.',
    runLabel: () => 'Generate Bookmarks',
  },
};

const TOOL_ICONS: Record<string, string> = {
  'ocr-pdf': 'ocr',
  'pdf-to-jpg': 'image',
  'compress-pdf': 'compress',
  'extract-images': 'image',
  'auto-toc': 'edit',
};

const ALSO_TRY = [
  { tool: 'compress-pdf', label: 'Compress PDF', icon: 'compress' },
  { tool: 'pdf-to-jpg', label: 'PDF to JPG', icon: 'image' },
  { tool: 'ocr-pdf', label: 'OCR PDF', icon: 'ocr' },
  { tool: 'extract-images', label: 'Extract Images', icon: 'image' },
] as const;

function OcrPaywallOverlay({
  totalPages,
  onTrialStarted,
}: {
  totalPages?: number;
  onTrialStarted?: () => void;
}) {
  const trialAvailable = getTrialState().trialAvailable;

  useEffect(() => {
    trackPaywallShown({
      source: 'ocr_result_preview',
      toolId: 'ocr-pdf',
      trigger: 'ocr_trial_limit',
      userState: 'local',
      hadPriorSuccessfulRun: true,
    });
  }, []);

  const checkoutUrl = import.meta.env.VITE_LS_CHECKOUT_URL_PRO_MONTHLY;
  const remainingPages = totalPages ? totalPages - 3 : 0;

  return (
    <div>
      <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 6 }}>
        <div style={{ textAlign: 'center', padding: 24, maxWidth: 400, margin: '0 auto' }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>⚡</div>
          <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4, color: '#142028' }}>
            {remainingPages > 0
              ? `${remainingPages} more page${remainingPages !== 1 ? 's' : ''} — Pro`
              : 'Unlock all pages'}
          </div>
          <div style={{ fontSize: 13, color: '#52606b', marginBottom: 16, lineHeight: 1.5 }}>
            Free plan processes 3 pages. Upgrade to Pro for all {totalPages ?? '?'} pages and unlimited tools.
          </div>
          <button
            type="button"
            onClick={() => {
              trackMonetizationEvent('paywall_cta_clicked', {
                source: 'ocr_result_preview',
                toolId: 'ocr-pdf',
                trigger: 'upgrade_pro',
                destination: checkoutUrl ?? null,
                plan: 'pro',
                userState: 'local',
                hadPriorSuccessfulRun: true,
              });
              openCheckout(checkoutUrl, {
                source: 'ocr_result_preview',
                trigger: 'upgrade_pro',
                plan: 'pro',
                variant: 'monthly',
                userState: 'local',
                hadPriorSuccessfulRun: true,
              });
            }}
            style={{ background: '#142028', color: '#f9f5ee', border: 'none', borderRadius: 999, padding: '10px 24px', fontWeight: 800, fontSize: 14, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            Upgrade to Pro — $3.99/mo
          </button>
          {trialAvailable ? (
            <button
              type="button"
              onClick={() => {
                trackMonetizationEvent('paywall_cta_clicked', {
                  source: 'ocr_result_preview',
                  toolId: 'ocr-pdf',
                  trigger: 'start_trial',
                  userState: 'local',
                  hadPriorSuccessfulRun: true,
                });
                onTrialStarted?.();
              }}
              style={{ display: 'block', width: '100%', marginTop: 10, background: 'transparent', color: '#52606b', border: '1px solid #d5dde3', borderRadius: 999, padding: '10px 24px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
            >
              Start free trial — 3 days
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function StudioConvertWorkspace({ onClose, initialTool }: StudioConvertWorkspaceProps = {}) {
  const { runtime } = usePlatform();
  const ctrl = useStudioConvertController(initialTool as import('./use-studio-convert-controller').StudioConvertToolId | undefined);
  const billingPlan = useSyncExternalStore(
    (onChange) => runtime.billing.subscribe(onChange),
    () => runtime.billing.getContext().plan,
  );
  const { requestDownload, overlay: downloadMomentOverlay } = useDownloadMomentUpsell(runtime, billingPlan);

  const handleOcrTrialStart = () => {
    activateProTrial(runtime.billing, crypto.randomUUID(), 'ocr_result_preview');
  };

  const meta = useMemo(() => (ctrl.activeTool ? (TOOL_META[ctrl.activeTool] ?? TOOL_META['ocr-pdf']) : TOOL_META['ocr-pdf']), [ctrl.activeTool]);
  const toolIconName = ctrl.activeTool ? (TOOL_ICONS[ctrl.activeTool] ?? 'file') : 'file';

  const pageCount = ctrl.activeTool === 'extract-images'
    ? ctrl.selectedExtractImageCandidates.length
    : ctrl.selectedPages.length;

  const runLabel = meta.runLabel(pageCount);

  const runDisabled = ctrl.activeTool === null
    || ctrl.selectedPages.length === 0
    || (ctrl.activeTool === 'extract-images' && ctrl.selectedExtractImageCandidates.length === 0);

  const compressSavedBytes = ctrl.compressResultSummary
    ? Math.max(0, ctrl.compressResultSummary.inputBytes - ctrl.compressResultSummary.outputBytes)
    : 0;
  const compressSavedPercent = ctrl.compressResultSummary && ctrl.compressResultSummary.inputBytes > 0
    ? Math.max(0, Math.round((compressSavedBytes / ctrl.compressResultSummary.inputBytes) * 100))
    : 0;

  // File size tracking for compress PDF tool
  const [fileSizeBytes, setFileSizeBytes] = useState<number | null>(null);

  useEffect(() => {
    if (!ctrl.activeDocument || ctrl.activeTool !== 'compress-pdf') {
      setFileSizeBytes(null);
      return;
    }
    let cancelled = false;
    const firstPage = ctrl.activeDocument.pages[0];
    if (!firstPage) {
      setFileSizeBytes(null);
      return;
    }
    void (async () => {
      try {
        const entry = await runtime.vfs.read(firstPage.fileId);
        if (!cancelled) {
          setFileSizeBytes(await entry.getSize());
        }
      } catch {
        if (!cancelled) setFileSizeBytes(null);
      }
    })();
    return () => { cancelled = true; };
  }, [ctrl.activeDocument, ctrl.activeTool, runtime.vfs]);

  const compressEstimates: Record<string, { ratio: number; label: string }> = {
    low: { ratio: 0.65, label: 'Low' },
    medium: { ratio: 0.45, label: 'Balanced' },
    high: { ratio: 0.28, label: 'High' },
  };

  function formatBytes(bytes: number): string {
    if (bytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    let value = bytes;
    let unitIndex = 0;
    while (value >= 1024 && unitIndex < units.length - 1) {
      value /= 1024;
      unitIndex += 1;
    }
    return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
  }

  const handleDownloadZip = useCallback(async () => {
    if (ctrl.outputIds.length === 0 || !ctrl.compressResultSummary) return;
    const entry = await runtime.vfs.read(ctrl.outputIds[0]);
    const zipBlob = await createZipBlob([{
      name: entry.getName(),
      blob: await entry.getBlob(),
    }]);
    const url = URL.createObjectURL(zipBlob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = ctrl.activeDocument
      ? `${ctrl.activeDocument.name.replace(/\.pdf$/i, '')}-compressed.zip`
      : 'compressed.zip';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }, [ctrl.outputIds, ctrl.compressResultSummary, ctrl.activeDocument, runtime.vfs]);

  const alsoTry = ALSO_TRY.filter((item) => item.tool !== ctrl.activeTool);

  useEffect(() => {
    if (!ctrl.activeDocument || ctrl.previewPages.length === 0) {
      if (onClose) onClose(); else ctrl.navigateBack();
    }
  }, [ctrl.activeDocument, ctrl.navigateBack, ctrl.previewPages.length, onClose]);

  if (!ctrl.activeDocument || ctrl.previewPages.length === 0) {
    return null;
  }

  const stepIndex = ctrl.step === 'config' ? 0 : ctrl.step === 'processing' ? 1 : 2;

  return (
    <div className="cvt-shell">
      {/* Nav */}
      <nav className="cvt-nav">
        <a className="studio-logo" href="#" onClick={(e) => { e.preventDefault(); (onClose ?? ctrl.navigateBack)(); }}>
          <div className="studio-nav-logo-icon">L</div>
          <span className="studio-logo-title">LocalPDF</span>
        </a>
        <span className="studio-nav-sep">/</span>
        <span className="cvt-nav-tool">{meta.title}</span>
        <div style={{ flex: 1 }} />
        <button type="button" className="cvt-nav-btn" onClick={onClose ?? ctrl.navigateBack}>
          <LinearIcon name="chevron-left" size={12} />
          All tools
        </button>
        <button type="button" className="cvt-nav-btn" onClick={onClose ?? ctrl.navigateBack}>
          Studio
        </button>
      </nav>

      {/* Scrollable page */}
      <div className="cvt-page-wrap custom-scrollbar">
        <div className="cvt-page">

          {/* Tool header */}
          <div className="cvt-tool-header">
            <div className="cvt-tool-icon">
              <LinearIcon name={toolIconName as import('../../icons/linear-icon').LinearIconName} size={20} />
            </div>
            <div>
              <div className="cvt-tool-title">{meta.title}</div>
              <div className="cvt-tool-desc">{meta.desc}</div>
              <div className="cvt-privacy-badge">
                <LinearIcon name="lock" size={10} />
                Processed locally · files never leave your device
              </div>
            </div>
          </div>

          {/* Steps */}
          <div className="cvt-steps">
            {(['Configure', 'Processing', 'Result'] as const).map((label, i) => (
              <React.Fragment key={label}>
                <div className={`cvt-step${i === stepIndex ? ' active' : ''}${i < stepIndex ? ' done' : ''}`}>
                  <div className="cvt-step-num">
                    {i < stepIndex ? '✓' : String(i + 1)}
                  </div>
                  {label}
                </div>
                {i < 2 && (
                  <div className={`cvt-step-line${i < stepIndex ? ' done' : ''}`} />
                )}
              </React.Fragment>
            ))}
          </div>

          {/* ── Configure ────────────────────────────────────── */}
          {ctrl.step === 'config' && (
            <div className="cvt-stage">
              {/* File item */}
              <div className="cvt-file-item">
                <div className="cvt-file-icon">
                  <LinearIcon name="word" size={16} />
                </div>
                <div>
                  <div className="cvt-file-name">{ctrl.activeDocument.name}</div>
                  <div className="cvt-file-meta">
                    {ctrl.previewPages.length} page{ctrl.previewPages.length !== 1 ? 's' : ''}
                    {ctrl.operationScope === 'selection' && ` · ${ctrl.selectedPages.length} selected`}
                    {ctrl.activeTool === 'compress-pdf' && fileSizeBytes !== null && ` · ${formatBytes(fileSizeBytes)}`}
                  </div>
                </div>
              </div>

              {/* Settings card — OCR */}
              {ctrl.activeTool === 'ocr-pdf' && (
                <div className="cvt-card">
                  <div className="cvt-card-header">
                    <div className="cvt-card-header-icon"><LinearIcon name="tool" size={12} /></div>
                    Options
                  </div>
                  <div className="cvt-card-body">
                    <div className="cvt-field-row">
                      <div className="cvt-field">
                        <div className="cvt-field-label">Language mode</div>
                        <select
                          className="cvt-select"
                          value={ctrl.ocrSettings.languageMode}
                          onChange={(e) => ctrl.setOcrSettings({ ...ctrl.ocrSettings, languageMode: e.target.value === 'manual' ? 'manual' : 'auto' })}
                        >
                          <option value="auto">Auto detect</option>
                          <option value="manual">Manual</option>
                        </select>
                      </div>
                      <div className="cvt-field">
                        <div className="cvt-field-label">Language</div>
                        <select
                          className="cvt-select"
                          value={ctrl.ocrSettings.language}
                          disabled={ctrl.ocrSettings.languageMode !== 'manual'}
                          onChange={(e) => ctrl.setOcrSettings({ ...ctrl.ocrSettings, language: e.target.value })}
                        >
                          <option value="rus+eng">Russian + English</option>
                          <option value="eng">English</option>
                          <option value="rus">Russian</option>
                          <option value="ukr">Ukrainian</option>
                          <option value="deu">German</option>
                          <option value="fra">French</option>
                          <option value="spa">Spanish</option>
                          <option value="ita">Italian</option>
                          <option value="por">Portuguese</option>
                          <option value="jpn">Japanese</option>
                          <option value="chi_sim">Chinese (Simplified)</option>
                          <option value="hin">Hindi</option>
                          <option value="ara">Arabic</option>
                        </select>
                      </div>
                    </div>
                    <div className="cvt-field">
                      <div className="cvt-field-label">Output format</div>
                      <select
                        className="cvt-select"
                        value={ctrl.ocrSettings.outputFormat}
                        onChange={(e) => {
                          const v = e.target.value;
                          ctrl.setOcrSettings({ ...ctrl.ocrSettings, outputFormat: v === 'json' ? 'json' : v === 'searchable-pdf' ? 'searchable-pdf' : 'txt' });
                        }}
                      >
                        <option value="txt">Plain text (.txt)</option>
                        <option value="searchable-pdf">Searchable PDF</option>
                        <option value="json">JSON</option>
                      </select>
                    </div>
                    <div className="cvt-field">
                      <div className="cvt-field-label">Quality</div>
                      <div className="cvt-seg">
                        {(['fast', 'accurate'] as const).map((m) => (
                          <button
                            key={m}
                            type="button"
                            className={`cvt-seg-btn${ctrl.ocrSettings.mode === m ? ' active' : ''}`}
                            onClick={() => ctrl.setOcrSettings({ ...ctrl.ocrSettings, mode: m })}
                          >
                            {m === 'fast' ? 'Fast' : 'Accurate'}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="cvt-card-header" style={{ borderTop: '1px solid var(--border)', borderBottom: 'none' }}>
                    <div className="cvt-card-header-icon"><LinearIcon name="check" size={12} /></div>
                    Advanced
                  </div>
                  <div className="cvt-card-body" style={{ paddingTop: 10, paddingBottom: 10 }}>
                    <div className="cvt-toggle-row">
                      <div>
                        <div className="cvt-toggle-label">Preserve formatting</div>
                        <div className="cvt-toggle-desc">Keep original layout and columns</div>
                      </div>
                      <div
                        className={`cvt-toggle${ctrl.ocrSettings.preserveFormatting ? ' on' : ''}`}
                        role="switch"
                        aria-checked={ctrl.ocrSettings.preserveFormatting}
                        tabIndex={0}
                        onClick={() => ctrl.setOcrSettings({ ...ctrl.ocrSettings, preserveFormatting: !ctrl.ocrSettings.preserveFormatting })}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') ctrl.setOcrSettings({ ...ctrl.ocrSettings, preserveFormatting: !ctrl.ocrSettings.preserveFormatting }); }}
                      />
                    </div>
                    <div className="cvt-toggle-row">
                      <div>
                        <div className="cvt-toggle-label">Detect tables</div>
                        <div className="cvt-toggle-desc">Recognize tabular data</div>
                      </div>
                      <div
                        className={`cvt-toggle${ctrl.ocrSettings.detectTables ? ' on' : ''}`}
                        role="switch"
                        aria-checked={ctrl.ocrSettings.detectTables}
                        tabIndex={0}
                        onClick={() => ctrl.setOcrSettings({ ...ctrl.ocrSettings, detectTables: !ctrl.ocrSettings.detectTables })}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') ctrl.setOcrSettings({ ...ctrl.ocrSettings, detectTables: !ctrl.ocrSettings.detectTables }); }}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Settings card — PDF to JPG */}
              {ctrl.activeTool === 'pdf-to-jpg' && (
                <div className="cvt-card">
                  <div className="cvt-card-header">
                    <div className="cvt-card-header-icon"><LinearIcon name="tool" size={12} /></div>
                    Options
                  </div>
                  <div className="cvt-card-body">
                    <div className="cvt-field">
                      <div className="cvt-field-label">Quality — {ctrl.pdfToJpgSettings.quality}%</div>
                      <input
                        type="range" min={20} max={100} step={1}
                        value={ctrl.pdfToJpgSettings.quality}
                        onChange={(e) => ctrl.setPdfToJpgSettings({ ...ctrl.pdfToJpgSettings, quality: Number(e.target.value) })}
                        style={{ width: '100%' }}
                      />
                    </div>
                    <div className="cvt-field">
                      <div className="cvt-field-label">Resolution — {ctrl.pdfToJpgSettings.dpi} DPI</div>
                      <input
                        type="range" min={72} max={300} step={1}
                        value={ctrl.pdfToJpgSettings.dpi}
                        onChange={(e) => ctrl.setPdfToJpgSettings({ ...ctrl.pdfToJpgSettings, dpi: Number(e.target.value) })}
                        style={{ width: '100%' }}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Settings card — Compress PDF */}
              {ctrl.activeTool === 'compress-pdf' && (
                <div className="cvt-card">
                  <div className="cvt-card-header">
                    <div className="cvt-card-header-icon"><LinearIcon name="tool" size={12} /></div>
                    Compression level
                  </div>
                  <div className="cvt-card-body">
                    <div className="cvt-seg" style={{ flexDirection: 'column', gap: 6 }}>
                      {([
                        { value: 'low', label: 'Low compression', hint: 'Higher quality, larger file size' },
                        { value: 'medium', label: 'Balanced', hint: 'Good default for most documents' },
                        { value: 'high', label: 'High compression', hint: 'Smaller file, more aggressive' },
                      ] as const).map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          className={`cvt-seg-btn${ctrl.compressPdfSettings.quality === opt.value ? ' active' : ''}`}
                          style={{ textAlign: 'left', flexDirection: 'column', alignItems: 'flex-start', padding: '8px 12px' }}
                          onClick={() => ctrl.setCompressPdfSettings({ quality: opt.value })}
                        >
                          <span style={{ fontWeight: 600 }}>{opt.label}</span>
                          <span style={{ fontSize: 12, opacity: 0.75, fontWeight: 400 }}>{opt.hint}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Settings card — Extract Images */}
              {ctrl.activeTool === 'extract-images' && (
                <>
                  <div className="cvt-card">
                    <div className="cvt-card-header">
                      <div className="cvt-card-header-icon"><LinearIcon name="tool" size={12} /></div>
                      Options
                    </div>
                    <div className="cvt-card-body">
                      <div className="cvt-field-row">
                        <div className="cvt-field">
                          <div className="cvt-field-label">Format</div>
                          <select
                            className="cvt-select"
                            value={ctrl.extractImagesSettings.format}
                            onChange={(e) => ctrl.setExtractImagesSettings({ ...ctrl.extractImagesSettings, format: e.target.value as 'png' | 'jpeg' })}
                          >
                            <option value="png">PNG</option>
                            <option value="jpeg">JPEG</option>
                          </select>
                        </div>
                        {ctrl.extractImagesSettings.format === 'jpeg' && (
                          <div className="cvt-field">
                            <div className="cvt-field-label">JPEG quality</div>
                            <input
                              type="number"
                              className="cvt-select"
                              min={30}
                              max={100}
                              value={Math.round(ctrl.extractImagesSettings.jpegQuality * 100)}
                              onChange={(e) => {
                                const next = Number(e.target.value);
                                ctrl.setExtractImagesSettings({ ...ctrl.extractImagesSettings, jpegQuality: Math.max(0.3, Math.min(1, (Number.isFinite(next) ? next : 92) / 100)) });
                              }}
                            />
                          </div>
                        )}
                      </div>
                      <div className="cvt-toggle-row">
                        <div><div className="cvt-toggle-label">Include inline images</div></div>
                        <div
                          className={`cvt-toggle${ctrl.extractImagesSettings.includeInlineImages ? ' on' : ''}`}
                          role="switch"
                          aria-checked={ctrl.extractImagesSettings.includeInlineImages}
                          tabIndex={0}
                          onClick={() => ctrl.setExtractImagesSettings({ ...ctrl.extractImagesSettings, includeInlineImages: !ctrl.extractImagesSettings.includeInlineImages })}
                          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') ctrl.setExtractImagesSettings({ ...ctrl.extractImagesSettings, includeInlineImages: !ctrl.extractImagesSettings.includeInlineImages }); }}
                        />
                      </div>
                      <div className="cvt-toggle-row">
                        <div><div className="cvt-toggle-label">Deduplicate images</div></div>
                        <div
                          className={`cvt-toggle${ctrl.extractImagesSettings.dedupe ? ' on' : ''}`}
                          role="switch"
                          aria-checked={ctrl.extractImagesSettings.dedupe}
                          tabIndex={0}
                          onClick={() => ctrl.setExtractImagesSettings({ ...ctrl.extractImagesSettings, dedupe: !ctrl.extractImagesSettings.dedupe })}
                          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') ctrl.setExtractImagesSettings({ ...ctrl.extractImagesSettings, dedupe: !ctrl.extractImagesSettings.dedupe }); }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Image preview card */}
                  <div className="cvt-card">
                    <div className="cvt-card-header">
                      <div className="cvt-card-header-icon"><LinearIcon name="image" size={12} /></div>
                      <span>Images found</span>
                      <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-muted)', fontWeight: 400 }}>
                        {ctrl.selectedExtractImageCandidates.length} / {ctrl.extractImageCandidates.length} selected
                      </span>
                      {ctrl.extractImageCandidates.length > 0 && (
                        <button
                          type="button"
                          onClick={
                            ctrl.selectedExtractImageCandidates.length === ctrl.extractImageCandidates.length
                              ? ctrl.clearImageCandidateSelection
                              : ctrl.selectAllImageCandidates
                          }
                          style={{ fontSize: 12, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', padding: '0 0 0 8px', flexShrink: 0 }}
                        >
                          {ctrl.selectedExtractImageCandidates.length === ctrl.extractImageCandidates.length ? 'Deselect all' : 'Select all'}
                        </button>
                      )}
                    </div>
                    <div className="cvt-card-body" style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 16 }}>
                      {ctrl.selectedPages.map((page) => {
                        const candidates = ctrl.imageCandidatesByPage[page.pageId] ?? [];
                        const isScanning = !!ctrl.imageScanPendingByPage[page.pageId];
                        const selectedSet = new Set(ctrl.selectedImageIds);
                        return (
                          <div key={page.pageId}>
                            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                              Page {page.pageIndex + 1}
                            </div>
                            <div style={{ position: 'relative', display: 'inline-block', width: '100%' }}>
                              {page.thumbnailUrl
                                ? <img src={page.thumbnailUrl} alt="" draggable={false} style={{ display: 'block', width: '100%', height: 'auto', borderRadius: 6, border: '1px solid var(--border)' }} />
                                : <div style={{ width: '100%', paddingBottom: '141%', background: 'var(--surface)', borderRadius: 6, border: '1px solid var(--border)' }} />
                              }
                              {isScanning && (
                                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.6)', borderRadius: 6 }}>
                                  <div className="cvt-spinner" />
                                </div>
                              )}
                              {!isScanning && candidates.length === 0 && page.thumbnailUrl && (
                                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.65)', borderRadius: 6 }}>
                                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>No images found on this page</span>
                                </div>
                              )}
                              {candidates.map((c) => {
                                const isSel = selectedSet.has(c.globalId);
                                return (
                                  <button
                                    key={c.globalId}
                                    type="button"
                                    title={`${c.pixelWidth}×${c.pixelHeight}px — click to ${isSel ? 'deselect' : 'select'}`}
                                    onClick={() => ctrl.toggleImageCandidate(c.globalId)}
                                    style={{
                                      position: 'absolute',
                                      left: `${c.xRatio * 100}%`,
                                      top: `${c.yRatio * 100}%`,
                                      width: `${c.widthRatio * 100}%`,
                                      height: `${c.heightRatio * 100}%`,
                                      background: isSel ? 'rgba(35,131,226,0.15)' : 'transparent',
                                      border: `2px solid ${isSel ? '#2383e2' : 'rgba(35,131,226,0.35)'}`,
                                      borderRadius: 3,
                                      cursor: 'pointer',
                                      padding: 0,
                                      boxSizing: 'border-box',
                                      transition: 'background 0.1s, border-color 0.1s',
                                    }}
                                    aria-pressed={isSel}
                                  >
                                    <span style={{
                                      position: 'absolute', bottom: 2, right: 2,
                                      fontSize: 9, lineHeight: 1,
                                      background: isSel ? '#2383e2' : 'rgba(0,0,0,0.5)',
                                      color: '#fff', borderRadius: 2, padding: '1px 3px',
                                      pointerEvents: 'none', whiteSpace: 'nowrap',
                                    }}>
                                      {c.pixelWidth}×{c.pixelHeight}
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}

              {/* Actions */}
              <div className="cvt-actions">
                <button
                  type="button"
                  className="cvt-btn-primary"
                  onClick={() => { void ctrl.runTool(); }}
                  disabled={runDisabled}
                >
                  <LinearIcon name="play" size={13} />
                  {runLabel}
                </button>
                <button
                  type="button"
                  className="cvt-btn-ghost"
                  onClick={onClose ?? ctrl.navigateBack}
                >
                  ← Back to Studio
                </button>
              </div>
            </div>
          )}

          {/* ── Processing ───────────────────────────────────── */}
          {ctrl.step === 'processing' && (
            <div className="cvt-stage">
              <div className="cvt-card">
                <div className="cvt-card-body" style={{ padding: '24px 20px' }}>
                  <div style={{ marginBottom: 20 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 5 }}>
                      {ctrl.activeTool === 'ocr-pdf' ? 'Running OCR…'
                        : ctrl.activeTool === 'pdf-to-jpg' ? 'Converting pages…'
                        : ctrl.activeTool === 'compress-pdf' ? 'Compressing PDF…'
                        : 'Extracting images…'}
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                      {ctrl.activeTool === 'ocr-pdf' && ctrl.ocrStream && ctrl.ocrStream.pageCount > 0
                        ? `Page ${ctrl.ocrStream.completedPages} of ${ctrl.ocrStream.pageCount} — text appears as each page finishes.`
                        : 'Processing in your browser. Your file stays on your device.'}
                    </div>
                  </div>
                  <div className="cvt-progress-track">
                    <div className="cvt-progress-fill" style={{ width: `${Math.round(ctrl.progress)}%` }} />
                  </div>
                  <div className="cvt-progress-labels">
                    <span>Processing…</span>
                    <span className="cvt-progress-pct">{Math.round(ctrl.progress)}%</span>
                  </div>
                  {ctrl.activeTool === 'ocr-pdf' && ctrl.ocrStream?.partialText ? (
                    <textarea
                      readOnly
                      value={ctrl.ocrStream.partialText}
                      style={{
                        width: '100%',
                        minHeight: 200,
                        marginTop: 16,
                        border: '1px solid var(--border)',
                        borderRadius: 6,
                        background: 'var(--bg-1)',
                        resize: 'vertical',
                        color: 'inherit',
                        fontFamily: 'monospace',
                        padding: 12,
                        lineHeight: 1.6,
                        fontSize: 13,
                      }}
                      spellCheck={false}
                      placeholder="Recognized text will appear here…"
                    />
                  ) : null}
                  <div className="cvt-processing-note">
                    <div className="cvt-spinner" />
                    Worker executing in private sandbox · 0 bytes sent to server
                  </div>
                  <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                      type="button"
                      className="cvt-btn-ghost"
                      onClick={ctrl.cancelRun}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── Result ───────────────────────────────────────── */}
          {ctrl.step === 'result' && (
            <div className="cvt-stage">
              {/* Compress result */}
              {ctrl.activeTool === 'compress-pdf' && ctrl.compressResultSummary && (
                <div className="cvt-card">
                  <div className="cvt-result-hero">
                    <div className="cvt-result-check">✓</div>
                    <div className="cvt-result-title">Done</div>
                    <div className="cvt-result-sub">
                      Saved {ctrl.formatBytes(compressSavedBytes)} ({compressSavedPercent}%)
                      · {ctrl.formatBytes(ctrl.compressResultSummary.inputBytes)} → {ctrl.formatBytes(ctrl.compressResultSummary.outputBytes)}
                    </div>
                  </div>
                  <div className="cvt-output-row">
                    <div className="cvt-output-icon">
                      <LinearIcon name="word" size={16} />
                    </div>
                    <div>
                      <div className="cvt-output-name">{ctrl.compressResultSummary.outputFileName}</div>
                      <div className="cvt-output-meta">{ctrl.formatBytes(ctrl.compressResultSummary.outputBytes)}</div>
                    </div>
                    <button type="button" className="cvt-btn-download" onClick={() => requestDownload(ctrl.activeTool ?? 'studio', () => ctrl.downloadResults())}>
                      <LinearIcon name="download" size={12} />
                      Download
                    </button>
                    <button type="button" className="cvt-btn-download" onClick={() => requestDownload('compress-pdf', handleDownloadZip)} style={{ marginLeft: 6 }}>
                      <LinearIcon name="download" size={12} />
                      ZIP
                    </button>
                  </div>
                  <div className="cvt-result-actions">
                    <button type="button" className="cvt-btn-ghost" onClick={ctrl.resetWorkspace}>
                      <LinearIcon name="rotate" size={11} />
                      Run again
                    </button>
                    <button type="button" className="cvt-btn-ghost" style={{ marginLeft: 'auto' }} onClick={onClose ?? ctrl.navigateBack}>
                      ← Back to Studio
                    </button>
                  </div>
                </div>
              )}

              {/* OCR result */}
              {ctrl.activeTool === 'ocr-pdf' && ctrl.ocrResult && (
                <div className="cvt-card">
                  <div className="cvt-result-hero">
                    <div className="cvt-result-check">✓</div>
                    <div className="cvt-result-title">Done</div>
                    <div className="cvt-result-sub">{ctrl.selectedPages.length} page{ctrl.selectedPages.length !== 1 ? 's' : ''} processed · text layer added</div>
                  </div>
                  {ctrl.ocrResult.kind === 'pdf' && ctrl.ocrResult.pdfUrl ? (
                    <div className="cvt-output-row">
                      <div className="cvt-output-icon">
                        <LinearIcon name="word" size={16} />
                      </div>
                      <div>
                        <div className="cvt-output-name">{ctrl.ocrResult.fileName}</div>
                        <div className="cvt-output-meta">searchable PDF</div>
                      </div>
                      {ctrl.allowOcrDownload ? (
                        <button type="button" className="cvt-btn-download" onClick={() => requestDownload('ocr-pdf', () => ctrl.downloadResults())}>
                          <LinearIcon name="download" size={12} />
                          Download
                        </button>
                      ) : (
                        <button type="button" className="cvt-btn-download" onClick={ctrl.showOcrPaywall}>
                          <LinearIcon name="lock" size={12} />
                          Upgrade to download
                        </button>
                      )}
                    </div>
                  ) : ctrl.allowOcrDownload ? (
                    <div style={{ padding: '0 18px 18px' }}>
                      <textarea
                        value={ctrl.ocrResult.content || ''}
                        onChange={(e) => ctrl.updateOcrResultContent(e.target.value)}
                        style={{ width: '100%', minHeight: 320, border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg-1)', resize: 'vertical', outline: 'none', color: 'inherit', fontFamily: 'monospace', padding: 12, lineHeight: 1.6, fontSize: 13 }}
                        spellCheck={false}
                        placeholder="No text content available."
                      />
                      <button type="button" className="cvt-btn-download" style={{ marginTop: 10 }} onClick={() => requestDownload('ocr-pdf', () => ctrl.downloadResults())}>
                        <LinearIcon name="download" size={12} />
                        Download
                      </button>
                    </div>
                  ) : (
                    <div style={{ padding: '0 18px 18px' }}>
                      <OcrPaywallOverlay totalPages={ctrl.totalPageCount} onTrialStarted={handleOcrTrialStart} />
                    </div>
                  )}
                  <div className="cvt-result-actions">
                    <button type="button" className="cvt-btn-ghost" onClick={ctrl.resetWorkspace}>
                      <LinearIcon name="rotate" size={11} />
                      Run again
                    </button>
                    <button type="button" className="cvt-btn-ghost" style={{ marginLeft: 'auto' }} onClick={onClose ?? ctrl.navigateBack}>
                      ← Back to Studio
                    </button>
                  </div>
                </div>
              )}

              {/* JPG / Extract Images result */}
              {(ctrl.activeTool === 'pdf-to-jpg' || ctrl.activeTool === 'extract-images') && (
                <div className="cvt-card">
                  <div className="cvt-result-hero">
                    <div className="cvt-result-check">✓</div>
                    <div className="cvt-result-title">Done</div>
                    <div className="cvt-result-sub">{ctrl.jpgResults.length} file{ctrl.jpgResults.length !== 1 ? 's' : ''} ready</div>
                  </div>
                  {(() => {
                    const isFreeExtract = ctrl.activeTool === 'extract-images' && !ctrl.isPro;
                    const freeItem = ctrl.jpgResults[0];
                    const lockedItems = isFreeExtract ? ctrl.jpgResults.slice(1) : [];
                    const visibleItems = isFreeExtract ? (freeItem ? [freeItem] : []) : ctrl.jpgResults;
                    return (
                      <>
                        {visibleItems.map((item) => (
                          <div key={item.outputId} className="cvt-output-row">
                            <div className="cvt-output-icon">
                              {item.url
                                ? <img src={item.url} alt={item.name} style={{ width: 34, height: 34, objectFit: 'cover', borderRadius: 4 }} />
                                : <LinearIcon name="image" size={16} />}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div className="cvt-output-name">{item.name}</div>
                            </div>
                            <button
                              type="button"
                              className="cvt-btn-download"
                              onClick={() => requestDownload(ctrl.activeTool ?? 'studio', () => ctrl.downloadSingleResult(item.outputId, item.name))}
                            >
                              <LinearIcon name="download" size={12} />
                              Download
                            </button>
                          </div>
                        ))}
                        {lockedItems.length > 0 && (
                          <div style={{
                            margin: '4px 18px 12px',
                            padding: '14px 16px',
                            background: 'var(--accent-dim)',
                            border: '1px solid var(--accent)',
                            borderRadius: 8,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 12,
                          }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 2 }}>
                                {lockedItems.length} more image{lockedItems.length !== 1 ? 's' : ''} found
                              </div>
                              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                                Upgrade to Pro to download all {ctrl.jpgResults.length} images — $3.99/mo
                              </div>
                            </div>
                            <button type="button" className="cvt-btn-primary" style={{ flexShrink: 0, whiteSpace: 'nowrap' }} onClick={ctrl.showExtractPaywall}>
                              Upgrade to Pro
                            </button>
                          </div>
                        )}
                      </>
                    );
                  })()}
                  <div className="cvt-result-actions">
                    {ctrl.activeTool === 'extract-images' && !ctrl.isPro && ctrl.jpgResults.length > 1 ? (
                      <button type="button" className="cvt-btn-download" onClick={ctrl.showExtractPaywall}>
                        <LinearIcon name="download" size={12} />
                        Download all ({ctrl.jpgResults.length})
                      </button>
                    ) : (
                      <button type="button" className="cvt-btn-download" onClick={() => requestDownload(ctrl.activeTool ?? 'studio', () => ctrl.downloadResults())} disabled={ctrl.outputIds.length === 0}>
                        <LinearIcon name="download" size={12} />
                        Download all
                      </button>
                    )}
                    <button type="button" className="cvt-btn-ghost" onClick={ctrl.resetWorkspace}>
                      <LinearIcon name="rotate" size={11} />
                      Run again
                    </button>
                    <button type="button" className="cvt-btn-ghost" style={{ marginLeft: 'auto' }} onClick={onClose ?? ctrl.navigateBack}>
                      ← Back to Studio
                    </button>
                  </div>
                </div>
              )}

              {/* Also try */}
              <div className="cvt-also-try">
                <div className="cvt-also-try-label">Also try</div>
                <div className="cvt-also-try-list">
                  {alsoTry.map((item) => (
                    <button
                      key={item.tool}
                      type="button"
                      className="cvt-also-try-item"
                      onClick={() => { ctrl.setActiveTool(item.tool); ctrl.resetWorkspace(); }}
                    >
                      <LinearIcon name={item.icon as import('../../icons/linear-icon').LinearIconName} size={12} />
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

        </div>
      </div>

      {/* Error / message toast */}
      {(ctrl.message || ctrl.error) && (
        <div className="studio-edit-message-overlay">
          <p className="studio-edit-message-text">{ctrl.error ?? ctrl.message}</p>
          <button type="button" className="studio-edit-message-close" onClick={() => { ctrl.setMessage(null); ctrl.setError(null); }}>
            &times;
          </button>
        </div>
      )}

      {downloadMomentOverlay}
    </div>
  );
}
