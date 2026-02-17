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
  xRatio: number; // Percentage 0-100
  yRatio: number; // Percentage 0-100
  widthRatio: number;
  heightRatio: number;
  fontSize: number;
  fontFamily: string;
  color: string;
  backgroundColor: string;
  bold: boolean;
  italic: boolean;
  opacity: number;
  rotation: number;
  textAlign: 'left' | 'center' | 'right';
  horizontalScaling: number;
  originalRect?: {
    x: number;
    y: number;
    w: number;
    h: number;
  };
}

interface TextLayerSpan {
  id: string;
  text: string;
  xRatio: number;
  yRatio: number;
  widthRatio: number;
  heightRatio: number;
  fontSizeRatio: number;
  fontName?: string;
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

    // More precise width calculation. 
    // item.width is often more reliable but can be bloated if it includes trailing spaces.
    // fontHeight * chars * 0.5 is a decent estimate for proportional fonts if width is missing.
    const estimatedWidth = fontHeight * item.str.length * 0.46;
    const width = Math.max(1, (Number(item.width) * PREVIEW_SCALE || estimatedWidth));

    // Height should be exactly the font height to avoid overlapping other lines.
    const height = Math.max(1, (Number(item.height) * PREVIEW_SCALE || fontHeight * 1.1));
    const top = y - fontAscent;

    spans.push({
      id: `span-${i}-${item.str.length}`,
      text: item.str,
      xRatio: clamp(x / viewport.width, 0, 1),
      yRatio: clamp(top / viewport.height, 0, 1),
      widthRatio: clamp(width / viewport.width, 0.001, 1),
      heightRatio: clamp(height / viewport.height, 0.001, 1),
      fontSizeRatio: clamp(fontHeight / viewport.height, 0.004, 0.25),
      fontName: item.fontName,
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
  const stageRef = useRef<HTMLDivElement | null>(null);

  const [fileNames, setFileNames] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [previewZoom, setPreviewZoom] = useState(1);
  const [edits, setEdits] = useState<TextEditDraft[]>([]);
  const [selectedEditId, setSelectedEditId] = useState<string | null>(null);
  const [textLayerSpans, setTextLayerSpans] = useState<TextLayerSpan[]>([]);
  const [stageHeight, setStageHeight] = useState(0);

  const fileId = inputFiles[0] ?? null;
  const hasMultipleFiles = inputFiles.length > 1;

  const isProcessing = currentStep === 'processing';
  const hasResult = currentStep === 'result' && outputCount > 0;
  const loadingPercent = Math.max(0, Math.min(100, Math.round(progress)));

  const renderStageHeight = stageHeight > 0 ? stageHeight : 842;

  const pageEdits = useMemo(
    () => edits.filter((edit) => edit.pageIndex === currentPage - 1),
    [currentPage, edits],
  );

  const saveToHistory = useCallback((_elements: TextEditDraft[]) => {
    // History snapshots are intentionally disabled until undo/redo UI is wired.
  }, []);

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
    if (!fileId) {
      setTextLayerSpans([]);
      return;
    }

    let cancelled = false;
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
  }, [currentPage, fileId, runtime.vfs]);

  const appendEditFromBounds = useCallback((params: {
    text: string;
    xRatio: number;
    yRatio: number;
    widthRatio?: number;
    heightRatio?: number;
    fontSize: number;
    fontFamily?: string;
    bold?: boolean;
    italic?: boolean;
    textAlign?: 'left' | 'center' | 'right';
    originalRect?: TextEditDraft['originalRect'];
  }) => {
    const text = params.text.trim();
    if (!fileId || text.length === 0) {
      return;
    }

    const normalizedHeight = clamp(params.heightRatio ?? 10, 1.6, 100);
    const derivedFontSize = normalizedHeight * 8.42 * 0.86;

    const nextEdit: TextEditDraft = {
      id: crypto.randomUUID(),
      pageIndex: currentPage - 1,
      text,
      xRatio: clamp(params.xRatio, 0, 100),
      yRatio: clamp(params.yRatio, 0, 100),
      widthRatio: clamp(params.widthRatio ?? 30, 0.5, 100),
      heightRatio: normalizedHeight,
      fontSize: clamp(Math.max(params.fontSize, derivedFontSize), 8, 144),
      fontFamily: params.fontFamily || 'Roboto',
      color: '#000000',
      backgroundColor: '#ffffff',
      bold: params.bold || false,
      italic: params.italic || false,
      opacity: 100,
      rotation: 0,
      textAlign: params.textAlign || 'left',
      horizontalScaling: 1.0,
      originalRect: params.originalRect,
    };

    setEdits((current) => {
      const next = [...current, nextEdit];
      saveToHistory(next);
      return next;
    });
    setSelectedEditId(nextEdit.id);
  }, [currentPage, fileId, saveToHistory]);

  const handleFileInput = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const files = event.target.files ? Array.from(event.target.files) : [];
    event.target.value = '';
    if (files.length === 0 || !onPickFiles) {
      return;
    }
    await onPickFiles(files);
  };

  const updateSelectedEdit = useCallback((updates: Partial<TextEditDraft>) => {
    if (!selectedEditId) {
      return;
    }

    setEdits((current) => {
      const next = current.map((item) => {
        if (item.id !== selectedEditId) {
          return item;
        }

        const merged = { ...item, ...updates };
        return {
          ...merged,
          xRatio: clamp(merged.xRatio, 0, 100),
          yRatio: clamp(merged.yRatio, 0, 100),
          fontSize: clamp(merged.fontSize, 4, 144),
        };
      });
      saveToHistory(next);
      return next;
    });
  }, [selectedEditId, saveToHistory]);

  const createEditFromSpan = useCallback((span: TextLayerSpan) => {
    const lineThreshold = Math.max(0.0025, span.heightRatio * 0.55);
    const lineSpans = textLayerSpans
      .filter((candidate) => (
        Math.abs(candidate.yRatio - span.yRatio) <= lineThreshold ||
        Math.abs((candidate.yRatio + candidate.heightRatio) - (span.yRatio + span.heightRatio)) <= lineThreshold
      ))
      .sort((a, b) => a.xRatio - b.xRatio);

    if (lineSpans.length === 0) {
      return;
    }

    const left = Math.min(...lineSpans.map((s) => s.xRatio));
    const top = Math.min(...lineSpans.map((s) => s.yRatio));
    const right = Math.max(...lineSpans.map((s) => s.xRatio + s.widthRatio));
    const bottom = Math.max(...lineSpans.map((s) => s.yRatio + s.heightRatio));
    const width = right - left;
    const height = bottom - top;

    const ordered = [...lineSpans].sort((a, b) => a.xRatio - b.xRatio);
    let mergedText = '';
    for (let i = 0; i < ordered.length; i += 1) {
      const current = ordered[i];
      if (i > 0) {
        const prev = ordered[i - 1];
        const gap = current.xRatio - (prev.xRatio + prev.widthRatio);
        if (gap > Math.max(0.0015, current.heightRatio * 0.2) && !mergedText.endsWith(' ') && !current.text.startsWith(' ')) {
          mergedText += ' ';
        }
      }
      mergedText += current.text;
    }
    mergedText = mergedText.replace(/\s+/g, ' ').trim();
    if (!mergedText) {
      return;
    }

    const rect = {
      x: left * 100,
      y: top * 100,
      w: width * 100,
      h: Math.max(height * 100, 1.6),
    };

    const existing = edits.find((edit) => (
      edit.pageIndex === currentPage - 1 &&
      edit.originalRect &&
      Math.abs(edit.originalRect.x - rect.x) < 0.6 &&
      Math.abs(edit.originalRect.y - rect.y) < 0.6 &&
      Math.abs(edit.originalRect.w - rect.w) < 0.8 &&
      Math.abs(edit.originalRect.h - rect.h) < 0.8
    ));
    if (existing) {
      setSelectedEditId(existing.id);
      return;
    }

    appendEditFromBounds({
      text: mergedText,
      xRatio: rect.x,
      yRatio: rect.y,
      widthRatio: rect.w,
      heightRatio: rect.h,
      fontSize: (rect.h / 100) * 842 * 0.9,
      fontFamily: 'Roboto',
      originalRect: rect,
    });
  }, [appendEditFromBounds, currentPage, edits, textLayerSpans]);

  useEffect(() => {
    if (!thumbnailUrl) return;
    const host = previewRef.current;
    if (!host) return;
    const stage = host.querySelector('.pdf-editor-preview-stage');
    if (stage) {
      setStageHeight(stage.clientHeight);
    }
  }, [thumbnailUrl]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || typeof ResizeObserver === 'undefined') {
      return;
    }

    const update = () => {
      if (stage.clientHeight > 0) {
        setStageHeight(stage.clientHeight);
      }
    };
    update();

    const observer = new ResizeObserver(() => update());
    observer.observe(stage);
    return () => observer.disconnect();
  }, [previewZoom, thumbnailUrl, currentPage, fileId]);

  const startProcessing = useCallback(() => {
    const payload = edits.map((edit) => ({
      pageIndex: edit.pageIndex,
      text: edit.text,
      xRatio: edit.xRatio,
      yRatio: edit.yRatio,
      widthRatio: edit.widthRatio,
      heightRatio: edit.heightRatio,
      fontSize: edit.fontSize,
      fontFamily: edit.fontFamily,
      color: edit.color,
      backgroundColor: edit.backgroundColor,
      bold: edit.bold,
      italic: edit.italic,
      opacity: edit.opacity,
      rotation: edit.rotation,
      textAlign: edit.textAlign,
      horizontalScaling: edit.horizontalScaling,
      originalRect: edit.originalRect,
    }));

    onStart({ edits: payload });
  }, [edits, onStart]);

  return (
    <div className="tool-config-root pdf-editor-concept-root">
      <div className="ocr-concept-workspace">
        <section className="tool-config-card ocr-concept-left pdf-editor-left">
          <h3 className="pdf-editor-title">Edit PDF Text</h3>
          <p className="tool-config-copy">
            Click a line on preview, edit text inline, then save.
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
              Multiple files selected: the same edits are applied to each file.
            </p>
          )}

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
              {hasResult ? 'Download File' : (isProcessing ? `Saving ${loadingPercent}%` : 'Save PDF')}
            </button>
          </div>
        </section>

        <section className="tool-config-card ocr-concept-right pdf-editor-right">
          {!fileId ? (
            <div className="ocr-concept-empty">
              <LinearIcon name="tool" className="linear-icon icon-md" />
              <h4 className="ocr-concept-empty-title">PDF Editor</h4>
              <p className="ocr-concept-empty-copy">Upload a PDF to start inline text editing.</p>
            </div>
          ) : (
            <>
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
                <div className="pdf-editor-preview-scroll" ref={previewRef}>
                  <div
                    className="pdf-editor-preview-stage"
                    ref={stageRef}
                    style={{ width: `${previewZoom * 100}%` }}
                    onClick={() => setSelectedEditId(null)}
                  >
                    {thumbnailUrl
                      ? <img
                        src={thumbnailUrl}
                        alt={`PDF page ${currentPage}`}
                        className="pdf-editor-preview-image"
                        onLoad={(event) => {
                          const image = event.currentTarget;
                          if (image.clientHeight > 0) {
                            setStageHeight(image.clientHeight);
                          }
                        }}
                      />
                      : <div className="preview-fallback">No preview for this page</div>}

                    {textLayerSpans.length > 0 && (
                      <div className="pdf-editor-text-layer" aria-label="Text layer for inline editing">
                        {textLayerSpans.map((span) => (
                          <span
                            key={span.id}
                            className="pdf-editor-text-span"
                            style={{
                              left: `${span.xRatio * 100}%`,
                              top: `${span.yRatio * 100}%`,
                              width: `${span.widthRatio * 100}%`,
                              height: `${span.heightRatio * 100}%`,
                              fontSize: `${span.fontSizeRatio * renderStageHeight}px`,
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
                        className={`pdf-editor-overlay ${edit.id === selectedEditId ? 'active' : ''}`}
                        style={{
                          left: `${edit.xRatio}%`,
                          top: `${edit.yRatio}%`,
                          width: `${edit.widthRatio}%`,
                          height: `${edit.heightRatio}%`,
                          color: edit.color,
                          backgroundColor: edit.id === selectedEditId ? edit.backgroundColor : 'transparent',
                          fontSize: `${Math.max((edit.fontSize / 842) * renderStageHeight, (edit.heightRatio / 100) * renderStageHeight * 0.84)}px`,
                        }}
                        onClick={(event) => {
                          event.stopPropagation();
                          setSelectedEditId(edit.id);
                        }}
                      >
                        {edit.id === selectedEditId ? (
                          <textarea
                            className="pdf-editor-overlay-input"
                            value={edit.text}
                            autoFocus
                            onChange={(e) => updateSelectedEdit({ text: e.target.value })}
                            onClick={(e) => e.stopPropagation()}
                          />
                        ) : (
                          <span className="pdf-editor-overlay-text">{edit.text || 'Text'}</span>
                        )}
                      </div>
                    ))}

                    {isLoadingPreview && <div className="pdf-editor-preview-loading">Rendering preview...</div>}
                  </div>
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
