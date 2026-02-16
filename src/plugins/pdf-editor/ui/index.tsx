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

function makeDraft(pageIndex: number, xRatio: number, yRatio: number): TextEditDraft {
  const hRatio = 5;
  return {
    id: crypto.randomUUID(),
    pageIndex,
    text: 'New text',
    xRatio: clamp(xRatio, 0, 95),
    yRatio: clamp(yRatio - hRatio / 2, 0, 95),
    widthRatio: 30,
    heightRatio: hRatio,
    fontSize: 14,
    fontFamily: 'Roboto',
    color: '#000000',
    backgroundColor: '#ffffff',
    bold: false,
    italic: false,
    opacity: 100,
    rotation: 0,
    textAlign: 'left',
    horizontalScaling: 1.0,
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
  const [history, setHistory] = useState<TextEditDraft[][]>([[]]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [selectedEditId, setSelectedEditId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'preview' | 'details'>('preview');
  const [textLayerSpans, setTextLayerSpans] = useState<TextLayerSpan[]>([]);
  const [stageHeight, setStageHeight] = useState(0);

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

  const saveToHistory = useCallback((elements: TextEditDraft[]) => {
    setHistory((prev) => {
      const next = prev.slice(0, historyIndex + 1);
      next.push([...elements]);
      return next;
    });
    setHistoryIndex((prev) => prev + 1);
  }, [historyIndex]);

  const undo = useCallback(() => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      setEdits([...history[newIndex]]);
    }
  }, [history, historyIndex]);

  const redo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      setHistoryIndex(newIndex);
      setEdits([...history[newIndex]]);
    }
  }, [history, historyIndex]);

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

  const detectTextAt = useCallback(async (pdfBytes: Uint8Array, pageNumber: number, xPercent: number, yPercent: number) => {
    const pdfjsBase = await loadPdfJs();
    if (!pdfjsBase) return null;

    try {
      const loadingTask = pdfjsBase.getDocument({ data: pdfBytes, disableWorker: true });
      const pdf = await loadingTask.promise;
      const page = await pdf.getPage(pageNumber);
      const textContent = await (page as any).getTextContent({ includeStyles: true });
      const viewport = page.getViewport({ scale: 1.0 });

      const targetX = (xPercent / 100) * viewport.width;
      const targetY = (yPercent / 100) * viewport.height;

      let targetItem: any = null;
      let minDistance = Infinity;

      for (const item of textContent.items) {
        if (!('str' in item)) continue;

        const transform = item.transform;
        const fontSize = Math.sqrt(transform[0] * transform[0] + transform[1] * transform[1]);
        const itemX = transform[4];
        const itemY = viewport.height - transform[5] - (item.height || fontSize);
        const itemW = (item as any).width || ((item as any).str.length * fontSize * 0.5);
        const itemH = (item as any).height || fontSize;

        const centerX = itemX + itemW / 2;
        const centerY = itemY + itemH / 2;
        const dist = Math.sqrt(Math.pow(targetX - centerX, 2) + Math.pow(targetY - centerY, 2));

        if (dist < minDistance && dist < 50) {
          minDistance = dist;
          targetItem = { item, fontSize, centerY };
        }
      }

      if (!targetItem) return null;

      const Y_TOLERANCE = targetItem.fontSize * 0.5;
      const lineItems = textContent.items.filter((item: any) => {
        if (!('str' in item)) return false;
        const itemY = viewport.height - item.transform[5] - (item.height || targetItem.fontSize);
        const itemFontSize = Math.sqrt(item.transform[0] * item.transform[0] + item.transform[1] * item.transform[1]);
        const itemCenterY = itemY + (item.height || itemFontSize) / 2;
        return Math.abs(itemCenterY - targetItem.centerY) < Y_TOLERANCE;
      }).sort((a: any, b: any) => a.transform[4] - b.transform[4]);

      if (lineItems.length === 0) return null;

      const firstItem = lineItems[0] as any;
      const lastItem = lineItems[lineItems.length - 1] as any;

      const firstX = firstItem.transform[4];
      const lastX = lastItem.transform[4];
      const lastW = (lastItem as any).width || (lastItem.str.length * targetItem.fontSize * 0.5);

      const totalWidth = (lastX + lastW) - firstX;
      const itemStyle = textContent.styles[targetItem.item.fontName];
      let fontFamily = 'Roboto';
      let bold = false;
      let italic = false;
      const scaleX = Math.sqrt(targetItem.item.transform[0] * targetItem.item.transform[0] + targetItem.item.transform[1] * targetItem.item.transform[1]);
      const scaleY = Math.sqrt(targetItem.item.transform[2] * targetItem.item.transform[2] + targetItem.item.transform[3] * targetItem.item.transform[3]);
      const fontSize = Math.round(Math.max(scaleX, scaleY) * 100) / 100;

      if (itemStyle) {
        const rawFontName = itemStyle.fontFamily || '';
        const fontName = (rawFontName.includes('+') ? rawFontName.split('+')[1] : rawFontName).toLowerCase();
        bold = fontName.includes('bold') || fontName.includes('heavy') || fontName.includes('black') || fontName.includes('medium') || fontName.includes('demi');
        italic = fontName.includes('italic') || fontName.includes('oblique') || fontName.includes('slanted');

        if (fontName.includes('roboto')) fontFamily = 'Roboto';
        else if (fontName.includes('arial') || fontName.includes('helvetica') || fontName.includes('sans')) fontFamily = 'Arial';
        else if (fontName.includes('times') || fontName.includes('serif')) fontFamily = 'Times New Roman';
        else if (fontName.includes('courier') || fontName.includes('mono')) fontFamily = 'Courier New';
      }

      let mergedText = "";
      for (let i = 0; i < lineItems.length; i++) {
        const item = lineItems[i] as any;
        if (i > 0) {
          const prevItem = lineItems[i - 1] as any;
          const prevX = prevItem.transform[4];
          const prevW = (prevItem as any).width || (prevItem.str.length * targetItem.fontSize * 0.5);
          const gap = item.transform[4] - (prevX + prevW);
          if (gap > targetItem.fontSize * 0.1 && !mergedText.endsWith(' ') && !item.str.startsWith(' ')) {
            mergedText += " ";
          }
        }
        mergedText += item.str;
      }
      mergedText = mergedText.replace(/\s+/g, ' ').trim();

      return {
        text: mergedText,
        xRatio: ((firstX + totalWidth / 2) / viewport.width) * 100,
        yRatio: (targetItem.centerY / viewport.height) * 100,
        widthRatio: (totalWidth / viewport.width) * 100,
        heightRatio: (fontSize * 1.1 / viewport.height) * 100,
        fontSize: fontSize,
        fontFamily,
        bold,
        italic
      };
    } catch (error) {
      console.error('Error detecting text line:', error);
      return null;
    }
  }, []);

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

    const nextEdit: TextEditDraft = {
      id: crypto.randomUUID(),
      pageIndex: currentPage - 1,
      text,
      xRatio: params.xRatio,
      yRatio: params.yRatio,
      widthRatio: params.widthRatio ?? 30, // Default 30% width
      heightRatio: params.heightRatio ?? 10,
      fontSize: params.fontSize,
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
    setActiveTab('preview');
  }, [currentPage, fileId, saveToHistory]);

  const handleSmartDetect = useCallback(async (x: number, y: number) => {
    if (!fileId) return;

    const entry = await runtime.vfs.read(fileId);
    const blob = await entry.getBlob();
    const bytes = new Uint8Array(await blob.arrayBuffer());

    const detected = await detectTextAt(bytes, currentPage, x, y);
    if (detected) {
      appendEditFromBounds({
        text: detected.text,
        xRatio: detected.xRatio - detected.widthRatio / 2,
        yRatio: detected.yRatio - detected.heightRatio / 2,
        widthRatio: detected.widthRatio,
        heightRatio: detected.heightRatio,
        fontSize: detected.fontSize,
        fontFamily: 'Roboto', // Force Roboto for best support
        bold: detected.bold,
        italic: detected.italic,
        textAlign: 'left',
        originalRect: {
          x: detected.xRatio - detected.widthRatio / 2,
          y: detected.yRatio - detected.heightRatio / 2,
          w: detected.widthRatio,
          h: detected.heightRatio
        }
      });
    }
  }, [fileId, currentPage, detectTextAt, appendEditFromBounds, runtime.vfs]);

  const handleFileInput = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const files = event.target.files ? Array.from(event.target.files) : [];
    event.target.value = '';
    if (files.length === 0 || !onPickFiles) {
      return;
    }
    await onPickFiles(files);
  };

  const handleAddAtPoint = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    const hostOrNull = previewRef.current;
    if (!hostOrNull) return;
    const stage = hostOrNull.querySelector('.pdf-editor-preview-stage');
    if (!stage) return;

    const bounds = stage.getBoundingClientRect(); // Use stage bounds!
    if (bounds.width <= 0 || bounds.height <= 0) {
      return;
    }

    const nextX = clamp(((event.clientX - bounds.left) / bounds.width) * 100, 0, 100);
    const nextY = clamp(((event.clientY - bounds.top) / bounds.height) * 100, 0, 100);

    if (selectTextMode) {
      void handleSmartDetect(nextX, nextY);
      return;
    }

    if (!addMode) {
      return;
    }

    const next = [...edits, makeDraft(currentPage - 1, nextX, nextY)];
    setEdits(next);
    saveToHistory(next);
    setSelectedEditId(next[next.length - 1].id);
    setAddMode(false);
    setActiveTab('preview');
  }, [addMode, currentPage, edits, selectTextMode, saveToHistory, handleSmartDetect]);

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

  const removeSelected = useCallback(() => {
    if (!selectedEditId) {
      return;
    }

    setEdits((current) => {
      const next = current.filter((item) => item.id !== selectedEditId);
      saveToHistory(next);
      syncSelected(next);
      return next;
    });
  }, [selectedEditId, syncSelected, saveToHistory]);

  const createEditFromSpan = useCallback((span: TextLayerSpan) => {
    appendEditFromBounds({
      text: span.text,
      xRatio: span.xRatio * 100,
      yRatio: span.yRatio * 100,
      widthRatio: span.widthRatio * 100,
      heightRatio: span.heightRatio * 100,
      fontSize: span.fontSizeRatio * 1000, // Roughly
      fontFamily: span.fontName,
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

    const stage = host.querySelector('.pdf-editor-preview-stage');
    if (!stage) return;

    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    const bounds = stage.getBoundingClientRect(); // Use stage bounds!
    if (rect.width <= 0 || rect.height <= 0 || bounds.width <= 0 || bounds.height <= 0) {
      return;
    }

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
      xRatio: rawX * 100,
      yRatio: rawY * 100,
      widthRatio: rawW * 100,
      heightRatio: rawH * 100,
      fontSize: rawH * 1000,
    });
    selection.removeAllRanges();
  }, [appendEditFromBounds, fileId, selectTextMode]);

  useEffect(() => {
    if (!thumbnailUrl) return;
    const host = previewRef.current;
    if (!host) return;
    const stage = host.querySelector('.pdf-editor-preview-stage');
    if (stage) {
      setStageHeight(stage.clientHeight);
    }
  }, [thumbnailUrl]);

  const startProcessing = useCallback(() => {
    const payload = edits.map((edit) => ({
      pageIndex: edit.pageIndex,
      text: edit.text,
      xRatio: edit.xRatio,
      yRatio: edit.yRatio,
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

            <div className="pdf-editor-format-controls">
              <button
                type="button"
                className={`format-btn ${selectedEdit?.bold ? 'active' : ''}`}
                onClick={() => updateSelectedEdit({ bold: !selectedEdit?.bold })}
                disabled={!selectedEdit}
              >
                B
              </button>
              <button
                type="button"
                className={`format-btn ${selectedEdit?.italic ? 'active' : ''}`}
                onClick={() => updateSelectedEdit({ italic: !selectedEdit?.italic })}
                disabled={!selectedEdit}
              >
                I
              </button>
              <select
                className="tool-config-input font-select"
                value={selectedEdit?.fontFamily ?? 'Roboto'}
                onChange={(e) => updateSelectedEdit({ fontFamily: e.target.value })}
                disabled={!selectedEdit}
              >
                <option value="Roboto">Roboto</option>
                <option value="Arial">Arial</option>
                <option value="Times New Roman">Times</option>
                <option value="Courier New">Courier</option>
              </select>
            </div>

            <label className="tool-config-label" htmlFor="pdf-editor-font">Font size: {selectedEdit?.fontSize ?? 24}px</label>
            <input
              id="pdf-editor-font"
              className="pdf-editor-range"
              type="range"
              min={8}
              max={120}
              value={selectedEdit?.fontSize ?? 24}
              onChange={(event) => updateSelectedEdit({ fontSize: Number(event.target.value) })}
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

                <div className="pdf-editor-history-controls">
                  <button
                    type="button"
                    className="ocr-concept-tool-btn"
                    onClick={undo}
                    disabled={historyIndex <= 0}
                    title="Undo (Ctrl+Z)"
                  >
                    <LinearIcon name="refresh" className="linear-icon" style={{ transform: 'scaleX(-1)' }} />
                  </button>
                  <button
                    type="button"
                    className="ocr-concept-tool-btn"
                    onClick={redo}
                    disabled={historyIndex >= history.length - 1}
                    title="Redo (Ctrl+Y)"
                  >
                    <LinearIcon name="refresh" className="linear-icon" />
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
                                fontSize: `${span.fontSizeRatio * stageHeight}px`,
                                transform: 'translateY(-5%)', // Slight upward shift to align better with selection glow
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
                            left: `${edit.xRatio}%`,
                            top: `${edit.yRatio}%`,
                            width: `${edit.widthRatio}%`,
                            height: `${edit.heightRatio}%`,
                            color: edit.color,
                            backgroundColor: edit.backgroundColor,
                            fontSize: `${(edit.fontSize / 842) * stageHeight}px`,
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
                          {edit.id === selectedEditId ? (
                            <textarea
                              className="pdf-editor-overlay-input"
                              value={edit.text}
                              autoFocus
                              onChange={(e) => updateSelectedEdit({ text: e.target.value })}
                              onPointerDown={(e) => e.stopPropagation()}
                            />
                          ) : (
                            <span className="pdf-editor-overlay-text">{edit.text || 'Text'}</span>
                          )}
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
