import { useEffect, useMemo } from 'react';
import { LinearIcon } from '../../icons/linear-icon';
import { useStudioConvertController } from './use-studio-convert-controller';

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
};

const TOOL_ICONS: Record<string, string> = {
  'ocr-pdf': 'ocr',
  'pdf-to-jpg': 'image',
  'compress-pdf': 'compress',
  'extract-images': 'image',
};

const ALSO_TRY = [
  { tool: 'compress-pdf', label: 'Compress PDF', icon: 'compress' },
  { tool: 'pdf-to-jpg', label: 'PDF to JPG', icon: 'image' },
  { tool: 'ocr-pdf', label: 'OCR PDF', icon: 'ocr' },
  { tool: 'extract-images', label: 'Extract Images', icon: 'image' },
] as const;

export function StudioConvertWorkspace({ onClose, initialTool }: StudioConvertWorkspaceProps = {}) {
  const ctrl = useStudioConvertController(initialTool as import('./use-studio-convert-controller').StudioConvertToolId | undefined);

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
              <>
                <div key={label} className={`cvt-step${i === stepIndex ? ' active' : ''}${i < stepIndex ? ' done' : ''}`}>
                  <div className="cvt-step-num">
                    {i < stepIndex ? '✓' : String(i + 1)}
                  </div>
                  {label}
                </div>
                {i < 2 && (
                  <div key={`line-${i}`} className={`cvt-step-line${i < stepIndex ? ' done' : ''}`} />
                )}
              </>
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
                      <div className="cvt-field">
                        <div className="cvt-field-label">Found / Selected</div>
                        <div style={{ fontSize: 13, paddingTop: 6 }}>
                          {ctrl.extractImageCandidates.length} / {ctrl.selectedExtractImageCandidates.length}
                        </div>
                      </div>
                    </div>
                    <div className="cvt-toggle-row">
                      <div>
                        <div className="cvt-toggle-label">Include inline images</div>
                      </div>
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
                      <div>
                        <div className="cvt-toggle-label">Deduplicate images</div>
                      </div>
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
                      Processing in your browser. Your file stays on your device.
                    </div>
                  </div>
                  <div className="cvt-progress-track">
                    <div className="cvt-progress-fill" style={{ width: `${Math.round(ctrl.progress)}%` }} />
                  </div>
                  <div className="cvt-progress-labels">
                    <span>Processing…</span>
                    <span className="cvt-progress-pct">{Math.round(ctrl.progress)}%</span>
                  </div>
                  <div className="cvt-processing-note">
                    <div className="cvt-spinner" />
                    Worker executing in private sandbox · 0 bytes sent to server
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
                    <button type="button" className="cvt-btn-download" onClick={() => { void ctrl.downloadResults(); }}>
                      <LinearIcon name="download" size={12} />
                      Download
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
                      <button type="button" className="cvt-btn-download" onClick={() => { void ctrl.downloadResults(); }}>
                        <LinearIcon name="download" size={12} />
                        Download
                      </button>
                    </div>
                  ) : (
                    <div style={{ padding: '0 18px 18px' }}>
                      <textarea
                        value={ctrl.ocrResult.content || ''}
                        onChange={(e) => ctrl.updateOcrResultContent(e.target.value)}
                        style={{ width: '100%', minHeight: 320, border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg-1)', resize: 'vertical', outline: 'none', color: 'inherit', fontFamily: 'monospace', padding: 12, lineHeight: 1.6, fontSize: 13 }}
                        spellCheck={false}
                        placeholder="No text content available."
                      />
                      <button type="button" className="cvt-btn-download" style={{ marginTop: 10 }} onClick={() => { void ctrl.downloadResults(); }}>
                        <LinearIcon name="download" size={12} />
                        Download
                      </button>
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
                  {ctrl.jpgResults.map((item) => (
                    <div key={item.outputId} className="cvt-output-row">
                      <div className="cvt-output-icon">
                        {item.url
                          ? <img src={item.url} alt={item.name} style={{ width: 34, height: 34, objectFit: 'cover', borderRadius: 4 }} />
                          : <LinearIcon name="image" size={16} />}
                      </div>
                      <div>
                        <div className="cvt-output-name">{item.name}</div>
                      </div>
                    </div>
                  ))}
                  <div className="cvt-result-actions">
                    <button type="button" className="cvt-btn-download" onClick={() => { void ctrl.downloadResults(); }} disabled={ctrl.outputIds.length === 0}>
                      <LinearIcon name="download" size={12} />
                      Download all
                    </button>
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
    </div>
  );
}
