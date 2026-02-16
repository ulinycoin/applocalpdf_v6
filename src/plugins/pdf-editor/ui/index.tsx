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
  const stageRef = useRef<HTMLDivElement | null>(null);
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
  const renderStageHeight = stageHeight > 0 ? stageHeight : 842;

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
    setActiveTab('preview');
  }, [currentPage, fileId, saveToHistory]);

  const handleSmartDetect = useCallback(async (x: number, y: number) => {
    if (!fileId) return;

    const entry = await runtime.vfs.read(fileId);
    const blob = await entry.getBlob();
    const bytes = new Uint8Array(await blob.arrayBuffer());

    const detected = await detectTextAt(bytes, currentPage, x, y);
    if (detected) {
      const normalizedHeight = Math.max(1.6, detected.heightRatio);
      const leftX = detected.xRatio - detected.widthRatio / 2;
      const topY = detected.yRatio - normalizedHeight / 2;
      const existing = edits.find((edit) => (
        edit.pageIndex === currentPage - 1 &&
        edit.originalRect &&
        Math.abs(edit.originalRect.x - leftX) < 0.6 &&
        Math.abs(edit.originalRect.y - topY) < 0.6 &&
        Math.abs(edit.originalRect.w - detected.widthRatio) < 0.6 &&
        Math.abs(edit.originalRect.h - normalizedHeight) < 0.6
      ));
      if (existing) {
        const derivedFontSize = normalizedHeight * 8.42 * 0.86;
        if (existing.fontSize < derivedFontSize) {
          setEdits((current) => current.map((item) => (
            item.id === existing.id ? { ...item, fontSize: derivedFontSize } : item
          )));
        }
        setSelectedEditId(existing.id);
        return;
      }

      appendEditFromBounds({
        text: detected.text,
        xRatio: leftX,
        yRatio: topY,
        widthRatio: detected.widthRatio,
        heightRatio: normalizedHeight,
        fontSize: detected.fontSize,
        fontFamily: 'Roboto', // Force Roboto for best support
        bold: detected.bold,
        italic: detected.italic,
        textAlign: 'left',
        originalRect: {
          x: leftX,
          y: topY,
          w: detected.widthRatio,
          h: normalizedHeight
        }
      });
    }
  }, [appendEditFromBounds, currentPage, detectTextAt, edits, fileId, runtime.vfs]);

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
      fontSize: (rawH * 842) * 0.9,
      originalRect: {
        x: rawX * 100,
        y: rawY * 100,
        w: rawW * 100,
        h: rawH * 100,
      },
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
