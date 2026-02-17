import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePlatform } from '../../../app/react/platform-context';
import type { IWorkerCommand, WorkerPdfTextLayerSpan, WorkerStudioEditElement } from '../../../core/public/contracts';
import { extractEmbeddedPdfText } from '../../../services/pdf/pdf-text-extractor';
import { extractPdfTextLayerSpans } from '../../../services/pdf/pdf-text-layer-extractor';
import { defaultFilePreviewService } from '../../preview/preview-service';
import { useStudioStore, type PageItem, type StudioDocument, type StudioState } from './studio-store';
import { LinearIcon } from '../icons/linear-icon';
import {
  clamp,
  estimateInlineFontSizePt,
  findNearestTextSpan,
  mergeTextLine,
  resolveFontFamily,
  sanitizeInlineText,
  type FontFamilyId,
} from './inline-text-utils';
import { detectStudioEditLocale, getStudioEditMessages } from './studio-edit-i18n';

type TextLayerSpan = WorkerPdfTextLayerSpan;

type EditorToolId = 'text' | 'annotate' | 'whiteout' | 'shapes';
type TextAlignId = 'left' | 'center' | 'right';

interface SelectedPage {
  docId: string;
  docName: string;
  page: PageItem;
  indexInDoc: number;
}

interface TextElement {
  id: string;
  type: 'text';
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
  color: string;
  fontSize: number;
  fontFamily: FontFamilyId;
  fontWeight: 'normal' | 'bold';
  fontStyle: 'normal' | 'italic';
  textAlign: TextAlignId;
  opacity: number;
}

interface StrokeElement {
  id: string;
  type: 'stroke';
  points: number[];
  color: string;
  width: number;
  opacity: number;
}

interface RectElement {
  id: string;
  type: 'rect';
  x: number;
  y: number;
  w: number;
  h: number;
  fill: string;
  stroke: string;
  strokeWidth: number;
  opacity: number;
}

type EditElement = TextElement | StrokeElement | RectElement;

interface RectDraft {
  startX: number;
  startY: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

interface StrokeDraft {
  points: number[];
}

type DragSession =
  | {
    mode: 'move-text';
    id: string;
    startClientX: number;
    startClientY: number;
    originX: number;
    originY: number;
    initialElements: EditElement[];
  }
  | {
    mode: 'resize-text';
    id: string;
    startClientX: number;
    startClientY: number;
    originW: number;
    originH: number;
    initialElements: EditElement[];
  }
  | {
    mode: 'move-rect';
    id: string;
    startClientX: number;
    startClientY: number;
    originX: number;
    originY: number;
    initialElements: EditElement[];
  }
  | {
    mode: 'resize-rect';
    id: string;
    startClientX: number;
    startClientY: number;
    originW: number;
    originH: number;
    initialElements: EditElement[];
  }
  | {
    mode: 'move-stroke';
    id: string;
    startClientX: number;
    startClientY: number;
    initialPoints: number[];
    initialElements: EditElement[];
  }
  | {
    mode: 'resize-stroke';
    id: string;
    startClientX: number;
    startClientY: number;
    initialPoints: number[];
    bounds: { minX: number; minY: number; maxX: number; maxY: number };
    initialElements: EditElement[];
  };

interface TextEditorState {
  id: string;
  value: string;
  initialValue: string;
}

type InlineUiState = 'idle' | 'hover' | 'selected' | 'editing' | 'saving' | 'saved' | 'error';

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

async function requestTextLayerSpans(
  runtime: ReturnType<typeof usePlatform>['runtime'],
  fileId: string,
  pageNumber: number,
  signal?: AbortSignal,
): Promise<TextLayerSpan[]> {
  const command: IWorkerCommand = {
    id: crypto.randomUUID(),
    type: 'COMMAND',
    payload: {
      type: 'GET_PDF_TEXT_LAYER',
      payload: { fileId, pageNumber },
    },
  };
  const finalEvent = await runtime.workerOrchestrator.dispatch(command, undefined, signal);
  if (finalEvent.payload.type === 'TEXT_LAYER_RESULT') {
    return finalEvent.payload.payload.spans;
  }
  if (finalEvent.payload.type === 'ERROR') {
    const error = new Error(finalEvent.payload.payload.message) as Error & { code?: string };
    error.code = finalEvent.payload.payload.code;
    throw error;
  }
  throw new Error('Unexpected worker response for text layer request');
}

async function requestTextLayerSpansFallback(
  runtime: ReturnType<typeof usePlatform>['runtime'],
  fileId: string,
  pageNumber: number,
): Promise<TextLayerSpan[]> {
  const fallbackSpan = (text: string): TextLayerSpan => ({
    id: `fallback-span-${fileId}-${pageNumber}`,
    text,
    xRatio: 0.08,
    yRatio: 0.12,
    widthRatio: 0.84,
    heightRatio: 0.06,
    fontSizeRatio: 0.018,
    pageHeightPt: 842,
  });
  const containsTextOperators = (data: Uint8Array): boolean => {
    if (data.byteLength === 0) {
      return false;
    }
    const sample = new TextDecoder('latin1').decode(data.slice(0, 240_000));
    return /\bBT\b/u.test(sample) && /\b(Tj|TJ)\b/u.test(sample);
  };
  const tryInflateDeflate = async (raw: Uint8Array): Promise<Uint8Array | null> => {
    if (typeof DecompressionStream === 'undefined' || raw.byteLength === 0) {
      return null;
    }
    for (const format of ['deflate', 'deflate-raw'] as const) {
      try {
        const stream = new DecompressionStream(format);
        const writer = stream.writable.getWriter();
        await writer.write(new Uint8Array(raw));
        await writer.close();
        const inflated = await new Response(stream.readable).arrayBuffer();
        return new Uint8Array(inflated);
      } catch {
        // Try next format.
      }
    }
    return null;
  };
  const detectTextOperatorsWithPdfLib = async (data: Uint8Array): Promise<boolean> => {
    try {
      const { PDFDocument, PDFName } = await import('pdf-lib');
      const doc = await PDFDocument.load(data);
      const page = doc.getPage(Math.max(0, pageNumber - 1));
      const contentsRef = page.node.get(PDFName.of('Contents'));
      if (!contentsRef) {
        return false;
      }
      const resolved = doc.context.lookup(contentsRef as any) as any;
      const streams: any[] = [];
      if (resolved && typeof resolved.size === 'function' && typeof resolved.get === 'function') {
        const count = Number(resolved.size());
        for (let i = 0; i < count; i += 1) {
          streams.push(doc.context.lookup(resolved.get(i)));
        }
      } else {
        streams.push(resolved);
      }
      for (const stream of streams) {
        if (!stream || typeof stream.getContents !== 'function') {
          continue;
        }
        const raw = stream.getContents() as Uint8Array;
        if (containsTextOperators(raw)) {
          return true;
        }
        const inflated = await tryInflateDeflate(raw);
        if (inflated && containsTextOperators(inflated)) {
          return true;
        }
      }
      return false;
    } catch {
      return false;
    }
  };

  const entry = await runtime.vfs.read(fileId);
  const blob = await entry.getBlob();
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const directSpans = await extractPdfTextLayerSpans(bytes, pageNumber);
  if (directSpans.length > 0) {
    return directSpans;
  }
  const embeddedText = await extractEmbeddedPdfText(blob);
  const fallbackText = embeddedText?.text?.replace(/\s+/gu, ' ').trim() ?? '';
  if (!fallbackText) {
    if (await detectTextOperatorsWithPdfLib(bytes)) {
      return [fallbackSpan('Editable text')];
    }
    return [];
  }
  return [fallbackSpan(fallbackText.slice(0, 240))];
}

function isTextElement(element: EditElement | null | undefined): element is TextElement {
  return Boolean(element && element.type === 'text');
}

function buildSelectedPages(
  documents: StudioDocument[],
  selection: Array<{ docId: string; pageId: string }>,
): SelectedPage[] {
  const out: SelectedPage[] = [];
  for (const selected of selection) {
    const doc = documents.find((item) => item.id === selected.docId);
    if (!doc) {
      continue;
    }
    const indexInDoc = doc.pages.findIndex((page) => page.id === selected.pageId);
    if (indexInDoc < 0) {
      continue;
    }
    out.push({
      docId: doc.id,
      docName: doc.name,
      page: doc.pages[indexInDoc],
      indexInDoc,
    });
  }
  return out;
}

function toWorldPointByRect(event: React.PointerEvent<HTMLElement>, rect: DOMRect): { x: number; y: number } {
  const x = clamp01((event.clientX - rect.left) / rect.width);
  const y = clamp01((event.clientY - rect.top) / rect.height);
  return { x, y };
}

function getStrokeBounds(points: number[]): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = 1;
  let minY = 1;
  let maxX = 0;
  let maxY = 0;
  for (let i = 0; i < points.length; i += 2) {
    const x = points[i] ?? 0;
    const y = points[i + 1] ?? 0;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return { minX, minY, maxX, maxY };
}

function moveStrokePoints(points: number[], dx: number, dy: number): number[] {
  const out = [...points];
  for (let i = 0; i < out.length; i += 2) {
    out[i] = clamp01((out[i] ?? 0) + dx);
    out[i + 1] = clamp01((out[i + 1] ?? 0) + dy);
  }
  return out;
}

function resizeStrokePoints(
  points: number[],
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
  scaleX: number,
  scaleY: number,
): number[] {
  const width = Math.max(0.0001, bounds.maxX - bounds.minX);
  const height = Math.max(0.0001, bounds.maxY - bounds.minY);
  const out = [...points];
  for (let i = 0; i < out.length; i += 2) {
    const x = out[i] ?? 0;
    const y = out[i + 1] ?? 0;
    const nx = bounds.minX + ((x - bounds.minX) / width) * (width * scaleX);
    const ny = bounds.minY + ((y - bounds.minY) / height) * (height * scaleY);
    out[i] = clamp01(nx);
    out[i + 1] = clamp01(ny);
  }
  return out;
}

interface StudioFloatingMenuProps {
  element: EditElement;
  onUpdate: (patch: Partial<EditElement>) => void;
  onDelete: () => void;
  onDuplicate: () => void;
}

function StudioFloatingMenu({ element, onUpdate, onDelete, onDuplicate }: StudioFloatingMenuProps) {
  if (element.type !== 'text') {
    return (
      <div className="studio-floating-menu non-text">
        <button type="button" className="studio-floating-btn" onClick={onDuplicate} title="Duplicate">
          <LinearIcon name="word" />
        </button>
        <button type="button" className="studio-floating-btn delete" onClick={onDelete} title="Delete">
          <LinearIcon name="x" />
        </button>
      </div>
    );
  }

  const textElem = element as TextElement;

  return (
    <div className="studio-floating-menu">
      <div className="studio-floating-group">
        <button
          type="button"
          className={`studio-floating-btn ${textElem.fontWeight === 'bold' ? 'active' : ''}`}
          onClick={() => onUpdate({ fontWeight: textElem.fontWeight === 'bold' ? 'normal' : 'bold' })}
          title="Bold"
        >
          <span className="font-icon-b">B</span>
        </button>
        <button
          type="button"
          className={`studio-floating-btn ${textElem.fontStyle === 'italic' ? 'active' : ''}`}
          onClick={() => onUpdate({ fontStyle: textElem.fontStyle === 'italic' ? 'normal' : 'italic' })}
          title="Italic"
        >
          <span className="font-icon-i">I</span>
        </button>
      </div>

      <div className="studio-floating-divider" />

      <div className="studio-floating-group">
        <select
          className="studio-floating-select font-family"
          value={textElem.fontFamily}
          onChange={(e) => onUpdate({ fontFamily: e.target.value as FontFamilyId })}
        >
          <option value="sora">Sora</option>
          <option value="times">Times</option>
          <option value="mono">Mono</option>
        </select>
        <input
          type="number"
          className="studio-floating-input font-size"
          value={textElem.fontSize}
          min={8}
          max={96}
          onChange={(e) => onUpdate({ fontSize: clamp(Number(e.target.value) || 16, 8, 96) })}
        />
      </div>

      <div className="studio-floating-divider" />

      <div className="studio-floating-group">
        <input
          type="color"
          className="studio-floating-color"
          value={textElem.color}
          onChange={(e) => onUpdate({ color: e.target.value })}
        />
        <select
          className="studio-floating-select"
          value={textElem.textAlign}
          onChange={(e) => onUpdate({ textAlign: e.target.value as TextAlignId })}
        >
          <option value="left">Left</option>
          <option value="center">Center</option>
          <option value="right">Right</option>
        </select>
      </div>

      <div className="studio-floating-divider" />

      <div className="studio-floating-group">
        <button type="button" className="studio-floating-btn" onClick={onDuplicate} title="Duplicate">
          <LinearIcon name="word" />
        </button>
        <button type="button" className="studio-floating-btn delete" onClick={onDelete} title="Delete">
          <LinearIcon name="x" />
        </button>
      </div>
    </div>
  );
}

export function StudioEditWorkspace() {
  const navigate = useNavigate();
  const { runtime } = usePlatform();
  const documents = useStudioStore((s: StudioState) => s.documents);
  const selection = useStudioStore((s: StudioState) => s.selection);
  const activeDocumentId = useStudioStore((s: StudioState) => s.activeDocumentId);
  const updatePage = useStudioStore((s: StudioState) => s.updatePage);

  const canvasRef = useRef<HTMLDivElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const dragSessionRef = useRef<DragSession | null>(null);

  const [tool, setTool] = useState<EditorToolId>('text');
  const [elements, setElements] = useState<EditElement[]>([]);
  const [history, setHistory] = useState<EditElement[][]>([[]]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [draftRect, setDraftRect] = useState<RectDraft | null>(null);
  const [draftStroke, setDraftStroke] = useState<StrokeDraft | null>(null);
  const [isPointerDown, setIsPointerDown] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isApplying, setIsApplying] = useState(false);
  const [textEditor, setTextEditor] = useState<TextEditorState | null>(null);
  const [textLayerSpans, setTextLayerSpans] = useState<TextLayerSpan[]>([]);
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [applyToSelection, setApplyToSelection] = useState(true);
  const [inlineUiState, setInlineUiState] = useState<InlineUiState>('idle');
  const [hoveredTextSpanId, setHoveredTextSpanId] = useState<string | null>(null);

  const locale = useMemo(() => detectStudioEditLocale(), []);
  const ui = useMemo(() => getStudioEditMessages(locale), [locale]);

  const selectedPages = useMemo(() => buildSelectedPages(documents, selection), [documents, selection]);
  const activeDocument = useMemo(
    () => documents.find((doc: StudioDocument) => doc.id === activeDocumentId) ?? null,
    [activeDocumentId, documents],
  );

  const preview = selectedPages[0] ?? (activeDocument && activeDocument.pages[0]
    ? {
      docId: activeDocument.id,
      docName: activeDocument.name,
      page: activeDocument.pages[0],
      indexInDoc: 0,
    }
    : null);
  const canApplyToSelection = selectedPages.length > 1;

  useEffect(() => {
    if (!canApplyToSelection && applyToSelection) {
      setApplyToSelection(false);
      return;
    }
    if (canApplyToSelection && !applyToSelection) {
      setApplyToSelection(true);
    }
  }, [applyToSelection, canApplyToSelection]);

  const selectedElement = useMemo(
    () => elements.find((element) => element.id === selectedElementId) ?? null,
    [elements, selectedElementId],
  );
  const selectedText = isTextElement(selectedElement) ? selectedElement : null;
  const selectedStroke = selectedElement?.type === 'stroke' ? selectedElement : null;
  const selectedStrokeBounds = useMemo(
    () => (selectedStroke ? getStrokeBounds(selectedStroke.points) : null),
    [selectedStroke],
  );
  const hasDirtyChanges = historyIndex > 0 || Boolean(textEditor && textEditor.value !== textEditor.initialValue);
  const uiStateLabel = inlineUiState === 'idle'
    ? ui.statusIdle
    : inlineUiState === 'hover'
      ? ui.statusHover
      : inlineUiState === 'selected'
        ? ui.statusSelected
        : inlineUiState === 'editing'
          ? ui.statusEditing
          : inlineUiState === 'saving'
            ? ui.statusSaving
            : inlineUiState === 'saved'
              ? ui.statusSaved
              : ui.statusError;

  const resolveCanvasRect = useCallback((): DOMRect | null => {
    if (imageRef.current) {
      return imageRef.current.getBoundingClientRect();
    }
    if (canvasRef.current) {
      return canvasRef.current.getBoundingClientRect();
    }
    return null;
  }, []);

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasDirtyChanges) {
        return;
      }
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [hasDirtyChanges]);

  useEffect(() => {
    setElements([]);
    setHistory([[]]);
    setHistoryIndex(0);
    setSelectedElementId(null);
    setDraftRect(null);
    setDraftStroke(null);
    setTextEditor(null);
    setTextLayerSpans([]);
    setInlineUiState('idle');
    setHoveredTextSpanId(null);

    if (!preview) {
      return;
    }
    const abortController = new AbortController();
    void (async () => {
      try {
        const workerSpans = await requestTextLayerSpans(
          runtime,
          preview.page.fileId,
          preview.page.pageIndex + 1,
          abortController.signal,
        );
        if (abortController.signal.aborted) {
          return;
        }
        const spans = workerSpans.length > 0
          ? workerSpans
          : await requestTextLayerSpansFallback(runtime, preview.page.fileId, preview.page.pageIndex + 1);
        if (abortController.signal.aborted) {
          return;
        }
        setTextLayerSpans(spans);
        if (spans.length === 0) {
          setMessage(ui.noTextLayer);
        }
      } catch (error) {
        if (abortController.signal.aborted) {
          return;
        }
        console.error('Failed to load text layer from worker:', error);
        try {
          const fallbackSpans = await requestTextLayerSpansFallback(
            runtime,
            preview.page.fileId,
            preview.page.pageIndex + 1,
          );
          if (abortController.signal.aborted) {
            return;
          }
          setTextLayerSpans(fallbackSpans);
          if (fallbackSpans.length === 0) {
            setMessage(ui.noTextLayer);
          }
        } catch (fallbackError) {
          if (abortController.signal.aborted) {
            return;
          }
          console.error('Failed to load text layer fallback:', fallbackError);
          setMessage(ui.noTextLayer);
        }
      }
    })();
    return () => {
      abortController.abort();
    };
  }, [preview?.page.id, preview?.page.pageIndex, runtime, ui.noTextLayer]);

  const pushHistory = useCallback((next: EditElement[]) => {
    setHistory((prev) => {
      const trimmed = prev.slice(0, historyIndex + 1);
      return [...trimmed, next];
    });
    setHistoryIndex((prev) => prev + 1);
  }, [historyIndex]);

  const applyElements = useCallback((next: EditElement[], shouldPushHistory = true) => {
    setElements(next);
    if (shouldPushHistory) {
      pushHistory(next);
    }
  }, [pushHistory]);

  const updateSelectedText = useCallback((patch: Partial<TextElement>, shouldPushHistory = true) => {
    if (!selectedText) {
      return;
    }
    const next = elements.map((item) => {
      if (item.id !== selectedText.id || item.type !== 'text') {
        return item;
      }
      return { ...item, ...patch };
    });
    applyElements(next, shouldPushHistory);
  }, [applyElements, elements, selectedText]);

  const undo = useCallback(() => {
    if (historyIndex <= 0) {
      return;
    }
    const nextIndex = historyIndex - 1;
    setHistoryIndex(nextIndex);
    setElements(history[nextIndex] ?? []);
    setSelectedElementId(null);
    setTextEditor(null);
  }, [history, historyIndex]);

  const redo = useCallback(() => {
    if (historyIndex >= history.length - 1) {
      return;
    }
    const nextIndex = historyIndex + 1;
    setHistoryIndex(nextIndex);
    setElements(history[nextIndex] ?? []);
    setSelectedElementId(null);
    setTextEditor(null);
  }, [history, historyIndex]);

  const deleteSelected = useCallback(() => {
    if (!selectedElementId) {
      return;
    }
    const next = elements.filter((item) => item.id !== selectedElementId);
    applyElements(next);
    setSelectedElementId(null);
    setTextEditor(null);
  }, [applyElements, elements, selectedElementId]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.key === 'Delete' || event.key === 'Backspace') && !textEditor) {
        deleteSelected();
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) {
          redo();
        } else {
          undo();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [deleteSelected, redo, textEditor, undo]);

  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      const session = dragSessionRef.current;
      if (!session || !canvasRef.current) {
        return;
      }
      const rect = canvasRef.current.getBoundingClientRect();
      const dx = (event.clientX - session.startClientX) / rect.width;
      const dy = (event.clientY - session.startClientY) / rect.height;

      if (session.mode === 'move-text') {
        setElements((prev) => prev.map((item) => {
          if (item.id !== session.id || item.type !== 'text') {
            return item;
          }
          return {
            ...item,
            x: clamp01(session.originX + dx),
            y: clamp01(session.originY + dy),
          };
        }));
      }

      if (session.mode === 'resize-text') {
        setElements((prev) => prev.map((item) => {
          if (item.id !== session.id || item.type !== 'text') {
            return item;
          }
          return {
            ...item,
            w: clamp(session.originW + dx, 0.05, 0.9),
            h: clamp(session.originH + dy, 0.03, 0.6),
          };
        }));
      }

      if (session.mode === 'move-rect') {
        setElements((prev) => prev.map((item) => {
          if (item.id !== session.id || item.type !== 'rect') {
            return item;
          }
          return {
            ...item,
            x: clamp01(session.originX + dx),
            y: clamp01(session.originY + dy),
          };
        }));
      }

      if (session.mode === 'resize-rect') {
        setElements((prev) => prev.map((item) => {
          if (item.id !== session.id || item.type !== 'rect') {
            return item;
          }
          return {
            ...item,
            w: clamp(session.originW + dx, 0.01, 0.95),
            h: clamp(session.originH + dy, 0.01, 0.95),
          };
        }));
      }

      if (session.mode === 'move-stroke') {
        setElements((prev) => prev.map((item) => {
          if (item.id !== session.id || item.type !== 'stroke') {
            return item;
          }
          return {
            ...item,
            points: moveStrokePoints(session.initialPoints, dx, dy),
          };
        }));
      }

      if (session.mode === 'resize-stroke') {
        setElements((prev) => prev.map((item) => {
          if (item.id !== session.id || item.type !== 'stroke') {
            return item;
          }
          const boundsWidth = Math.max(0.01, session.bounds.maxX - session.bounds.minX);
          const boundsHeight = Math.max(0.01, session.bounds.maxY - session.bounds.minY);
          const scaleX = clamp((boundsWidth + dx) / boundsWidth, 0.1, 8);
          const scaleY = clamp((boundsHeight + dy) / boundsHeight, 0.1, 8);
          return {
            ...item,
            points: resizeStrokePoints(session.initialPoints, session.bounds, scaleX, scaleY),
          };
        }));
      }
    };

    const onPointerUp = () => {
      const session = dragSessionRef.current;
      if (!session) {
        return;
      }
      dragSessionRef.current = null;
      setElements((current) => {
        const changed = JSON.stringify(current) !== JSON.stringify(session.initialElements);
        if (changed) {
          pushHistory(current);
        }
        return current;
      });
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, [pushHistory]);

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const workRect = resolveCanvasRect();
    if (!workRect) {
      return;
    }
    setMessage(null);
    const point = toWorldPointByRect(event, workRect);
    setIsPointerDown(true);

    if (tool === 'text') {
      if (textEditor) {
        commitTextEditor();
      }

      if (isSelectMode) {
        if (textLayerSpans.length === 0) {
          setInlineUiState('error');
          setMessage(ui.noTextLayer);
          return;
        }

        const clickedSpan = findNearestTextSpan(point, textLayerSpans);
        if (!clickedSpan) {
          setInlineUiState('idle');
          return;
        }

        const mergedLine = mergeTextLine(textLayerSpans, clickedSpan);
        if (!mergedLine) {
          setInlineUiState('idle');
          return;
        }

        const { left, top, width, height } = mergedLine;
        const existing = elements.find((el) => (
          el.type === 'text'
          && Math.abs(el.x - left) < 0.005
          && Math.abs(el.y - top) < 0.005
        ));

        if (existing) {
          setSelectedElementId(existing.id);
          setInlineUiState('selected');
          startEditingText(existing as TextElement);
          return;
        }

        const leftPad = Math.max(0.0015, width * 0.01);
        const topPad = Math.max(0.002, height * 0.18);
        const bottomPad = Math.max(0.004, height * 0.38);
        const whiteoutLeft = clamp01(left - leftPad);
        const whiteoutTop = clamp01(top - topPad);
        const whiteoutRight = clamp01(left + width + leftPad);
        const whiteoutBottom = clamp01(top + height + bottomPad);

        const whiteout: RectElement = {
          id: crypto.randomUUID(),
          type: 'rect',
          x: whiteoutLeft,
          y: whiteoutTop,
          w: Math.max(0.001, whiteoutRight - whiteoutLeft),
          h: Math.max(0.001, whiteoutBottom - whiteoutTop),
          fill: '#ffffff',
          stroke: 'transparent',
          strokeWidth: 0,
          opacity: 1,
        };

        const fontFamily = resolveFontFamily(mergedLine.fontName, mergedLine.fontFamilyHint);
        const next: TextElement = {
          id: crypto.randomUUID(),
          type: 'text',
          x: left,
          y: top - 0.0005,
          w: width + 0.02,
          h: height + 0.005,
          text: mergedLine.text,
          color: '#000000',
          fontSize: estimateInlineFontSizePt(mergedLine.fontSizeRatio, mergedLine.pageHeightPt ?? 842),
          fontFamily,
          fontWeight: 'normal',
          fontStyle: 'normal',
          textAlign: 'left',
          opacity: 1,
        };

        applyElements([...elements, whiteout, next]);
        setSelectedElementId(next.id);
        setInlineUiState('selected');
        startEditingText(next);
        return;
      }

      const next: TextElement = {
        id: crypto.randomUUID(),
        type: 'text',
        x: point.x,
        y: point.y,
        w: 0.22,
        h: 0.06,
        text: ui.text,
        color: '#0f172a',
        fontSize: 18,
        fontFamily: 'sora',
        fontWeight: 'normal',
        fontStyle: 'normal',
        textAlign: 'left',
        opacity: 1,
      };
      applyElements([...elements, next]);
      setSelectedElementId(next.id);
      setInlineUiState('editing');
      setTextEditor({ id: next.id, value: next.text, initialValue: next.text });
      return;
    }

    if (tool === 'annotate') {
      setDraftStroke({ points: [point.x, point.y] });
      return;
    }

    setDraftRect({
      startX: point.x,
      startY: point.y,
      x: point.x,
      y: point.y,
      w: 0,
      h: 0,
    });
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const workRect = resolveCanvasRect();
    if (!isPointerDown || !workRect) {
      return;
    }
    const point = toWorldPointByRect(event, workRect);

    if (draftStroke) {
      setDraftStroke((prev) => {
        if (!prev) {
          return prev;
        }
        return { points: [...prev.points, point.x, point.y] };
      });
      return;
    }

    if (draftRect) {
      const x = Math.min(draftRect.startX, point.x);
      const y = Math.min(draftRect.startY, point.y);
      const w = Math.abs(point.x - draftRect.startX);
      const h = Math.abs(point.y - draftRect.startY);
      setDraftRect({ ...draftRect, x, y, w, h });
    }
  };

  const onPointerUp = () => {
    setIsPointerDown(false);

    if (draftStroke) {
      if (draftStroke.points.length >= 4) {
        const stroke: StrokeElement = {
          id: crypto.randomUUID(),
          type: 'stroke',
          points: draftStroke.points,
          color: '#2563eb',
          width: 2,
          opacity: 1,
        };
        applyElements([...elements, stroke]);
      }
      setDraftStroke(null);
      return;
    }

    if (draftRect && draftRect.w > 0.002 && draftRect.h > 0.002) {
      const rect: RectElement = {
        id: crypto.randomUUID(),
        type: 'rect',
        x: draftRect.x,
        y: draftRect.y,
        w: draftRect.w,
        h: draftRect.h,
        fill: tool === 'whiteout' ? '#ffffff' : 'transparent',
        stroke: tool === 'whiteout' ? '#d1d5db' : '#2563eb',
        strokeWidth: tool === 'whiteout' ? 1 : 2,
        opacity: 1,
      };
      applyElements([...elements, rect]);
    }
    setDraftRect(null);
  };

  const handleTextPointerDown = (event: React.PointerEvent<Element>, element: TextElement) => {
    event.stopPropagation();
    const target = event.target as HTMLElement | null;
    if (target?.closest('.studio-floating-menu') || target?.closest('.studio-edit-text-resize')) {
      return;
    }
    if (tool === 'text') {
      setSelectedElementId(element.id);
      setInlineUiState('selected');
      return;
    }

    if (textEditor?.id === element.id) {
      commitTextEditor();
    }

    setSelectedElementId(element.id);
    dragSessionRef.current = {
      mode: 'move-text',
      id: element.id,
      startClientX: event.clientX,
      startClientY: event.clientY,
      originX: element.x,
      originY: element.y,
      initialElements: elements,
    };
  };

  const handleTextPointerUp = (event: React.PointerEvent<Element>, element: TextElement) => {
    event.stopPropagation();
    const target = event.target as HTMLElement | null;
    if (target?.closest('.studio-floating-menu') || target?.closest('.studio-edit-text-resize')) {
      return;
    }
    if (tool !== 'text') {
      return;
    }
    if (target && target.tagName === 'TEXTAREA') {
      return;
    }
    if (textEditor?.id !== element.id && textEditor) {
      commitTextEditor();
    }
    setInlineUiState('editing');
    startEditingText(element);
  };

  const beginResizeText = (event: React.PointerEvent<Element>, element: TextElement) => {
    event.stopPropagation();
    if (textEditor?.id === element.id) {
      commitTextEditor();
    }
    setSelectedElementId(element.id);
    dragSessionRef.current = {
      mode: 'resize-text',
      id: element.id,
      startClientX: event.clientX,
      startClientY: event.clientY,
      originW: element.w,
      originH: element.h,
      initialElements: elements,
    };
  };

  const beginMoveRect = (event: React.PointerEvent<Element>, element: RectElement) => {
    event.stopPropagation();
    if (textEditor) {
      commitTextEditor();
    }
    setSelectedElementId(element.id);
    dragSessionRef.current = {
      mode: 'move-rect',
      id: element.id,
      startClientX: event.clientX,
      startClientY: event.clientY,
      originX: element.x,
      originY: element.y,
      initialElements: elements,
    };
  };

  const beginResizeRect = (event: React.PointerEvent<Element>, element: RectElement) => {
    event.stopPropagation();
    if (textEditor) {
      commitTextEditor();
    }
    setSelectedElementId(element.id);
    dragSessionRef.current = {
      mode: 'resize-rect',
      id: element.id,
      startClientX: event.clientX,
      startClientY: event.clientY,
      originW: element.w,
      originH: element.h,
      initialElements: elements,
    };
  };

  const beginMoveStroke = (event: React.PointerEvent<Element>, element: StrokeElement) => {
    event.stopPropagation();
    if (textEditor) {
      commitTextEditor();
    }
    setSelectedElementId(element.id);
    dragSessionRef.current = {
      mode: 'move-stroke',
      id: element.id,
      startClientX: event.clientX,
      startClientY: event.clientY,
      initialPoints: [...element.points],
      initialElements: elements,
    };
  };

  const beginResizeStroke = (event: React.PointerEvent<Element>, element: StrokeElement) => {
    event.stopPropagation();
    const bounds = getStrokeBounds(element.points);
    if (textEditor) {
      commitTextEditor();
    }
    setSelectedElementId(element.id);
    dragSessionRef.current = {
      mode: 'resize-stroke',
      id: element.id,
      startClientX: event.clientX,
      startClientY: event.clientY,
      initialPoints: [...element.points],
      bounds,
      initialElements: elements,
    };
  };

  const startEditingText = (element: TextElement) => {
    setSelectedElementId(element.id);
    setInlineUiState('editing');
    setTextEditor({ id: element.id, value: element.text, initialValue: element.text });
  };

  const commitTextEditor = useCallback(() => {
    if (!textEditor) {
      return;
    }
    if (textEditor.value !== textEditor.initialValue) {
      pushHistory(elements);
    }
    setInlineUiState(selectedElementId ? 'selected' : 'idle');
    setTextEditor(null);
  }, [elements, pushHistory, selectedElementId, textEditor]);

  const handleTextEditorChange = useCallback((id: string, value: string) => {
    const normalizedValue = sanitizeInlineText(value);
    setTextEditor((prev) => (prev && prev.id === id ? { ...prev, value: normalizedValue } : prev));
    setElements((prev) => prev.map((item) => {
      if (item.id !== id || item.type !== 'text') {
        return item;
      }
      return { ...item, text: normalizedValue };
    }));
  }, []);

  const applyChanges = async () => {
    if (!preview) {
      return;
    }

    setIsApplying(true);
    setInlineUiState('saving');
    setMessage(null);
    const runId = crypto.randomUUID();
    try {
      const targets = applyToSelection && canApplyToSelection ? selectedPages : [preview];
      let overflowCount = 0;
      let failureCount = 0;
      const failureDetails: string[] = [];

      for (const target of targets) {
        try {
          const command: IWorkerCommand = {
            id: crypto.randomUUID(),
            type: 'COMMAND',
            payload: {
              type: 'APPLY_STUDIO_TEXT_EDITS',
              payload: {
                fileId: target.page.fileId,
                pageIndex: target.page.pageIndex,
                elements: elements as WorkerStudioEditElement[],
              },
            },
          };
          const finalEvent = await runtime.workerOrchestrator.dispatch(command);
          if (finalEvent.payload.type === 'ERROR') {
            const error = new Error(finalEvent.payload.payload.message) as Error & { code?: string };
            error.code = finalEvent.payload.payload.code;
            throw error;
          }
          if (finalEvent.payload.type !== 'STUDIO_TEXT_EDITS_APPLIED') {
            throw new Error('Unexpected worker response for studio text edits');
          }
          if (finalEvent.payload.payload.overflowDetected) {
            overflowCount += 1;
          }
          const previewData = await defaultFilePreviewService.getPdfPagePreview(
            runtime,
            finalEvent.payload.payload.outputId,
            target.page.pageIndex + 1,
            { scale: 2 },
          );
          updatePage(target.docId, target.page.id, {
            fileId: finalEvent.payload.payload.outputId,
            pageIndex: target.page.pageIndex,
            thumbnailUrl: previewData.thumbnailUrl ?? target.page.thumbnailUrl,
          });
        } catch (targetError) {
          failureCount += 1;
          const details = targetError instanceof Error ? targetError.message : ui.saveFailed;
          const typed = targetError as { code?: unknown; message?: unknown };
          const code = typeof typed.code === 'string' ? typed.code : undefined;
          if (code?.startsWith('STUDIO_EDIT_')) {
            runtime.telemetry.track({
              type: 'STUDIO_EDIT_GUARDRAIL',
              runId,
              toolId: 'studio.edit.text',
              fileId: target.page.fileId,
              pageIndex: target.page.pageIndex,
              code,
              message: typeof typed.message === 'string' ? typed.message : details,
            });
          }
          failureDetails.push(details);
        }
      }

      if (failureCount > 0 && failureCount === targets.length) {
        throw new Error(failureDetails[0] ?? ui.saveFailed);
      }

      setInlineUiState(failureCount > 0 ? 'error' : 'saved');
      setTextEditor(null);
      setSelectedElementId(null);
      setHistory([elements]);
      setHistoryIndex(0);

      if (targets.length > 1) {
        const baseMessage = `${ui.changesAppliedSelection} ${targets.length}`;
        const overflowMessage = overflowCount > 0 ? ` ${ui.overflowWarning}` : '';
        const partialMessage = failureCount > 0 ? ` ${ui.partialSaveFailed}` : '';
        setMessage(`${baseMessage}.${overflowMessage}${partialMessage}`.trim());
      } else {
        setMessage(overflowCount > 0 ? `${ui.changesApplied} ${ui.overflowWarning}` : ui.changesApplied);
      }
    } catch (error) {
      setInlineUiState('error');
      const details = error instanceof Error ? error.message : ui.saveFailed;
      const typed = error as { code?: unknown; message?: unknown };
      const code = typeof typed.code === 'string' ? typed.code : undefined;
      if (code?.startsWith('STUDIO_EDIT_')) {
        runtime.telemetry.track({
          type: 'STUDIO_EDIT_GUARDRAIL',
          runId,
          toolId: 'studio.edit.text',
          fileId: preview.page.fileId,
          pageIndex: preview.page.pageIndex,
          code,
          message: typeof typed.message === 'string' ? typed.message : details,
        });
      }
      setMessage(`${ui.saveFailed}${details ? ` ${details}` : ''}`.trim());
    } finally {
      setIsApplying(false);
    }
  };

  if (!preview) {
    return (
      <section className="studio-edit-shell">
        <div className="studio-edit-empty">
          <h2 className="studio-edit-empty-title">{ui.selectPageTitle}</h2>
          <button type="button" className="studio-edit-back-btn" onClick={() => navigate('/studio')}>
            {ui.backToCanvas}
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="studio-edit-shell">
      <header className="studio-edit-toolbar" aria-label="Edit tools">
        <button
          type="button"
          className={`studio-edit-tool-btn ${tool === 'text' ? 'active' : ''} ${isSelectMode ? 'select-mode' : ''}`}
          onClick={() => {
            setTool('text');
            if (tool === 'text') {
              const next = !isSelectMode;
              setIsSelectMode(next);
              if (next && textLayerSpans.length === 0) {
                setTextLayerSpans([{
                  id: `synthetic-select-span-${preview.page.fileId}-${preview.page.pageIndex + 1}`,
                  text: 'Editable text',
                  xRatio: 0.08,
                  yRatio: 0.12,
                  widthRatio: 0.84,
                  heightRatio: 0.06,
                  fontSizeRatio: 0.018,
                  pageHeightPt: 842,
                }]);
                setInlineUiState('error');
                setMessage(ui.noTextLayer);
              }
            }
          }}
          title={isSelectMode ? ui.switchToManualMode : ui.switchToSelectTextMode}
        >
          <LinearIcon name="word" className="linear-icon" />
          <span>{isSelectMode ? ui.selectText : ui.text}</span>
        </button>
        <button type="button" className="studio-edit-tool-btn" title="Coming soon">
          <LinearIcon name="merge" className="linear-icon" /><span>{ui.links}</span>
        </button>
        <button type="button" className="studio-edit-tool-btn" title="Coming soon">
          <LinearIcon name="split" className="linear-icon" /><span>{ui.forms}</span>
        </button>
        <button type="button" className="studio-edit-tool-btn" title="Coming soon">
          <LinearIcon name="image" className="linear-icon" /><span>{ui.images}</span>
        </button>
        <button type="button" className="studio-edit-tool-btn" title="Coming soon">
          <LinearIcon name="lock" className="linear-icon" /><span>{ui.sign}</span>
        </button>
        <button type="button" className={`studio-edit-tool-btn ${tool === 'whiteout' ? 'active' : ''}`} onClick={() => { setTool('whiteout'); setIsSelectMode(false); }}>
          <LinearIcon name="delete-pages" className="linear-icon" /><span>{ui.whiteout}</span>
        </button>
        <button type="button" className={`studio-edit-tool-btn ${tool === 'annotate' ? 'active' : ''}`} onClick={() => { setTool('annotate'); setIsSelectMode(false); }}>
          <LinearIcon name="tool" className="linear-icon" /><span>{ui.annotate}</span>
        </button>
        <button type="button" className={`studio-edit-tool-btn ${tool === 'shapes' ? 'active' : ''}`} onClick={() => { setTool('shapes'); setIsSelectMode(false); }}>
          <LinearIcon name="rotate" className="linear-icon" /><span>{ui.shapes}</span>
        </button>
        <button type="button" className="studio-edit-tool-btn" onClick={undo} disabled={historyIndex <= 0}>
          <LinearIcon name="chevron-left" className="linear-icon" /><span>{ui.undo}</span>
        </button>
        <button type="button" className="studio-edit-tool-btn" onClick={redo} disabled={historyIndex >= history.length - 1}>
          <LinearIcon name="chevron-right" className="linear-icon" /><span>{ui.redo}</span>
        </button>
        <button type="button" className="studio-edit-tool-btn" onClick={deleteSelected} disabled={!selectedElementId}>
          <LinearIcon name="x" className="linear-icon" /><span>{ui.delete}</span>
        </button>
        <button
          type="button"
          className={`studio-edit-tool-btn ${applyToSelection && canApplyToSelection ? 'active' : ''}`}
          onClick={() => setApplyToSelection((prev) => !prev)}
          disabled={!canApplyToSelection || isApplying}
          title={ui.saveSelection}
        >
          <span>{ui.selection}: {applyToSelection && canApplyToSelection ? selectedPages.length : 1}</span>
        </button>
        <button
          type="button"
          className="studio-edit-tool-btn studio-edit-apply-btn"
          onClick={() => {
            if (textEditor) {
              commitTextEditor();
            }
            void applyChanges();
          }}
          disabled={isApplying}
        >
          <span>{isApplying ? ui.saving : ui.save}</span>
        </button>
        <button
          type="button"
          className="studio-edit-back-btn"
          onClick={() => {
            if (hasDirtyChanges && !window.confirm(ui.unsavedConfirm)) {
              return;
            }
            navigate('/studio');
          }}
        >
          {ui.back}
        </button>
      </header>

      <div className="studio-edit-meta">
        <span className="studio-edit-page-badge">{ui.page} {preview.indexInDoc + 1}</span>
        <span className="studio-edit-page-badge">{preview.docName}</span>
        <span className="studio-edit-page-badge">{ui.selection}: {selectedPages.length || 1}</span>
        <span className="studio-edit-page-badge">UI: {uiStateLabel}</span>
        {hasDirtyChanges && <span className="studio-edit-page-badge studio-edit-message">{ui.dirty}</span>}
        {message && (
          <span className={`studio-edit-page-badge studio-edit-message ${inlineUiState === 'error' ? 'is-error' : 'is-success'}`}>
            {message}
          </span>
        )}
      </div>

      <div className="studio-edit-canvas">
        <div
          ref={canvasRef}
          className="studio-edit-page-sheet"
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
        >
          <div className="studio-edit-canvas-content" onPointerDown={onPointerDown}>
            <img
              ref={imageRef}
              src={preview.page.thumbnailUrl}
              alt={`Document page ${preview.indexInDoc + 1}`}
              className="studio-edit-preview-image"
              draggable={false}
            />

            {isSelectMode && textLayerSpans
              .filter(span => !elements.some(el => el.type === 'text' && Math.abs(el.x - span.xRatio) < 0.001))
              .map(span => (
                <div
                  key={span.id}
                  className={`studio-edit-text-highlight ${hoveredTextSpanId === span.id ? 'hovered' : ''}`}
                  style={{
                    left: `${span.xRatio * 100}%`,
                    top: `${span.yRatio * 100}%`,
                    width: `${span.widthRatio * 100}%`,
                    height: `${span.heightRatio * 100}%`,
                  }}
                  onPointerEnter={() => {
                    setHoveredTextSpanId(span.id);
                    setInlineUiState('hover');
                  }}
                  onPointerLeave={() => {
                    setHoveredTextSpanId((prev) => (prev === span.id ? null : prev));
                    if (!textEditor && selectedElementId) {
                      setInlineUiState('selected');
                    } else if (!textEditor) {
                      setInlineUiState('idle');
                    }
                  }}
                />
              ))}

            <svg className="studio-edit-overlay" viewBox="0 0 1000 1000" preserveAspectRatio="none">
              {elements.filter((item): item is StrokeElement => item.type === 'stroke').map((stroke) => (
                <polyline
                  key={stroke.id}
                  points={stroke.points.map((value, index) => {
                    const scaled = value * 1000;
                    return index % 2 === 0 ? `${scaled},` : `${scaled}`;
                  }).join(' ')}
                  fill="none"
                  stroke={stroke.color}
                  opacity={stroke.opacity}
                  strokeWidth={stroke.width * 3}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  onPointerDown={(event) => {
                    beginMoveStroke(event, stroke);
                  }}
                />
              ))}
              {draftStroke && draftStroke.points.length >= 4 && (
                <polyline
                  points={draftStroke.points.map((value, index) => {
                    const scaled = value * 1000;
                    return index % 2 === 0 ? `${scaled},` : `${scaled}`;
                  }).join(' ')}
                  fill="none"
                  stroke="#2563eb"
                  strokeWidth={6}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}
            </svg>

            {elements.filter((item): item is RectElement => item.type === 'rect').map((rect) => (
              <div
                key={rect.id}
                className={`studio-edit-rect ${selectedElementId === rect.id ? 'active' : ''}`}
                style={{
                  left: `${rect.x * 100}%`,
                  top: `${rect.y * 100}%`,
                  width: `${rect.w * 100}%`,
                  height: `${rect.h * 100}%`,
                  background: rect.fill,
                  border: `${rect.strokeWidth}px solid ${rect.stroke}`,
                  opacity: rect.opacity,
                }}
                onPointerDown={(event) => beginMoveRect(event, rect)}
              >
                {selectedElementId === rect.id && (
                  <button
                    type="button"
                    className="studio-edit-text-resize"
                    onPointerDown={(event) => beginResizeRect(event, rect)}
                    aria-label="Resize rectangle"
                  />
                )}
              </div>
            ))}

            {draftRect && (
              <div
                className="studio-edit-rect"
                style={{
                  left: `${draftRect.x * 100}%`,
                  top: `${draftRect.y * 100}%`,
                  width: `${draftRect.w * 100}%`,
                  height: `${draftRect.h * 100}%`,
                  background: tool === 'whiteout' ? '#ffffff' : 'transparent',
                  border: `2px solid ${tool === 'whiteout' ? '#d1d5db' : '#2563eb'}`,
                }}
              />
            )}

            {elements.filter((item): item is TextElement => item.type === 'text').map((text) => {
              const isEditing = textEditor?.id === text.id;
              return (
                <div
                  key={text.id}
                  className={`studio-edit-text ${selectedElementId === text.id ? 'active' : ''}`}
                  style={{
                    left: `${text.x * 100}%`,
                    top: `${text.y * 100}%`,
                    width: `${text.w * 100}%`,
                    height: `${text.h * 100}%`,
                    color: text.color,
                    fontSize: `${text.fontSize}px`,
                    fontFamily: text.fontFamily === 'times' ? 'Times New Roman, serif' : text.fontFamily === 'mono' ? 'JetBrains Mono, monospace' : 'Sora, sans-serif',
                    fontWeight: text.fontWeight,
                    fontStyle: text.fontStyle,
                    textAlign: text.textAlign,
                    opacity: text.opacity,
                  }}
                  onPointerDown={(event) => handleTextPointerDown(event, text)}
                  onPointerUp={(event) => handleTextPointerUp(event, text)}
                >
                  {isEditing ? (
                    <textarea
                      value={textEditor.value}
                      onChange={(event) => handleTextEditorChange(text.id, event.target.value)}
                      onBlur={commitTextEditor}
                      onKeyDown={(event) => {
                        if (event.key === 'Escape') {
                          setElements((prev) => prev.map((item) => {
                            if (item.id !== text.id || item.type !== 'text') {
                              return item;
                            }
                            return { ...item, text: textEditor.initialValue };
                          }));
                          setInlineUiState('selected');
                          setTextEditor(null);
                        }
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          commitTextEditor();
                          void applyChanges();
                        }
                      }}
                      autoFocus
                      rows={1}
                      className="studio-edit-textarea"
                    />
                  ) : (
                    <span className="studio-edit-text-content">{text.text}</span>
                  )}
                  {selectedElementId === text.id && (
                    <div className="studio-edit-element-controls">
                      <StudioFloatingMenu
                        element={text}
                        onUpdate={(patch) => updateSelectedText(patch as Partial<TextElement>)}
                        onDelete={deleteSelected}
                        onDuplicate={() => {
                          const dup: TextElement = { ...text, id: crypto.randomUUID(), x: text.x + 0.02, y: text.y + 0.02 };
                          applyElements([...elements, dup]);
                          setSelectedElementId(dup.id);
                        }}
                      />
                      {!isEditing && (
                        <button
                          type="button"
                          className="studio-edit-text-resize"
                          onPointerDown={(event) => beginResizeText(event, text)}
                          aria-label="Resize text box"
                        />
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {selectedStroke && selectedStrokeBounds && (
              <div
                className="studio-edit-stroke-box"
                style={{
                  left: `${selectedStrokeBounds.minX * 100}%`,
                  top: `${selectedStrokeBounds.minY * 100}%`,
                  width: `${Math.max(0.2, (selectedStrokeBounds.maxX - selectedStrokeBounds.minX) * 100)}%`,
                  height: `${Math.max(0.2, (selectedStrokeBounds.maxY - selectedStrokeBounds.minY) * 100)}%`,
                }}
                onPointerDown={(event) => beginMoveStroke(event, selectedStroke)}
              >
                <button
                  type="button"
                  className="studio-edit-text-resize"
                  onPointerDown={(event) => beginResizeStroke(event, selectedStroke)}
                  aria-label="Resize stroke"
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
