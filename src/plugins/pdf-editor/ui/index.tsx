import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { usePlatform } from '../../../app/react/platform-context';
import { defaultFilePreviewService } from '../../../v6/preview/preview-service';
import { LinearIcon } from '../../../v6/components/icons/linear-icon';

interface PdfEditorConfigProps {
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

interface TextEditDraft {
  id: string;
  pageIndex: number;
  text: string;
  xRatio: number;
  yRatio: number;
  widthRatio: number;
  heightRatio: number;
  fontSizeRatio: number;
  color: string;
  backgroundColor: string;
}

interface DragState {
  id: string;
  startClientX: number;
  startClientY: number;
  originXRatio: number;
  originYRatio: number;
}

interface TextLayerSpan {
  id: string;
  text: string;
  xRatio: number;
  yRatio: number;
  widthRatio: number;
  heightRatio: number;
  fontSizeRatio: number;
}

interface PdfJsLike {
  getDocument(params: { data: Uint8Array; disableWorker: boolean; verbosity?: number }): { promise: Promise<any> };
  GlobalWorkerOptions?: { workerSrc?: string };
  VerbosityLevel?: { ERRORS?: number };
  Util?: {
    transform: (m1: number[], m2: number[]) => number[];
  };
}

const ZOOM_MIN = 0.6;
const ZOOM_MAX = 3;
const ZOOM_STEP = 0.2;
const PREVIEW_SCALE = 2.1;

let pdfJsPromise: Promise<PdfJsLike | null> | null = null;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function makeDraft(pageIndex: number, xRatio: number, yRatio: number): TextEditDraft {
  return {
    id: crypto.randomUUID(),
    pageIndex,
    text: 'New text',
    xRatio,
    yRatio,
    widthRatio: 0.34,
    heightRatio: 0.09,
    fontSizeRatio: 0.035,
    color: '#1f2937',
    backgroundColor: '#ffffff',
  };
}

async function loadPdfJs(): Promise<PdfJsLike | null> {
  if (!pdfJsPromise) {
    pdfJsPromise = (async () => {
      try {
        const pdfjs = (await import('pdfjs-dist/legacy/build/pdf.mjs')) as unknown as PdfJsLike;
        if (pdfjs.GlobalWorkerOptions && !pdfjs.GlobalWorkerOptions.workerSrc) {
          const workerSrcMod = (await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')) as { default?: string };
          if (workerSrcMod.default) {
            pdfjs.GlobalWorkerOptions.workerSrc = workerSrcMod.default;
          }
        }
        return pdfjs;
      } catch {
        return null;
      }
    })();
  }
  return pdfJsPromise;
}

async function buildTextLayerSpans(pdfBytes: Uint8Array, pageNumber: number): Promise<TextLayerSpan[]> {
  const pdfjs = await loadPdfJs();
  if (!pdfjs || !pdfjs.Util?.transform) {
    return [];
  }

  const loadingTask = pdfjs.getDocument({
    data: pdfBytes,
    disableWorker: true,
    verbosity: pdfjs.VerbosityLevel?.ERRORS ?? 0,
  });
  const pdf = await loadingTask.promise;
  const page = await pdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale: PREVIEW_SCALE });
  const textContent = await page.getTextContent();
  const textStyles = textContent.styles as Record<string, { ascent?: number; descent?: number }>;

  const spans: TextLayerSpan[] = [];
  for (let i = 0; i < textContent.items.length; i += 1) {
    const item = textContent.items[i] as any;
    if (!item || typeof item.str !== 'string' || item.str.trim().length === 0 || !Array.isArray(item.transform)) {
      continue;
    }

    const tx = pdfjs.Util.transform(viewport.transform, item.transform);
    const x = tx[4];
    const y = tx[5];
    const fontHeight = Math.hypot(tx[2], tx[3]) || (Number(item.height) * PREVIEW_SCALE) || 8;
    const style = textStyles[item.fontName];
    let fontAscent = fontHeight;
    if (style?.ascent) {
      fontAscent = style.ascent * fontHeight;
    } else if (style?.descent) {
      fontAscent = (1 + style.descent) * fontHeight;
    }

    const width = Math.max(1, Number(item.width) * PREVIEW_SCALE || fontHeight * Math.max(1, item.str.length * 0.42));
    const height = Math.max(1, Number(item.height) * PREVIEW_SCALE || fontHeight);
    const top = y - fontAscent;

    spans.push({
      id: `span-${i}-${item.str.length}`,
      text: item.str,
      xRatio: clamp(x / viewport.width, 0, 1),
      yRatio: clamp(top / viewport.height, 0, 1),
      widthRatio: clamp(width / viewport.width, 0.001, 1),
      heightRatio: clamp(height / viewport.height, 0.001, 1),
      fontSizeRatio: clamp(fontHeight / viewport.height, 0.004, 0.25),
    });
  }

  return spans;
}

export default function PdfEditorConfig({
  inputFiles,
  onStart,
  onBack,
  onPickFiles,
  onClearFiles,
  currentStep,
  progress = 0,
  outputCount = 0,
  onDownload,
}: PdfEditorConfigProps) {
  const { runtime } = usePlatform();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragState | null>(null);

  const [fileNames, setFileNames] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [addMode, setAddMode] = useState(false);
  const [selectTextMode, setSelectTextMode] = useState(false);
  const [previewZoom, setPreviewZoom] = useState(1);
  const [edits, setEdits] = useState<TextEditDraft[]>([]);
  const [selectedEditId, setSelectedEditId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'preview' | 'details'>('preview');
  const [textLayerSpans, setTextLayerSpans] = useState<TextLayerSpan[]>([]);

  const fileId = inputFiles[0] ?? null;
  const hasMultipleFiles = inputFiles.length > 1;

  const isProcessing = currentStep === 'processing';
  const hasResult = currentStep === 'result' && outputCount > 0;
  const loadingPercent = Math.max(0, Math.min(100, Math.round(progress)));

  const selectedEdit = useMemo(
    () => edits.find((edit) => edit.id === selectedEditId) ?? null,
    [edits, selectedEditId],
  );

  const pageEdits = useMemo(
    () => edits.filter((edit) => edit.pageIndex === currentPage - 1),
    [currentPage, edits],
  );

  const syncSelected = useCallback((next: TextEditDraft[]) => {
    if (selectedEditId && !next.some((item) => item.id === selectedEditId)) {
      setSelectedEditId(next[0]?.id ?? null);
    }
  }, [selectedEditId]);

  useEffect(() => {
    if (inputFiles.length === 0) {
      setFileNames([]);
      return;
    }

    void Promise.all(
      inputFiles.map(async (id) => {
        const entry = await runtime.vfs.read(id);
        return entry.getName();
      }),
    ).then((names) => setFileNames(names));
  }, [inputFiles, runtime.vfs]);

  useEffect(() => {
    if (!fileId) {
      setThumbnailUrl(null);
      setPageCount(1);
      return;
    }

    const abortController = new AbortController();
    setIsLoadingPreview(true);

    void (async () => {
      try {
        const preview = await defaultFilePreviewService.getPdfPagePreview(
          runtime,
          fileId,
          currentPage,
          { scale: PREVIEW_SCALE },
          abortController.signal,
        );
        if (abortController.signal.aborted) {
          return;
        }
        setThumbnailUrl(preview.thumbnailUrl);
        setPageCount(Math.max(1, preview.pageCount ?? 1));
      } finally {
        if (!abortController.signal.aborted) {
          setIsLoadingPreview(false);
        }
      }
    })();

    return () => {
      abortController.abort();
    };
  }, [currentPage, fileId, runtime]);

  useEffect(() => {
    let cancelled = false;

    if (!fileId || !selectTextMode) {
      setTextLayerSpans([]);
      return;
    }

    void (async () => {
      try {
        const entry = await runtime.vfs.read(fileId);
        const blob = await entry.getBlob();
        const bytes = new Uint8Array(await blob.arrayBuffer());
        const spans = await buildTextLayerSpans(bytes, currentPage);
        if (!cancelled) {
          setTextLayerSpans(spans);
        }
      } catch {
        if (!cancelled) {
          setTextLayerSpans([]);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [currentPage, fileId, runtime.vfs, selectTextMode]);

  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      const drag = dragRef.current;
      const host = previewRef.current;
      if (!drag || !host || selectTextMode) {
        return;
      }

      const bounds = host.getBoundingClientRect();
      if (bounds.width <= 0 || bounds.height <= 0) {
        return;
      }

      const dxRatio = (event.clientX - drag.startClientX) / bounds.width;
      const dyRatio = (event.clientY - drag.startClientY) / bounds.height;

      setEdits((current) => current.map((item) => {
        if (item.id !== drag.id) {
          return item;
        }
        return {
          ...item,
          xRatio: clamp(drag.originXRatio + dxRatio, 0, 1 - item.widthRatio),
          yRatio: clamp(drag.originYRatio + dyRatio, 0, 1 - item.heightRatio),
        };
      }));
    };

    const onPointerUp = () => {
      dragRef.current = null;
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, [selectTextMode]);

  const handleFileInput = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const files = event.target.files ? Array.from(event.target.files) : [];
    event.target.value = '';
    if (files.length === 0 || !onPickFiles) {
      return;
    }
    await onPickFiles(files);
  };

  const handleAddAtPoint = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (!addMode || selectTextMode) {
      return;
    }

    const host = previewRef.current;
    if (!host) {
      return;
    }

    const bounds = host.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) {
      return;
    }

    const nextX = clamp((event.clientX - bounds.left) / bounds.width - 0.17, 0, 0.66);
    const nextY = clamp((event.clientY - bounds.top) / bounds.height - 0.045, 0, 0.91);
    const next = [...edits, makeDraft(currentPage - 1, nextX, nextY)];
    setEdits(next);
    setSelectedEditId(next[next.length - 1].id);
    setAddMode(false);
    setActiveTab('preview');
  }, [addMode, currentPage, edits, selectTextMode]);

  const updateSelectedEdit = useCallback((updates: Partial<TextEditDraft>) => {
    if (!selectedEditId) {
      return;
    }

    setEdits((current) => current.map((item) => {
      if (item.id !== selectedEditId) {
        return item;
      }

      const merged = { ...item, ...updates };
      return {
        ...merged,
        xRatio: clamp(merged.xRatio, 0, 1 - merged.widthRatio),
        yRatio: clamp(merged.yRatio, 0, 1 - merged.heightRatio),
        widthRatio: clamp(merged.widthRatio, 0.04, 1),
        heightRatio: clamp(merged.heightRatio, 0.04, 1),
        fontSizeRatio: clamp(merged.fontSizeRatio, 0.005, 0.2),
      };
    }));
  }, [selectedEditId]);

  const removeSelected = useCallback(() => {
    if (!selectedEditId) {
      return;
    }

    setEdits((current) => {
      const next = current.filter((item) => item.id !== selectedEditId);
      syncSelected(next);
      return next;
    });
  }, [selectedEditId, syncSelected]);

  const appendEditFromBounds = useCallback((params: {
    text: string;
    xRatio: number;
    yRatio: number;
    widthRatio: number;
    heightRatio: number;
  }) => {
    const text = params.text.trim();
    if (!fileId || text.length === 0) {
      return;
    }

    const widthRatio = clamp(params.widthRatio + 0.02, 0.06, 0.96);
    const heightRatio = clamp(params.heightRatio + 0.02, 0.04, 0.4);
    const xRatio = clamp(params.xRatio - 0.01, 0, 1 - widthRatio);
    const yRatio = clamp(params.yRatio - 0.01, 0, 1 - heightRatio);
    const fontSizeRatio = clamp(params.heightRatio * 0.9, 0.01, 0.2);

    const nextEdit: TextEditDraft = {
      id: crypto.randomUUID(),
      pageIndex: currentPage - 1,
      text,
      xRatio,
      yRatio,
      widthRatio,
      heightRatio,
      fontSizeRatio,
      color: '#1f2937',
      backgroundColor: '#ffffff',
    };

    setEdits((current) => [...current, nextEdit]);
    setSelectedEditId(nextEdit.id);
    setActiveTab('preview');
  }, [currentPage, fileId]);

  const createEditFromSpan = useCallback((span: TextLayerSpan) => {
    appendEditFromBounds({
      text: span.text,
      xRatio: span.xRatio,
      yRatio: span.yRatio,
      widthRatio: span.widthRatio,
      heightRatio: span.heightRatio,
    });
  }, [appendEditFromBounds]);

  const createEditFromSelection = useCallback(() => {
    if (!selectTextMode || !fileId) {
      return;
    }

    const host = previewRef.current;
    if (!host) {
      return;
    }

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      return;
    }

    const text = selection.toString().trim();
    if (text.length === 0 || selection.type !== 'Range') {
      return;
    }

    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    const bounds = host.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0 || bounds.width <= 0 || bounds.height <= 0) {
      return;
    }

    // Ignore accidental full-layer selections.
    const coverX = rect.width / bounds.width;
    const coverY = rect.height / bounds.height;
    if (coverX > 0.95 || coverY > 0.95) {
      return;
    }

    // Use normalized coordinates relative to current rendered stage.
    const rawX = (rect.left - bounds.left) / bounds.width;
    const rawY = (rect.top - bounds.top) / bounds.height;
    const rawW = rect.width / bounds.width;
    const rawH = rect.height / bounds.height;

    appendEditFromBounds({
      text,
      xRatio: rawX,
      yRatio: rawY,
      widthRatio: rawW,
      heightRatio: rawH,
    });
    selection.removeAllRanges();
  }, [appendEditFromBounds, fileId, selectTextMode]);

  const startProcessing = useCallback(() => {
    const payload = edits.map((edit) => ({
      pageIndex: edit.pageIndex,
      text: edit.text,
      xRatio: edit.xRatio,
      yRatio: edit.yRatio,
      widthRatio: edit.widthRatio,
      heightRatio: edit.heightRatio,
      fontSizeRatio: edit.fontSizeRatio,
      color: edit.color,
      backgroundColor: edit.backgroundColor,
    }));

    onStart({ edits: payload });
  }, [edits, onStart]);

  return (
    <div className="tool-config-root pdf-editor-concept-root">
      <div className="ocr-concept-workspace">
        <section className="tool-config-card ocr-concept-left pdf-editor-left">
          <h3 className="pdf-editor-title">Edit PDF Text</h3>
          <p className="tool-config-copy">
            Place text areas directly on the page preview. The editor covers old content and writes new text in place.
          </p>

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
              if (!onPickFiles) {
                return;
              }
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                inputRef.current?.click();
              }
            }}
          >
            <input
              ref={inputRef}
              type="file"
              accept="application/pdf"
              multiple
              style={{ display: 'none' }}
              onChange={(event) => {
                void handleFileInput(event);
              }}
            />
            <span className="ocr-concept-upload-icon" aria-hidden="true">
              <LinearIcon name="upload" className="linear-icon icon-md" />
            </span>
            <p className="ocr-concept-upload-title">Drop files or click to upload</p>
            <p className="ocr-concept-upload-copy">PDF only. Editing runs locally in browser.</p>

            <div className="ocr-concept-file-chip">
              <span className="ocr-concept-file-name">{fileNames.length > 0 ? fileNames.join(', ') : 'No file selected'}</span>
              {fileNames.length > 0 && onClearFiles ? (
                <button
                  type="button"
                  className="ocr-concept-clear-btn"
                  onClick={(event) => {
                    event.stopPropagation();
                    void onClearFiles();
                  }}
                  aria-label="Clear selected files"
                >
                  <LinearIcon name="x" className="linear-icon" />
                </button>
              ) : (
                <LinearIcon name="refresh" className="linear-icon" />
              )}
            </div>
          </div>

          {hasMultipleFiles && (
            <p className="pdf-editor-warning">
              Multiple files selected: the same edit coordinates are applied to each file.
            </p>
          )}

          <div className="ocr-concept-settings">
            <label className="tool-config-label">Text area</label>
            <button
              type="button"
              className={`btn-ghost ${addMode ? 'pdf-editor-btn-active' : ''}`}
              onClick={() => {
                setAddMode((current) => !current);
                if (!addMode) {
                  setSelectTextMode(false);
                }
              }}
              disabled={!fileId}
            >
              {addMode ? 'Click preview to place area' : 'Add text area'}
            </button>

            <label className="tool-config-label" htmlFor="pdf-editor-text">Text</label>
            <textarea
              id="pdf-editor-text"
              className="tool-config-input pdf-editor-textarea"
              value={selectedEdit?.text ?? ''}
              rows={4}
              placeholder="Select a text area on preview"
              onChange={(event) => updateSelectedEdit({ text: event.target.value })}
              disabled={!selectedEdit}
            />

            <label className="tool-config-label" htmlFor="pdf-editor-width">Width</label>
            <input
              id="pdf-editor-width"
              className="pdf-editor-range"
              type="range"
              min={5}
              max={100}
              value={Math.round((selectedEdit?.widthRatio ?? 0.34) * 100)}
              onChange={(event) => updateSelectedEdit({ widthRatio: Number(event.target.value) / 100 })}
              disabled={!selectedEdit}
            />

            <label className="tool-config-label" htmlFor="pdf-editor-height">Height</label>
            <input
              id="pdf-editor-height"
              className="pdf-editor-range"
              type="range"
              min={4}
              max={60}
              value={Math.round((selectedEdit?.heightRatio ?? 0.09) * 100)}
              onChange={(event) => updateSelectedEdit({ heightRatio: Number(event.target.value) / 100 })}
              disabled={!selectedEdit}
            />

            <label className="tool-config-label" htmlFor="pdf-editor-font">Font size</label>
            <input
              id="pdf-editor-font"
              className="pdf-editor-range"
              type="range"
              min={1}
              max={12}
              step={0.5}
              value={Math.round((selectedEdit?.fontSizeRatio ?? 0.035) * 1000) / 10}
              onChange={(event) => updateSelectedEdit({ fontSizeRatio: Number(event.target.value) / 100 })}
              disabled={!selectedEdit}
            />

            <div className="pdf-editor-color-row">
              <label className="pdf-editor-field" htmlFor="pdf-editor-color-text">
                <span>Text color</span>
                <input
                  id="pdf-editor-color-text"
                  type="color"
                  value={selectedEdit?.color ?? '#1f2937'}
                  onChange={(event) => updateSelectedEdit({ color: event.target.value })}
                  disabled={!selectedEdit}
                />
              </label>
              <label className="pdf-editor-field" htmlFor="pdf-editor-color-bg">
                <span>Cover color</span>
                <input
                  id="pdf-editor-color-bg"
                  type="color"
                  value={selectedEdit?.backgroundColor ?? '#ffffff'}
                  onChange={(event) => updateSelectedEdit({ backgroundColor: event.target.value })}
                  disabled={!selectedEdit}
                />
              </label>
            </div>

            <button type="button" className="btn-danger" onClick={removeSelected} disabled={!selectedEdit}>
              Remove selected area
            </button>
          </div>

          <div className="tool-config-actions ocr-concept-actions">
            <button className="btn-ghost" onClick={onBack}>Cancel</button>
            <button
              className="btn-primary"
              onClick={() => {
                if (hasResult && onDownload) {
                  void onDownload();
                  return;
                }
                startProcessing();
              }}
              disabled={hasResult ? false : (!fileId || edits.length === 0 || isProcessing)}
            >
              {hasResult ? 'Download File' : (isProcessing ? `Applying ${loadingPercent}%` : 'Run PDF Editor')}
            </button>
          </div>
        </section>

        <section className="tool-config-card ocr-concept-right pdf-editor-right">
          {!fileId ? (
            <div className="ocr-concept-empty">
              <LinearIcon name="tool" className="linear-icon icon-md" />
              <h4 className="ocr-concept-empty-title">PDF Editor</h4>
              <p className="ocr-concept-empty-copy">Upload a PDF in the left panel to start editing text in preview.</p>
            </div>
          ) : (
            <>
              <div className="ocr-concept-tabs" role="tablist" aria-label="PDF editor tabs">
                <button
                  type="button"
                  className={`ocr-concept-tab ${activeTab === 'preview' ? 'active' : ''}`}
                  onClick={() => setActiveTab('preview')}
                >
                  Preview
                </button>
                <button
                  type="button"
                  className={`ocr-concept-tab ${activeTab === 'details' ? 'active' : ''}`}
                  onClick={() => setActiveTab('details')}
                >
                  Details
                </button>
              </div>

              <div className="ocr-concept-toolbar pdf-editor-toolbar">
                <div className="pdf-editor-pager">
                  <button
                    type="button"
                    className="ocr-concept-tool-btn"
                    onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                    disabled={currentPage <= 1}
                  >
                    Prev
                  </button>
                  <span className="pdf-editor-page-copy">Page {currentPage}/{pageCount}</span>
                  <button
                    type="button"
                    className="ocr-concept-tool-btn"
                    onClick={() => setCurrentPage((page) => Math.min(pageCount, page + 1))}
                    disabled={currentPage >= pageCount}
                  >
                    Next
                  </button>
                </div>

                <div className="pdf-editor-toolbar-right">
                  <button
                    type="button"
                    className={`ocr-concept-tool-btn ${selectTextMode ? 'active' : ''}`}
                    onClick={() => {
                      const next = !selectTextMode;
                      setSelectTextMode(next);
                      if (next) {
                        setAddMode(false);
                      }
                    }}
                    title="Enable selectable text layer"
                  >
                    Select text
                  </button>
                  <button
                    type="button"
                    className="ocr-concept-tool-btn"
                    onClick={() => setPreviewZoom((z) => clamp(Number((z - ZOOM_STEP).toFixed(2)), ZOOM_MIN, ZOOM_MAX))}
                    disabled={previewZoom <= ZOOM_MIN}
                    aria-label="Zoom out"
                  >
                    -
                  </button>
                  <span className="pdf-editor-zoom-copy">{Math.round(previewZoom * 100)}%</span>
                  <button
                    type="button"
                    className="ocr-concept-tool-btn"
                    onClick={() => setPreviewZoom((z) => clamp(Number((z + ZOOM_STEP).toFixed(2)), ZOOM_MIN, ZOOM_MAX))}
                    disabled={previewZoom >= ZOOM_MAX}
                    aria-label="Zoom in"
                  >
                    +
                  </button>
                  <button
                    type="button"
                    className="ocr-concept-tool-btn"
                    onClick={() => setPreviewZoom(1)}
                    disabled={previewZoom === 1}
                  >
                    Reset
                  </button>
                </div>
              </div>

              <div className="ocr-concept-editor">
                {activeTab === 'preview' ? (
                  <div className="pdf-editor-preview-scroll" ref={previewRef}>
                    <div
                      className={`pdf-editor-preview-stage ${addMode ? 'pdf-editor-preview-add' : ''}`}
                      style={{ width: `${previewZoom * 100}%` }}
                      onClick={handleAddAtPoint}
                    >
                      {thumbnailUrl
                        ? <img src={thumbnailUrl} alt={`PDF page ${currentPage}`} className="pdf-editor-preview-image" />
                        : <div className="preview-fallback">No preview for this page</div>}

                      {selectTextMode && textLayerSpans.length > 0 && (
                        <div
                          className="pdf-editor-text-layer"
                          aria-label="Selectable text layer"
                          onMouseUp={createEditFromSelection}
                        >
                          {textLayerSpans.map((span) => (
                            <span
                              key={span.id}
                              className="pdf-editor-text-span"
                              style={{
                                left: `${span.xRatio * 100}%`,
                                top: `${span.yRatio * 100}%`,
                                width: `${span.widthRatio * 100}%`,
                                height: `${span.heightRatio * 100}%`,
                                fontSize: `${Math.max(8, span.fontSizeRatio * 1000)}%`,
                              }}
                              onClick={(event) => {
                                event.stopPropagation();
                                createEditFromSpan(span);
                              }}
                            >
                              {span.text}
                            </span>
                          ))}
                        </div>
                      )}

                      {pageEdits.map((edit) => (
                        <div
                          key={edit.id}
                          className={`pdf-editor-overlay ${edit.id === selectedEditId ? 'active' : ''} ${selectTextMode ? 'selection-disabled' : ''}`}
                          style={{
                            left: `${edit.xRatio * 100}%`,
                            top: `${edit.yRatio * 100}%`,
                            width: `${edit.widthRatio * 100}%`,
                            height: `${edit.heightRatio * 100}%`,
                            color: edit.color,
                            backgroundColor: edit.backgroundColor,
                            fontSize: `${Math.max(10, edit.fontSizeRatio * 100)}%`,
                          }}
                          onPointerDown={(event) => {
                            if (selectTextMode) {
                              return;
                            }
                            event.stopPropagation();
                            setSelectedEditId(edit.id);
                            dragRef.current = {
                              id: edit.id,
                              startClientX: event.clientX,
                              startClientY: event.clientY,
                              originXRatio: edit.xRatio,
                              originYRatio: edit.yRatio,
                            };
                          }}
                        >
                          <span className="pdf-editor-overlay-text">{edit.text || 'Text'}</span>
                        </div>
                      ))}

                      {isLoadingPreview && <div className="pdf-editor-preview-loading">Rendering preview...</div>}
                    </div>
                  </div>
                ) : (
                  <pre className="ocr-concept-editor-copy">{`Areas total: ${edits.length}
Areas on current page: ${pageEdits.length}
Selected area: ${selectedEdit ? 'yes' : 'no'}
Current page: ${currentPage}/${pageCount}
Zoom: ${Math.round(previewZoom * 100)}%
Text selection mode: ${selectTextMode ? 'enabled' : 'disabled'}

Tip: enable "Select text", then highlight a word/line on preview. An editable area will be created automatically.`}</pre>
                )}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
