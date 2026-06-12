import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent as ReactDragEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import { usePlatform } from '../../../app/react/platform-context';
import { defaultFilePreviewService } from '../../../v6/preview/preview-service';
import { LinearIcon } from '../../../v6/components/icons/linear-icon';
import type { PdfTextLayerSpan } from '../../../services/pdf/pdf-text-layer-extractor';
import { extractTextLayerForPreview } from '../../../services/pdf/pdf-text-layer-extractor';
import {
  clamp,
  normalizeText,
  isEditableTarget,
  mergeLineSpans,
  centerIsInsideRect,
  toStagePoint,
} from './text-edit-ui-utils';

interface Props {
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

type TextAlign = 'left' | 'center' | 'right';
type ShapeTool = 'rect' | 'whiteout' | 'circle' | 'line';

type EditorElement =
  | {
    type: 'text';
    id: string;
    pageIndex: number;
    text: string;
    xRatio: number;
    yRatio: number;
    widthRatio: number;
    heightRatio: number;
    fontSize: number;
    fontFamily: string;
    color: string;
    backgroundColor: string;
    bold: boolean;
    italic: boolean;
    opacity: number;
    textAlign: TextAlign;
    horizontalScaling: number;
    ascentRatio?: number;
    descentRatio?: number;
    sourceFontSizeRatio?: number;
    originalRect?: { x: number; y: number; w: number; h: number };
  }
  | {
    type: 'rect' | 'whiteout' | 'circle';
    id: string;
    pageIndex: number;
    xRatio: number;
    yRatio: number;
    widthRatio: number;
    heightRatio: number;
    color: string;
    strokeWidth: number;
    opacity: number;
  }
  | {
    type: 'line';
    id: string;
    pageIndex: number;
    x1Ratio: number;
    y1Ratio: number;
    x2Ratio: number;
    y2Ratio: number;
    color: string;
    strokeWidth: number;
    opacity: number;
  };

interface DraggingEdit {
  id: string;
  startClientX: number;
  startClientY: number;
  origXRatio: number;
  origYRatio: number;
  stageWidth: number;
  stageHeight: number;
}

interface DrawingDraft {
  tool: ShapeTool;
  pageIndex: number;
  startXRatio: number;
  startYRatio: number;
  currentXRatio: number;
  currentYRatio: number;
}

const PREVIEW_SCALE = 2.1;
const HISTORY_LIMIT = 80;
const DEFAULT_PAGE_SIZE = { width: 595, height: 842 };

function createElementId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

function cloneElements(elements: EditorElement[]): EditorElement[] {
  return elements.map((element) => (
    element.type === 'text'
      ? { ...element, originalRect: element.originalRect ? { ...element.originalRect } : undefined }
      : { ...element }
  ));
}

function serializeElements(elements: EditorElement[]): string {
  return JSON.stringify(elements);
}

export default function PdfEditorConfig({
  inputFiles,
  onStart,
  onBack,
  onPickFiles,
  onClearFiles,
  currentStep = 'config',
  progress = 0,
  outputCount = 0,
  onDownload,
}: Props) {
  const { runtime } = usePlatform();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const editingRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DraggingEdit | null>(null);
  const historyRef = useRef<EditorElement[][]>([[]]);
  const historyIndexRef = useRef(0);

  const [fileNames, setFileNames] = useState<string[]>([]);
  const [pageNumber, setPageNumber] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [stageSize, setStageSize] = useState(DEFAULT_PAGE_SIZE);
  const [zoom, setZoom] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [spans, setSpans] = useState<PdfTextLayerSpan[]>([]);
  const [elements, setElements] = useState<EditorElement[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [shapeTool, setShapeTool] = useState<ShapeTool | null>(null);
  const [drawing, setDrawing] = useState<DrawingDraft | null>(null);
  const [historyVersion, setHistoryVersion] = useState(0);
  const [isDraggingUpload, setIsDraggingUpload] = useState(false);

  const fileId = inputFiles[0] ?? null;
  const pageIndex = pageNumber - 1;
  const pageElements = useMemo(() => elements.filter((element) => element.pageIndex === pageIndex), [elements, pageIndex]);
  const pageTextElements = useMemo(() => pageElements.filter((element): element is Extract<EditorElement, { type: 'text' }> => element.type === 'text'), [pageElements]);
  const selectedElement = useMemo(() => elements.find((element) => element.id === selectedId) ?? null, [elements, selectedId]);
  const canUndo = historyIndexRef.current > 0;
  const canRedo = historyIndexRef.current < historyRef.current.length - 1;

  const pushHistory = useCallback((nextElements: EditorElement[]) => {
    const snapshot = cloneElements(nextElements);
    const current = historyRef.current[historyIndexRef.current] ?? [];
    if (serializeElements(current) === serializeElements(snapshot)) {
      return;
    }
    let nextHistory = historyRef.current.slice(0, historyIndexRef.current + 1);
    nextHistory.push(snapshot);
    if (nextHistory.length > HISTORY_LIMIT) {
      nextHistory = nextHistory.slice(nextHistory.length - HISTORY_LIMIT);
    }
    historyRef.current = nextHistory;
    historyIndexRef.current = nextHistory.length - 1;
    setHistoryVersion((version) => version + 1);
  }, []);

  const applyElements = useCallback((nextElements: EditorElement[], history = true) => {
    setElements(nextElements);
    if (history) {
      pushHistory(nextElements);
    }
  }, [pushHistory]);

  const startInlineEdit = useCallback((id: string) => {
    setSelectedId(id);
    setEditingId(id);
    setShapeTool(null);
    setDrawing(null);
  }, []);

  const commitInlineEdit = useCallback(() => {
    const target = editingRef.current;
    if (!target || !editingId) {
      return;
    }
    const nextText = normalizeText(target.innerText);
    setElements((current) => {
      const next = current.map((element) => (
        element.id === editingId && element.type === 'text'
          ? { ...element, text: nextText || element.text, backgroundColor: '#ffffff' }
          : element
      ));
      pushHistory(next);
      return next;
    });
    setEditingId(null);
  }, [editingId, pushHistory]);

  const undo = useCallback(() => {
    if (historyIndexRef.current <= 0) {
      return;
    }
    historyIndexRef.current -= 1;
    const snapshot = cloneElements(historyRef.current[historyIndexRef.current] ?? []);
    setElements(snapshot);
    setSelectedId((current) => (snapshot.some((element) => element.id === current) ? current : null));
    setEditingId(null);
    setHistoryVersion((version) => version + 1);
  }, []);

  const redo = useCallback(() => {
    if (historyIndexRef.current >= historyRef.current.length - 1) {
      return;
    }
    historyIndexRef.current += 1;
    const snapshot = cloneElements(historyRef.current[historyIndexRef.current] ?? []);
    setElements(snapshot);
    setSelectedId((current) => (snapshot.some((element) => element.id === current) ? current : null));
    setEditingId(null);
    setHistoryVersion((version) => version + 1);
  }, []);

  useEffect(() => {
    const next = cloneElements(elements);
    historyRef.current = [next];
    historyIndexRef.current = 0;
    setHistoryVersion((version) => version + 1);
    setSelectedId(null);
    setEditingId(null);
    setPageNumber(1);
  }, [fileId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!fileId) {
        setFileNames([]);
        return;
      }
      const names = await Promise.all(inputFiles.map(async (id) => {
        try {
          const entry = await runtime.vfs.read(id);
          return entry.getName();
        } catch {
          return id;
        }
      }));
      if (!cancelled) {
        setFileNames(names);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fileId, inputFiles, runtime.vfs]);

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      if (!fileId) {
        setPreviewUrl(null);
        setSpans([]);
        setPageCount(1);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const [preview, entry] = await Promise.all([
          defaultFilePreviewService.getPdfPagePreview(runtime, fileId, pageNumber, { scale: PREVIEW_SCALE }, controller.signal),
          runtime.vfs.read(fileId),
        ]);
        if (controller.signal.aborted) {
          return;
        }
        setPreviewUrl(preview.thumbnailUrl);
        if (preview.pageCount) {
          setPageCount(preview.pageCount);
        }
        const bytes = new Uint8Array(await (await entry.getBlob()).arrayBuffer());
        const layer = await extractTextLayerForPreview(bytes, pageNumber, PREVIEW_SCALE);
        if (controller.signal.aborted) {
          return;
        }
        setSpans(layer.spans);
        setStageSize({ width: layer.width, height: layer.height });
        setPageCount(layer.pageCount);
      } catch {
        if (!controller.signal.aborted) {
          setError('Could not load PDF preview.');
          setPreviewUrl(null);
          setSpans([]);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    })();
    return () => controller.abort();
  }, [fileId, pageNumber, runtime]);

  useEffect(() => {
    if (!editingId || !editingRef.current) {
      return;
    }
    const node = editingRef.current;
    node.focus();
    const range = document.createRange();
    range.selectNodeContents(node);
    range.collapse(false);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  }, [editingId]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) {
        if (event.key === 'Escape') {
          event.preventDefault();
          commitInlineEdit();
        }
        return;
      }
      const meta = event.metaKey || event.ctrlKey;
      if (meta && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) {
          redo();
        } else {
          undo();
        }
        return;
      }
      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedId) {
        event.preventDefault();
        const next = elements.filter((element) => element.id !== selectedId);
        setSelectedId(null);
        setEditingId(null);
        applyElements(next);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [applyElements, commitInlineEdit, elements, redo, selectedId, undo]);

  const createTextEditFromSpan = useCallback((span: PdfTextLayerSpan) => {
    const line = mergeLineSpans(span, spans);
    const existing = pageTextElements.find((element) => (
      element.originalRect && centerIsInsideRect(span, element.originalRect)
    ));
    if (existing) {
      startInlineEdit(existing.id);
      return;
    }
    const textElement: EditorElement = {
      type: 'text',
      id: createElementId('text'),
      pageIndex,
      text: line.text || span.text,
      xRatio: line.rect.x,
      yRatio: line.rect.y,
      widthRatio: line.rect.w,
      heightRatio: line.rect.h,
      fontSize: Math.max(6, line.representative.fontSizeRatio * stageSize.height),
      fontFamily: line.representative.fontFamilyHint || 'Roboto',
      color: '#000000',
      backgroundColor: '#ffffff',
      bold: /bold|black|heavy/iu.test(line.representative.fontName ?? ''),
      italic: /italic|oblique/iu.test(line.representative.fontName ?? ''),
      opacity: 1,
      textAlign: 'left',
      horizontalScaling: 1,
      ascentRatio: line.representative.ascentRatio,
      descentRatio: line.representative.descentRatio,
      sourceFontSizeRatio: line.representative.fontSizeRatio,
      originalRect: line.rect,
    };
    const next = [...elements, textElement];
    applyElements(next);
    startInlineEdit(textElement.id);
  }, [applyElements, elements, pageIndex, pageTextElements, spans, stageSize.height, startInlineEdit]);

  const createNewText = useCallback((xRatio: number, yRatio: number) => {
    const textElement: EditorElement = {
      type: 'text',
      id: createElementId('text'),
      pageIndex,
      text: 'Add text',
      xRatio,
      yRatio,
      widthRatio: 28,
      heightRatio: 3,
      fontSize: 18,
      fontFamily: 'Roboto',
      color: '#000000',
      backgroundColor: '#ffffff',
      bold: false,
      italic: false,
      opacity: 1,
      textAlign: 'left',
      horizontalScaling: 1,
    };
    const next = [...elements, textElement];
    applyElements(next);
    startInlineEdit(textElement.id);
  }, [applyElements, elements, pageIndex, startInlineEdit]);

  const handleStageMouseDown = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    if (event.button !== 0 || isEditableTarget(event.target)) {
      return;
    }
    if (event.target !== event.currentTarget && !(event.target instanceof HTMLImageElement)) {
      return;
    }
    const point = toStagePoint(event.clientX, event.clientY, event.currentTarget);
    setSelectedId(null);
    setEditingId(null);
    if (shapeTool) {
      setDrawing({
        tool: shapeTool,
        pageIndex,
        startXRatio: point.xRatio,
        startYRatio: point.yRatio,
        currentXRatio: point.xRatio,
        currentYRatio: point.yRatio,
      });
      return;
    }
    createNewText(point.xRatio, point.yRatio);
  }, [createNewText, pageIndex, shapeTool]);

  const handleStageMouseMove = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (drag) {
      const dx = ((event.clientX - drag.startClientX) / drag.stageWidth) * 100;
      const dy = ((event.clientY - drag.startClientY) / drag.stageHeight) * 100;
      setElements((current) => current.map((element) => {
        if (element.id !== drag.id || element.type !== 'text') {
          return element;
        }
        return {
          ...element,
          xRatio: clamp(drag.origXRatio + dx, 0, 100 - element.widthRatio),
          yRatio: clamp(drag.origYRatio + dy, 0, 100 - element.heightRatio),
        };
      }));
      return;
    }
    if (drawing) {
      const point = toStagePoint(event.clientX, event.clientY, event.currentTarget);
      setDrawing({ ...drawing, currentXRatio: point.xRatio, currentYRatio: point.yRatio });
    }
  }, [drawing]);

  const finishPointerAction = useCallback(() => {
    if (dragRef.current) {
      dragRef.current = null;
      pushHistory(elements);
    }
    if (drawing) {
      const left = Math.min(drawing.startXRatio, drawing.currentXRatio);
      const top = Math.min(drawing.startYRatio, drawing.currentYRatio);
      const width = Math.abs(drawing.currentXRatio - drawing.startXRatio);
      const height = Math.abs(drawing.currentYRatio - drawing.startYRatio);
      if (width >= 0.4 || height >= 0.4) {
        const nextElement: EditorElement = drawing.tool === 'line'
          ? {
            type: 'line',
            id: createElementId('line'),
            pageIndex: drawing.pageIndex,
            x1Ratio: drawing.startXRatio,
            y1Ratio: drawing.startYRatio,
            x2Ratio: drawing.currentXRatio,
            y2Ratio: drawing.currentYRatio,
            color: '#000000',
            strokeWidth: 2,
            opacity: 1,
          }
          : {
            type: drawing.tool,
            id: createElementId(drawing.tool),
            pageIndex: drawing.pageIndex,
            xRatio: left,
            yRatio: top,
            widthRatio: Math.max(width, 0.4),
            heightRatio: Math.max(height, 0.4),
            color: drawing.tool === 'whiteout' ? '#ffffff' : '#000000',
            strokeWidth: drawing.tool === 'whiteout' ? 0 : 2,
            opacity: 1,
          };
        const next = [...elements, nextElement];
        setSelectedId(nextElement.id);
        applyElements(next);
      }
      setDrawing(null);
    }
  }, [applyElements, drawing, elements, pushHistory]);

  const handleOverlayMouseDown = useCallback((event: ReactMouseEvent<HTMLDivElement>, element: EditorElement) => {
    if (event.button !== 0 || element.type !== 'text' || isEditableTarget(event.target)) {
      return;
    }
    const stage = stageRef.current;
    if (!stage) {
      return;
    }
    event.stopPropagation();
    const rect = stage.getBoundingClientRect();
    dragRef.current = {
      id: element.id,
      startClientX: event.clientX,
      startClientY: event.clientY,
      origXRatio: element.xRatio,
      origYRatio: element.yRatio,
      stageWidth: rect.width,
      stageHeight: rect.height,
    };
    setSelectedId(element.id);
    setEditingId(null);
  }, []);

  const handleFiles = useCallback(async (files: FileList | File[]) => {
    const picked = Array.from(files).filter((file) => file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf'));
    if (picked.length > 0) {
      await onPickFiles?.(picked);
    }
  }, [onPickFiles]);

  const handleFileInput = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      void handleFiles(event.target.files);
      event.target.value = '';
    }
  }, [handleFiles]);

  const handleDrop = useCallback((event: ReactDragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDraggingUpload(false);
    void handleFiles(event.dataTransfer.files);
  }, [handleFiles]);

  const save = useCallback(() => {
    commitInlineEdit();
    onStart({ elements: cloneElements(elements) });
  }, [commitInlineEdit, elements, onStart]);

  const updateSelectedText = useCallback((patch: Partial<Extract<EditorElement, { type: 'text' }>>) => {
    if (!selectedId) {
      return;
    }
    const next = elements.map((element) => (
      element.id === selectedId && element.type === 'text'
        ? { ...element, ...patch, backgroundColor: '#ffffff' }
        : element
    ));
    applyElements(next);
  }, [applyElements, elements, selectedId]);

  const renderShapePreview = drawing ? {
    left: Math.min(drawing.startXRatio, drawing.currentXRatio),
    top: Math.min(drawing.startYRatio, drawing.currentYRatio),
    width: Math.abs(drawing.currentXRatio - drawing.startXRatio),
    height: Math.abs(drawing.currentYRatio - drawing.startYRatio),
  } : null;

  return (
    <div className="tool-config-root pdf-editor-concept-root">
      <div className="ocr-concept-workspace">
        <section className="tool-config-card ocr-concept-left pdf-editor-left">
          <h3 className="pdf-editor-title">PDF Text Editor</h3>

          <div
            className={`ocr-concept-upload ${isDraggingUpload ? 'dragging' : ''}`}
            onDragOver={(event) => {
              event.preventDefault();
              setIsDraggingUpload(true);
            }}
            onDragLeave={() => setIsDraggingUpload(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <input ref={fileInputRef} type="file" accept="application/pdf,.pdf" multiple hidden onChange={handleFileInput} />
            <div className="ocr-concept-upload-icon">
              <LinearIcon name="upload" className="linear-icon icon-lg" />
            </div>
            <p className="ocr-concept-upload-title">{fileId ? 'Selected PDF' : 'Drop PDF here'}</p>
            <p className="ocr-concept-upload-copy">{fileNames[0] ?? 'Choose a local PDF file'}</p>
          </div>

          {inputFiles.length > 0 && (
            <div className="ocr-concept-file-chip">
              <span className="ocr-concept-file-name">{fileNames.join(', ')}</span>
              <button className="ocr-concept-clear-btn" type="button" onClick={() => void onClearFiles?.()}>
                <LinearIcon name="x" className="linear-icon" />
              </button>
            </div>
          )}

          <div className="ocr-concept-settings">
            <label className="pdf-editor-field">
              <span>Text</span>
              <textarea
                className="tool-config-input pdf-editor-textarea"
                disabled={!selectedElement || selectedElement.type !== 'text'}
                value={selectedElement?.type === 'text' ? selectedElement.text : ''}
                onChange={(event) => updateSelectedText({ text: event.target.value })}
              />
            </label>
            <div className="pdf-editor-color-row">
              <label className="pdf-editor-field">
                <span>Color</span>
                <input
                  className="tool-config-input"
                  type="color"
                  disabled={!selectedElement || selectedElement.type !== 'text'}
                  value={selectedElement?.type === 'text' ? selectedElement.color : '#000000'}
                  onChange={(event) => updateSelectedText({ color: event.target.value })}
                />
              </label>
              <label className="pdf-editor-field">
                <span>Size</span>
                <input
                  className="tool-config-input"
                  type="number"
                  min={6}
                  max={144}
                  disabled={!selectedElement || selectedElement.type !== 'text'}
                  value={selectedElement?.type === 'text' ? Math.round(selectedElement.fontSize) : 16}
                  onChange={(event) => updateSelectedText({ fontSize: clamp(Number(event.target.value), 6, 144) })}
                />
              </label>
            </div>
          </div>

          {error && <p className="pdf-editor-warning">{error}</p>}
          {currentStep === 'processing' && (
            <div className="ocr-concept-progress-track">
              <span style={{ width: `${clamp(progress, 0, 100)}%` }} />
            </div>
          )}
          {currentStep === 'result' && outputCount > 0 && (
            <p className="tool-config-copy">{outputCount} edited PDF ready.</p>
          )}

          <div className="tool-config-actions ocr-concept-actions">
            <button className="btn-ghost" type="button" onClick={onBack}>
              <span className="btn-inline"><LinearIcon name="chevron-left" className="linear-icon" />Back</span>
            </button>
            {currentStep === 'result' && outputCount > 0 ? (
              <button className="btn-primary" type="button" onClick={() => void onDownload?.()}>
                <span className="btn-inline"><LinearIcon name="download" className="linear-icon" />Download</span>
              </button>
            ) : (
              <button className="btn-primary" type="button" disabled={!fileId || currentStep === 'processing'} onClick={save}>
                <span className="btn-inline"><LinearIcon name="check" className="linear-icon" />Save PDF</span>
              </button>
            )}
          </div>
        </section>

        <section className="tool-config-card ocr-concept-right pdf-editor-right">
          <div className="ocr-concept-toolbar pdf-editor-toolbar">
            <div className="pdf-editor-pager">
              <button className="ocr-concept-tool-btn" type="button" disabled={pageNumber <= 1} onClick={() => setPageNumber((value) => Math.max(1, value - 1))}>
                <LinearIcon name="chevron-left" className="linear-icon" />
              </button>
              <span className="pdf-editor-page-copy">Page {pageNumber}/{pageCount}</span>
              <button className="ocr-concept-tool-btn" type="button" disabled={pageNumber >= pageCount} onClick={() => setPageNumber((value) => Math.min(pageCount, value + 1))}>
                <LinearIcon name="chevron-right" className="linear-icon" />
              </button>
            </div>
            <div className="pdf-editor-toolbar-right">
              <button className="ocr-concept-tool-btn" type="button" disabled={!canUndo} onClick={undo} title="Undo">
                <LinearIcon name="rotate" className="linear-icon" />
              </button>
              <button className="ocr-concept-tool-btn" type="button" disabled={!canRedo} onClick={redo} title="Redo">
                <LinearIcon name="refresh" className="linear-icon" />
              </button>
              {(['rect', 'circle', 'line', 'whiteout'] as ShapeTool[]).map((tool) => (
                <button
                  key={tool}
                  className={`ocr-concept-tool-btn ${shapeTool === tool ? 'pdf-editor-btn-active' : ''}`}
                  type="button"
                  onClick={() => setShapeTool((current) => (current === tool ? null : tool))}
                  title={tool}
                >
                  <LinearIcon name={tool === 'whiteout' ? 'eraser' : tool === 'line' ? 'minus' : 'shape'} className="linear-icon" />
                </button>
              ))}
              <button className="ocr-concept-tool-btn" type="button" onClick={() => setZoom((value) => clamp(value - 0.1, 0.5, 2.5))}>
                <LinearIcon name="minus" className="linear-icon" />
              </button>
              <span className="pdf-editor-zoom-copy">{Math.round(zoom * 100)}%</span>
              <button className="ocr-concept-tool-btn" type="button" onClick={() => setZoom((value) => clamp(value + 0.1, 0.5, 2.5))}>
                <LinearIcon name="plus" className="linear-icon" />
              </button>
            </div>
          </div>

          <div className="pdf-editor-preview-scroll">
            {!fileId ? (
              <div className="ocr-concept-empty">
                <p className="ocr-concept-empty-title">No PDF selected</p>
                <p className="ocr-concept-empty-copy">Upload a PDF to edit visible text locally.</p>
              </div>
            ) : (
              <div
                ref={stageRef}
                className={`pdf-editor-preview-stage ${shapeTool ? 'pdf-editor-preview-add' : ''}`}
                style={{ width: stageSize.width * zoom, minHeight: stageSize.height * zoom }}
                onMouseDown={handleStageMouseDown}
                onMouseMove={handleStageMouseMove}
                onMouseUp={finishPointerAction}
                onMouseLeave={finishPointerAction}
              >
                {previewUrl && (
                  <img
                    className="pdf-editor-preview-image"
                    src={previewUrl}
                    alt="PDF page preview"
                    draggable={false}
                    style={{ width: stageSize.width * zoom, height: stageSize.height * zoom }}
                    onLoad={(event) => {
                      const image = event.currentTarget;
                      if (image.naturalWidth > 0 && image.naturalHeight > 0) {
                        setStageSize({ width: image.naturalWidth, height: image.naturalHeight });
                      }
                    }}
                  />
                )}
                <div className="pdf-editor-text-layer">
                  {spans.map((span) => {
                    const hidden = pageTextElements.some((element) => element.originalRect && centerIsInsideRect(span, element.originalRect));
                    return (
                      <button
                        key={span.id}
                        className="pdf-editor-text-span"
                        type="button"
                        disabled={hidden}
                        onClick={(event) => {
                          event.stopPropagation();
                          createTextEditFromSpan(span);
                        }}
                        style={{
                          left: `${span.xRatio * 100}%`,
                          top: `${span.yRatio * 100}%`,
                          width: `${span.widthRatio * 100}%`,
                          height: `${span.heightRatio * 100}%`,
                          opacity: hidden ? 0 : 1,
                          pointerEvents: hidden ? 'none' : 'auto',
                          fontSize: `${Math.max(1, span.fontSizeRatio * stageSize.height * zoom)}px`,
                        }}
                        aria-label={`Edit text ${span.text}`}
                      />
                    );
                  })}
                </div>
                <div className="pdf-editor-shape-layer">
                  <svg viewBox="0 0 100 100" preserveAspectRatio="none">
                    {pageElements.map((element) => {
                      if (element.type === 'line') {
                        return <line key={element.id} x1={element.x1Ratio} y1={element.y1Ratio} x2={element.x2Ratio} y2={element.y2Ratio} stroke={element.color} strokeWidth={element.strokeWidth / 8} opacity={element.opacity} />;
                      }
                      if (element.type === 'text') {
                        return null;
                      }
                      const common = {
                        key: element.id,
                        stroke: element.type === 'whiteout' ? '#ffffff' : element.color,
                        strokeWidth: element.strokeWidth / 8,
                        opacity: element.opacity,
                        fill: element.type === 'whiteout' ? '#ffffff' : 'transparent',
                      };
                      return element.type === 'circle'
                        ? <ellipse {...common} cx={element.xRatio + element.widthRatio / 2} cy={element.yRatio + element.heightRatio / 2} rx={element.widthRatio / 2} ry={element.heightRatio / 2} />
                        : <rect {...common} x={element.xRatio} y={element.yRatio} width={element.widthRatio} height={element.heightRatio} />;
                    })}
                    {renderShapePreview && drawing && (
                      drawing.tool === 'line'
                        ? <line x1={drawing.startXRatio} y1={drawing.startYRatio} x2={drawing.currentXRatio} y2={drawing.currentYRatio} stroke="#2563eb" strokeWidth={0.25} />
                        : <rect x={renderShapePreview.left} y={renderShapePreview.top} width={renderShapePreview.width} height={renderShapePreview.height} fill={drawing.tool === 'whiteout' ? '#ffffff' : 'transparent'} stroke="#2563eb" strokeWidth={0.25} />
                    )}
                  </svg>
                </div>
                {pageTextElements.map((element) => {
                  const isSelected = selectedId === element.id;
                  const isEditing = editingId === element.id;
                  return (
                    <div
                      key={element.id}
                      className={`pdf-editor-overlay ${isSelected ? 'active' : ''}`}
                      onMouseDown={(event) => handleOverlayMouseDown(event, element)}
                      onDoubleClick={(event) => {
                        event.stopPropagation();
                        startInlineEdit(element.id);
                      }}
                      style={{
                        left: `${element.xRatio}%`,
                        top: `${element.yRatio}%`,
                        width: `${element.widthRatio}%`,
                        height: `${element.heightRatio}%`,
                        backgroundColor: '#ffffff',
                        color: element.color,
                        opacity: element.opacity,
                        fontFamily: element.fontFamily,
                        fontSize: `${element.fontSize * zoom}px`,
                        fontWeight: element.bold ? 700 : 400,
                        fontStyle: element.italic ? 'italic' : 'normal',
                        textAlign: element.textAlign,
                        cursor: isSelected ? 'grab' : 'pointer',
                        zIndex: isSelected ? 8 : 6,
                      }}
                    >
                      {isEditing ? (
                        <div
                          ref={editingRef}
                          className="pdf-editor-overlay-input"
                          contentEditable
                          suppressContentEditableWarning
                          onBlur={commitInlineEdit}
                          onKeyDown={(event) => {
                            if (event.key === 'Escape') {
                              event.preventDefault();
                              commitInlineEdit();
                            }
                          }}
                        >
                          {element.text}
                        </div>
                      ) : (
                        <span className="pdf-editor-overlay-text">{element.text}</span>
                      )}
                    </div>
                  );
                })}
                {loading && <div className="pdf-editor-preview-loading">Loading</div>}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
