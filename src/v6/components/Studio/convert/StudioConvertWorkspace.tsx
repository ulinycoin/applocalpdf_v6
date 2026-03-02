import { useMemo } from 'react';
import { createPortal } from 'react-dom';
import { LinearIcon } from '../../icons/linear-icon';
import { StudioConvertToolbar } from './StudioConvertToolbar';
import { StudioOcrSettingsPanel } from './StudioOcrSettingsPanel';
import { StudioPdfToJpgSettingsPanel } from './StudioPdfToJpgSettingsPanel';
import { detectStudioConvertLocale, getStudioConvertMessages } from './studio-convert-i18n';
import { useStudioConvertController } from './use-studio-convert-controller';

export function StudioConvertWorkspace() {
  const locale = useMemo(() => detectStudioConvertLocale(), []);
  const ui = useMemo(() => getStudioConvertMessages(locale), [locale]);
  const ctrl = useStudioConvertController();

  if (!ctrl.activeDocument || ctrl.previewPages.length === 0) {
    return (
      <section className="studio-edit-shell">
        <div className="studio-edit-empty">
          <h2 className="studio-edit-empty-title">{ui.emptyTitle}</h2>
          <button type="button" className="studio-edit-back-btn" onClick={ctrl.navigateBack}>
            {ui.backToStudio}
          </button>
        </div>
      </section>
    );
  }

  const runLabel = ctrl.activeTool === 'pdf-to-jpg' ? ui.runPdfToJpg : ui.runOcr;

  return (
    <section className="studio-edit-shell" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="studio-edit-meta" style={{ padding: '8px 16px', background: 'rgba(15,23,42,0.4)', borderRadius: '0 0 12px 12px', marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 12, flex: 1, alignItems: 'center' }}>
          <button type="button" className="studio-edit-back-btn" onClick={ctrl.navigateBack} title={ui.backToStudio} style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '4px' }}>
            <LinearIcon name="chevron-left" size={18} />
          </button>
          <span className="studio-edit-page-badge">{ctrl.activeDocument.name}</span>
          <span className="studio-edit-page-badge">{ctrl.operationScope === 'selection' ? ui.selectionScope : ui.documentScope}</span>
          <span className="studio-edit-page-badge">{ctrl.selectedPages.length} {ui.selectedPages}</span>
        </div>

        <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end', gap: '12px', alignItems: 'center' }}>
          <div className="studio-edit-zoom-controls" style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(0,0,0,0.2)', padding: '4px 8px', borderRadius: 8 }}>
            <button type="button" className="studio-floating-btn" style={{ width: 24, height: 24 }} onClick={ctrl.zoomOut} title="Zoom Out" disabled={ctrl.step !== 'config'}>
              <LinearIcon name="minus" size={14} />
            </button>
            <span style={{ fontSize: 13, minWidth: 44, textAlign: 'center', color: 'rgba(255,255,255,0.9)' }}>{Math.round(ctrl.zoomLevel * 100)}%</span>
            <button type="button" className="studio-floating-btn" style={{ width: 24, height: 24 }} onClick={ctrl.zoomIn} title="Zoom In" disabled={ctrl.step !== 'config'}>
              <LinearIcon name="plus" size={14} />
            </button>
            <div style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.1)', margin: '0 4px' }} />
            <button type="button" className="studio-floating-btn" style={{ padding: '0 8px', height: 24, fontSize: 12 }} onClick={ctrl.zoomToHundred} title="100%" disabled={ctrl.step !== 'config'}>1:1</button>
            <button type="button" className="studio-floating-btn" style={{ padding: '0 8px', height: 24, fontSize: 12 }} onClick={ctrl.fitToWidth} title="Fit to width" disabled={ctrl.step !== 'config'}>Fit</button>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', position: 'relative' }}>
        {ctrl.step !== 'processing' && (
          <div style={{ padding: '0 16px', zIndex: 10 }}>
            <StudioConvertToolbar
              activeTool={ctrl.activeTool}
              onSelectTool={ctrl.setActiveTool}
            />
            {ctrl.activeTool === 'ocr-pdf' && (
              <StudioOcrSettingsPanel
                settings={ctrl.ocrSettings}
                onChange={ctrl.setOcrSettings}
              />
            )}
            {ctrl.activeTool === 'pdf-to-jpg' && (
              <StudioPdfToJpgSettingsPanel
                settings={ctrl.pdfToJpgSettings}
                onChange={ctrl.setPdfToJpgSettings}
              />
            )}
            {ctrl.step === 'config' && (
              <div style={{ width: 260, marginTop: 10, display: 'grid', gap: 8 }}>
                <button type="button" className="studio-edit-btn-cancel" onClick={ctrl.selectAllPages}>{ui.selectAll}</button>
                <button type="button" className="studio-edit-btn-cancel" onClick={ctrl.clearPageSelection}>{ui.clearSelection}</button>
              </div>
            )}
          </div>
        )}

        <div
          className="studio-edit-canvas-wrap custom-scrollbar"
          style={{ flex: 1, overflow: 'auto', position: 'relative', padding: '20px 24px 100px' }}
        >
          {ctrl.step === 'config' && (
            <div style={{ display: 'grid', gap: 20, justifyContent: 'center' }}>
              {ctrl.previewPages.map((page) => (
                <button
                  key={page.pageId}
                  type="button"
                  onClick={() => ctrl.togglePage(page.pageId)}
                  style={{
                    width: Math.round(420 * ctrl.zoomLevel),
                    borderRadius: 12,
                    border: page.selected ? '2px solid rgba(34,197,94,0.85)' : '1px solid rgba(148,163,184,0.35)',
                    background: 'rgba(15,23,42,0.45)',
                    cursor: 'pointer',
                    padding: 10,
                    textAlign: 'left',
                    color: 'inherit',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 12, opacity: 0.85 }}>
                    <span>Page {page.pageIndex + 1}</span>
                    <span>{page.selected ? 'Selected' : 'Not selected'}</span>
                  </div>
                  {page.thumbnailUrl ? (
                    <img
                      src={page.thumbnailUrl}
                      alt={`Page ${page.pageIndex + 1}`}
                      style={{ width: '100%', display: 'block', borderRadius: 8, background: '#fff' }}
                      draggable={false}
                    />
                  ) : (
                    <div style={{ height: 320, borderRadius: 8, background: 'rgba(2,6,23,0.55)', display: 'grid', placeItems: 'center', fontSize: 13 }}>
                      Preview unavailable
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}

          {ctrl.step === 'processing' && (
            <div style={{ minHeight: 'calc(100vh - 280px)', display: 'grid', placeItems: 'center' }}>
              <div className="tool-config-card" style={{ width: 'min(720px, 92%)', display: 'grid', gap: 14, textAlign: 'center' }}>
                <div className="ocr-concept-spinner" style={{ margin: '0 auto' }} />
                <h3 style={{ margin: 0 }}>Processing...</h3>
                <p style={{ margin: 0, opacity: 0.9 }}>{Math.round(ctrl.progress)}%</p>
                <div className="wizard-progress-track" style={{ height: 10 }}>
                  <div className="wizard-progress-bar" style={{ width: `${Math.round(ctrl.progress)}%` }} />
                </div>
              </div>
            </div>
          )}

          {ctrl.step === 'result' && (
            <div style={{ display: 'grid', gap: 16 }}>
              {ctrl.activeTool === 'pdf-to-jpg' && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
                  {ctrl.jpgResults.map((item) => (
                    <div key={item.outputId} className="tool-config-card" style={{ padding: 10 }}>
                      <div style={{ fontSize: 12, marginBottom: 8, opacity: 0.85, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</div>
                      {item.url ? (
                        <img src={item.url} alt={item.name} style={{ width: '100%', borderRadius: 8, background: '#fff' }} />
                      ) : (
                        <div style={{ height: 200, borderRadius: 8, display: 'grid', placeItems: 'center', background: 'rgba(2,6,23,0.55)' }}>Preview unavailable</div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {ctrl.activeTool === 'ocr-pdf' && ctrl.ocrResult && (
                <div className="tool-config-card" style={{ minHeight: 420 }}>
                  {ctrl.ocrResult.kind === 'pdf' && ctrl.ocrResult.pdfUrl ? (
                    <iframe
                      title="OCR PDF result"
                      src={`${ctrl.ocrResult.pdfUrl}#toolbar=0&navpanes=0`}
                      style={{ width: '100%', height: 620, border: 'none', borderRadius: 10, background: '#fff' }}
                    />
                  ) : (
                    <textarea
                      value={ctrl.ocrResult.content || ''}
                      onChange={(e) => ctrl.updateOcrResultContent(e.target.value)}
                      style={{ width: '100%', minHeight: 620, border: '1px solid rgba(148,163,184,0.2)', borderRadius: 6, background: 'rgba(0,0,0,0.1)', resize: 'vertical', outline: 'none', color: 'inherit', fontFamily: 'monospace', padding: 16, lineHeight: 1.6 }}
                      spellCheck={false}
                      placeholder="No text content available."
                    />
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {ctrl.step === 'config' && typeof document !== 'undefined' && createPortal(
        <div className="studio-edit-bottom-save-wrap">
          <button
            type="button"
            className="studio-edit-btn-apply studio-edit-fixed-save-btn"
            onClick={() => { void ctrl.runTool(); }}
            disabled={ctrl.activeTool === null || ctrl.selectedPages.length === 0}
          >
            {runLabel}
          </button>
        </div>,
        document.body,
      )}

      {ctrl.step === 'result' && typeof document !== 'undefined' && createPortal(
        <div className="studio-edit-bottom-save-wrap" style={{ display: 'flex', gap: 10 }}>
          <button
            type="button"
            className="studio-edit-btn-apply studio-edit-fixed-save-btn"
            onClick={() => { void ctrl.downloadResults(); }}
            disabled={ctrl.outputIds.length === 0}
          >
            Download Results
          </button>
          <button
            type="button"
            className="studio-edit-btn-cancel studio-edit-fixed-save-btn"
            onClick={ctrl.resetWorkspace}
          >
            Start Over
          </button>
        </div>,
        document.body,
      )}

      {(ctrl.message || ctrl.error) && (
        <div className="studio-edit-message-overlay">
          <p className="studio-edit-message-text">{ctrl.error ?? ctrl.message}</p>
          <button type="button" className="studio-edit-message-close" onClick={() => { ctrl.setMessage(null); ctrl.setError(null); }}>
            &times;
          </button>
        </div>
      )}
    </section>
  );
}
