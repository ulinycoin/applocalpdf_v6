import { useEffect, useState } from 'react';
import { usePlatform } from '../../../app/react/platform-context';
import { LinearIcon } from '../../../v6/components/icons/linear-icon';

interface CompressPdfConfigProps {
  inputFiles: string[];
  onStart: (options: Record<string, unknown>) => void;
  onBack: () => void;
}

interface FileMeta {
  name: string;
  size: number;
  pageCount: number;
}

const QUALITY_LEVELS = [
  {
    id: 'low',
    label: 'Low',
    hint: 'Quality',
    description: 'Keep documentation sharp.',
    icon: 'image' as const,
    ratio: 0.65,
  },
  {
    id: 'medium',
    label: 'Median',
    hint: 'Balanced',
    description: 'Optimal for daily use.',
    icon: 'compress' as const,
    ratio: 0.45,
  },
  {
    id: 'high',
    label: 'Extreme',
    hint: 'Min Size',
    description: 'Shared via web or email.',
    icon: 'zap' as const,
    ratio: 0.28,
  },
] as const;

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

export default function CompressPdfConfig({ inputFiles, onStart, onBack }: CompressPdfConfigProps) {
  const { runtime } = usePlatform();
  const [quality, setQuality] = useState<'low' | 'medium' | 'high'>('medium');
  const [fileMeta, setFileMeta] = useState<FileMeta | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (inputFiles.length === 0) {
      setFileMeta(null);
      setIsLoading(false);
      return;
    }

    const fileId = inputFiles[0];
    let cancelled = false;

    void (async () => {
      try {
        const entry = await runtime.vfs.read(fileId);
        if (cancelled) return;

        const name = entry.getName();
        const size = await entry.getSize();
        if (cancelled) return;

        // Get page count via worker
        let pageCount = 1;
        try {
          const command = {
            id: crypto.randomUUID(),
            type: 'COMMAND' as const,
            payload: {
              type: 'GET_PDF_PAGE_COUNT' as const,
              payload: { fileId },
            },
          };
          const finalEvent = await runtime.workerOrchestrator.dispatch(command, undefined);
          if (
            !cancelled &&
            finalEvent?.payload?.type === 'PAGE_COUNT_RESULT'
          ) {
            pageCount = finalEvent.payload.payload.pageCount;
          }
        } catch {
          // fallback to 1 page
        }

        if (!cancelled) {
          setFileMeta({ name, size, pageCount });
        }
      } catch {
        if (!cancelled) {
          setFileMeta(null);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [inputFiles, runtime.vfs, runtime.workerOrchestrator]);

  const selectedQuality = QUALITY_LEVELS.find((l) => l.id === quality);
  const estimatedSize = fileMeta && selectedQuality
    ? Math.round(fileMeta.size * selectedQuality.ratio)
    : null;

  return (
    <div className="tool-config-root compress-config-root">
      {/* File info */}
      <div className="compress-file-box">
        <div className="compress-file-icon">
          <LinearIcon name="file-input" className="linear-icon" />
        </div>
        <div className="compress-file-details">
          <p className="compress-file-name" title={fileMeta?.name ?? ''}>
            {fileMeta?.name ?? (isLoading ? 'Loading…' : '')}
          </p>
          <p className="compress-file-meta">
            {fileMeta && !isLoading
              ? `${fileMeta.pageCount} page${fileMeta.pageCount !== 1 ? 's' : ''} · ${formatBytes(fileMeta.size)}`
              : isLoading
                ? 'Loading file info…'
                : ''}
          </p>
        </div>
      </div>

      <div className="compress-config-header">
        <h3 className="compress-config-main-title">Compression level</h3>
        <p className="tool-config-copy">
          Our local engine will re-encode your PDF to save space without cloud dependency.
        </p>
      </div>

      <div className="compress-quality-grid">
        {QUALITY_LEVELS.map((level) => {
          const levelEstimated = fileMeta
            ? Math.round(fileMeta.size * level.ratio)
            : null;
          const savings = fileMeta
            ? Math.round((1 - level.ratio) * 100)
            : null;

          return (
            <div
              key={level.id}
              className={`compress-quality-card ${quality === level.id ? 'active' : ''}`}
              onClick={() => setQuality(level.id)}
            >
              <div className="compress-card-selection">
                <div className="compress-radio-outer">
                  <div className="compress-radio-inner" />
                </div>
              </div>

              <div className="compress-card-content">
                <div className="compress-card-icon-box">
                  <LinearIcon name={level.icon as any} className="linear-icon icon-md" />
                </div>
                <div className="compress-card-text">
                  <div className="compress-card-title-row">
                    <span className="compress-card-label">{level.label}</span>
                    <span className="compress-card-hint">{level.hint}</span>
                  </div>
                  <p className="compress-card-desc">{level.description}</p>
                  {levelEstimated !== null && (
                    <p className="compress-estimate-row">
                      <span className="compress-estimate-size">{formatBytes(levelEstimated)}</span>
                      <span className="compress-estimate-savings">−{savings}%</span>
                    </p>
                  )}
                </div>
              </div>

              {quality === level.id && (
                <div className="compress-card-glow" />
              )}
            </div>
          );
        })}
      </div>

      <div className="tool-config-actions premium-actions">
        <button className="btn-ghost" onClick={onBack}>
          <span className="btn-inline">
            <LinearIcon name="x" className="linear-icon" />
            Back to Studio
          </span>
        </button>
        <button
          className="btn-primary btn-premium-glow"
          onClick={() => onStart({ quality })}
          disabled={!fileMeta && !isLoading}
        >
          <span className="btn-inline">
            <LinearIcon name="play" className="linear-icon" />
            {estimatedSize !== null
              ? `Compress to ${formatBytes(estimatedSize)}`
              : 'Compress PDF'}
          </span>
        </button>
      </div>
    </div>
  );
}
