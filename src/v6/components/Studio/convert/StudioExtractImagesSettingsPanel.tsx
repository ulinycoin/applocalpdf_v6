import { useEffect, useState } from 'react';
import type { StudioExtractImagesSettings } from './use-studio-convert-controller';

export interface ExtractImageRegion {
  globalId: string;
  xRatio: number;
  yRatio: number;
  widthRatio: number;
  heightRatio: number;
  pixelWidth: number;
  pixelHeight: number;
}

export interface ExtractPagePreview {
  pageId: string;
  thumbnailUrl: string | null;
  candidates: ExtractImageRegion[];
  isScanning: boolean;
}

interface StudioExtractImagesSettingsPanelProps {
  settings: StudioExtractImagesSettings;
  onChange: (settings: StudioExtractImagesSettings) => void;
  pages: ExtractPagePreview[];
  selectedImageIds: Set<string>;
  onToggleImage: (globalId: string) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
}

export function StudioExtractImagesSettingsPanel({
  settings,
  onChange,
  pages,
  selectedImageIds,
  onToggleImage,
  onSelectAll,
  onDeselectAll,
}: StudioExtractImagesSettingsPanelProps) {
  const [local, setLocal] = useState(settings);

  useEffect(() => { setLocal(settings); }, [settings]);
  useEffect(() => { onChange(local); }, [local, onChange]);

  const set = <K extends keyof StudioExtractImagesSettings>(key: K, value: StudioExtractImagesSettings[K]) => {
    setLocal((cur) => ({ ...cur, [key]: value }));
  };

  const totalFound = pages.reduce((n, p) => n + p.candidates.length, 0);
  const allSelected = totalFound > 0 && selectedImageIds.size === totalFound;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

      {/* Page previews */}
      {pages.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {selectedImageIds.size} / {totalFound} selected
            </span>
            <button
              type="button"
              onClick={allSelected ? onDeselectAll : onSelectAll}
              style={{ fontSize: 11, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0' }}
            >
              {allSelected ? 'Deselect all' : 'Select all'}
            </button>
          </div>

          {pages.map((page) => (
            <PagePreviewCard
              key={page.pageId}
              page={page}
              selectedImageIds={selectedImageIds}
              onToggleImage={onToggleImage}
            />
          ))}
        </div>
      )}

      {/* Format settings */}
      <div className="tool-config-card" style={{ display: 'grid', gap: '0.75rem' }}>
        <div>
          <label className="tool-config-label">Format</label>
          <select
            className="tool-config-select"
            value={local.format}
            onChange={(e) => set('format', e.target.value === 'jpeg' ? 'jpeg' : 'png')}
          >
            <option value="png">PNG</option>
            <option value="jpeg">JPEG</option>
          </select>
        </div>

        {local.format === 'jpeg' && (
          <div>
            <label className="tool-config-label">JPEG quality</label>
            <input
              className="tool-config-input"
              type="number"
              min={30}
              max={100}
              value={Math.round(local.jpegQuality * 100)}
              onChange={(e) => {
                const next = Number(e.target.value);
                set('jpegQuality', Math.max(0.3, Math.min(1, (Number.isFinite(next) ? next : 92) / 100)));
              }}
            />
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '0.75rem' }}>
          <div>
            <label className="tool-config-label">Min width</label>
            <input
              className="tool-config-input"
              type="number"
              min={1}
              value={local.minWidth}
              onChange={(e) => set('minWidth', Math.max(1, Math.round(Number(e.target.value) || 32)))}
            />
          </div>
          <div>
            <label className="tool-config-label">Min height</label>
            <input
              className="tool-config-input"
              type="number"
              min={1}
              value={local.minHeight}
              onChange={(e) => set('minHeight', Math.max(1, Math.round(Number(e.target.value) || 32)))}
            />
          </div>
        </div>

        <label className="tool-config-label" style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
          Include inline images
          <input type="checkbox" checked={local.includeInlineImages} onChange={(e) => set('includeInlineImages', e.target.checked)} />
        </label>

        <label className="tool-config-label" style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
          Remove duplicates
          <input type="checkbox" checked={local.dedupe} onChange={(e) => set('dedupe', e.target.checked)} />
        </label>
      </div>
    </div>
  );
}

function PagePreviewCard({
  page,
  selectedImageIds,
  onToggleImage,
}: {
  page: ExtractPagePreview;
  selectedImageIds: Set<string>;
  onToggleImage: (id: string) => void;
}) {
  return (
    <div style={{ borderRadius: 6, border: '1px solid var(--border)', overflow: 'hidden', background: 'var(--surface)' }}>
      {/* Thumbnail with overlay regions */}
      <div style={{ position: 'relative', width: '100%' }}>
        {page.thumbnailUrl ? (
          <img
            src={page.thumbnailUrl}
            alt=""
            draggable={false}
            style={{ display: 'block', width: '100%', height: 'auto' }}
          />
        ) : (
          <div style={{ width: '100%', paddingBottom: '141%', background: 'var(--bg-2)' }} />
        )}

        {/* Scanning spinner */}
        {page.isScanning && (
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(255,255,255,0.55)',
          }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round">
              <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83">
                <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="0.9s" repeatCount="indefinite" />
              </path>
            </svg>
          </div>
        )}

        {/* Image candidate regions */}
        {page.candidates.map((c) => {
          const isSelected = selectedImageIds.has(c.globalId);
          return (
            <button
              key={c.globalId}
              type="button"
              title={`${c.pixelWidth}×${c.pixelHeight}px`}
              onClick={() => onToggleImage(c.globalId)}
              style={{
                position: 'absolute',
                left: `${c.xRatio * 100}%`,
                top: `${c.yRatio * 100}%`,
                width: `${c.widthRatio * 100}%`,
                height: `${c.heightRatio * 100}%`,
                background: isSelected ? 'rgba(35,131,226,0.18)' : 'rgba(0,0,0,0)',
                border: `2px solid ${isSelected ? '#2383e2' : 'rgba(35,131,226,0.4)'}`,
                borderRadius: 2,
                cursor: 'pointer',
                padding: 0,
                transition: 'background 0.12s, border-color 0.12s',
                boxSizing: 'border-box',
              }}
              aria-pressed={isSelected}
            >
              {/* Size badge */}
              <span style={{
                position: 'absolute',
                bottom: 2,
                right: 2,
                fontSize: 9,
                lineHeight: 1,
                background: isSelected ? '#2383e2' : 'rgba(0,0,0,0.55)',
                color: '#fff',
                borderRadius: 2,
                padding: '1px 3px',
                pointerEvents: 'none',
                whiteSpace: 'nowrap',
              }}>
                {c.pixelWidth}×{c.pixelHeight}
              </span>
            </button>
          );
        })}

        {/* No images found state */}
        {!page.isScanning && page.candidates.length === 0 && page.thumbnailUrl && (
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(255,255,255,0.7)',
          }}>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>No images found</span>
          </div>
        )}
      </div>
    </div>
  );
}
