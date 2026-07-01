import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { usePlatform } from '../../../app/react/platform-context';
import { LinearIcon } from '../../../v6/components/icons/linear-icon';
import { IMAGES_TO_PDF_FREE_LIMIT, IMAGES_TO_PDF_PRO_LIMIT } from '../definition';

interface ImagesToPdfConfigProps {
  inputFiles: string[];
  onStart: (options: Record<string, unknown>) => void;
  onBack: () => void;
  onPickFiles?: (files: File[]) => void | Promise<void>;
  onClearFiles?: () => void | Promise<void>;
  currentStep?: 'upload' | 'config' | 'processing' | 'result';
  progress?: number;
  outputCount?: number;
  onDownload?: () => void | Promise<void>;
}

export default function ImagesToPdfConfig({
  inputFiles,
  onStart,
  onBack,
  onPickFiles,
  onClearFiles,
  currentStep,
  progress = 0,
  outputCount = 0,
  onDownload,
}: ImagesToPdfConfigProps) {
  const { runtime } = usePlatform();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [fileNames, setFileNames] = useState<Record<string, string>>({});
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});
  const [orderedIds, setOrderedIds] = useState<string[]>(inputFiles);
  const plan = runtime.billing.getContext().plan;
  const isPro = plan === 'pro';
  const imageLimit = isPro ? IMAGES_TO_PDF_PRO_LIMIT : IMAGES_TO_PDF_FREE_LIMIT;

  useEffect(() => {
    setOrderedIds(inputFiles);
  }, [inputFiles]);

  useEffect(() => {
    let cancelled = false;
    const urls: Record<string, string> = {};

    const load = async () => {
      const names: Record<string, string> = {};
      for (const id of inputFiles) {
        const entry = await runtime.vfs.read(id);
        names[id] = entry.getName();
        const blob = await entry.getBlob();
        if (typeof URL !== 'undefined' && blob.type.startsWith('image/')) {
          urls[id] = URL.createObjectURL(blob);
        }
      }
      if (!cancelled) {
        setFileNames(names);
        setPreviewUrls((current) => {
          Object.values(current).forEach((url) => URL.revokeObjectURL(url));
          return urls;
        });
      }
    };

    void load();
    return () => {
      cancelled = true;
      Object.values(urls).forEach((url) => URL.revokeObjectURL(url));
    };
  }, [inputFiles, runtime.vfs]);

  const moveUp = (index: number) => {
    if (index === 0) return;
    const next = [...orderedIds];
    [next[index - 1], next[index]] = [next[index], next[index - 1]];
    setOrderedIds(next);
  };

  const moveDown = (index: number) => {
    if (index >= orderedIds.length - 1) return;
    const next = [...orderedIds];
    [next[index + 1], next[index]] = [next[index], next[index + 1]];
    setOrderedIds(next);
  };

  const handleFileInput = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files ? Array.from(event.target.files) : [];
    event.target.value = '';
    if (files.length === 0 || !onPickFiles) return;
    await onPickFiles(files);
  };

  const hasInput = orderedIds.length > 0;
  const isProcessing = currentStep === 'processing';
  const hasResult = currentStep === 'result' && outputCount > 0;
  const overLimit = orderedIds.length > imageLimit;
  const canRun = hasInput && !isProcessing && !overLimit;

  const limitHint = useMemo(() => {
    if (isPro) {
      return `Pro supports up to ${IMAGES_TO_PDF_PRO_LIMIT} images per PDF.`;
    }
    return `Free supports up to ${IMAGES_TO_PDF_FREE_LIMIT} images. Upgrade to Pro for larger batches.`;
  }, [isPro]);

  return (
    <div className="tool-config-root">
      <p className="tool-config-copy">
        Combine JPG, PNG, or WebP images into one PDF. Arrange page order before converting.
      </p>
      <p className="tool-config-copy" style={{ marginTop: 0 }}>{limitHint}</p>

      <div
        className={`ocr-concept-upload ${onPickFiles ? '' : 'upload-readonly'}`}
        role={onPickFiles ? 'button' : undefined}
        tabIndex={onPickFiles ? 0 : -1}
        onClick={() => {
          if (onPickFiles) {
            inputRef.current?.click();
          }
        }}
        onKeyDown={(event) => {
          if (!onPickFiles) return;
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            inputRef.current?.click();
          }
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/*"
          multiple
          style={{ display: 'none' }}
          onChange={(event) => { void handleFileInput(event); }}
        />
        <div className="ocr-concept-upload-icon">
          <LinearIcon name="image" className="linear-icon icon-md" />
        </div>
        <p className="ocr-concept-upload-title">Drop images or click to upload</p>
        <p className="ocr-concept-upload-copy">JPG, PNG, or WebP. Each image becomes one PDF page.</p>
        <div className="ocr-concept-file-chip">
          <span className="ocr-concept-file-name">
            {hasInput ? `${orderedIds.length} image${orderedIds.length === 1 ? '' : 's'} selected` : 'No images selected'}
          </span>
          {hasInput && onClearFiles ? (
            <button
              type="button"
              className="ocr-concept-clear-btn"
              onClick={(event) => {
                event.stopPropagation();
                void onClearFiles();
              }}
              aria-label="Clear selected images"
            >
              <LinearIcon name="x" className="linear-icon" />
            </button>
          ) : null}
        </div>
      </div>

      {overLimit ? (
        <p className="tool-config-copy" style={{ color: 'var(--red)' }}>
          {`Too many images for your plan (${orderedIds.length}/${imageLimit}). Remove ${orderedIds.length - imageLimit} or upgrade to Pro.`}
        </p>
      ) : null}

      {hasInput ? (
        <ul className="tool-config-list">
          {orderedIds.map((id, index) => (
            <li key={id} className="tool-config-list-item">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                {previewUrls[id] ? (
                  <img
                    src={previewUrls[id]}
                    alt=""
                    style={{ width: 40, height: 52, objectFit: 'cover', borderRadius: 4, border: '1px solid var(--border)' }}
                  />
                ) : (
                  <div style={{ width: 40, height: 52, borderRadius: 4, background: 'var(--bg-2)' }} />
                )}
                <span style={{ fontWeight: 600, fontSize: '0.84rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {index + 1}. {fileNames[id] || 'Loading...'}
                </span>
              </div>
              <div style={{ display: 'flex', gap: '0.34rem' }}>
                <button className="btn-secondary" onClick={() => moveUp(index)} disabled={index === 0} aria-label="Move image up">
                  <span className="btn-inline"><LinearIcon name="chevron-up" className="linear-icon" />Up</span>
                </button>
                <button className="btn-secondary" onClick={() => moveDown(index)} disabled={index === orderedIds.length - 1} aria-label="Move image down">
                  <span className="btn-inline"><LinearIcon name="chevron-down" className="linear-icon" />Down</span>
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="tool-config-actions">
        <button className="btn-ghost" onClick={onBack}>Cancel</button>
        <button
          className="btn-primary"
          disabled={hasResult ? false : !canRun}
          onClick={() => {
            if (hasResult && onDownload) {
              void onDownload();
              return;
            }
            onStart({
              order: orderedIds,
              maxImages: imageLimit,
            });
          }}
        >
          {hasResult
            ? 'Download PDF'
            : (isProcessing
              ? `Converting ${Math.max(0, Math.min(100, Math.round(progress)))}%`
              : `Create PDF (${orderedIds.length} page${orderedIds.length === 1 ? '' : 's'})`)}
        </button>
      </div>
    </div>
  );
}
