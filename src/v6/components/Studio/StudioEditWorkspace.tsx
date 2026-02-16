import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PDFDocument, StandardFonts, rgb, type PDFFont } from 'pdf-lib';
import { usePlatform } from '../../../app/react/platform-context';
import { defaultFilePreviewService } from '../../preview/preview-service';
import { useStudioStore, type PageItem, type StudioDocument, type StudioState } from './studio-store';
import { LinearIcon } from '../icons/linear-icon';

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

let pdfJsPromise: Promise<PdfJsLike | null> | null = null;

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
  const viewport = page.getViewport({ scale: 2.0 });
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
    const fontHeight = Math.hypot(tx[2], tx[3]) || (Number(item.height) * 2.0) || 8;
    const style = textStyles[item.fontName];
    let fontAscent = fontHeight;
    if (style?.ascent) {
      fontAscent = style.ascent * fontHeight;
    }

    const estimatedWidth = fontHeight * item.str.length * 0.46;
    const width = Math.max(1, (Number(item.width) * 2.0 || estimatedWidth));
    const height = Math.max(1, (Number(item.height) * 2.0 || fontHeight * 1.1));
    const top = y - fontAscent;

    spans.push({
      id: `span-${i}-${item.str.length}`,
      text: item.str,
      xRatio: clamp01(x / viewport.width),
      yRatio: clamp01(top / viewport.height),
      widthRatio: clamp01(width / viewport.width),
      heightRatio: clamp01(height / viewport.height),
      fontSizeRatio: clamp(fontHeight / viewport.height, 0.004, 0.25),
      fontName: item.fontName,
    });
  }

  return spans;
}

type EditorToolId = 'text' | 'annotate' | 'whiteout' | 'shapes';
type FontFamilyId = 'sora' | 'times' | 'mono';
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

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
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

function hexToRgb(color: string): { r: number; g: number; b: number } {
  const normalized = color.startsWith('#') ? color.slice(1) : color;
  if (normalized.length !== 6) {
    return { r: 0, g: 0, b: 0 };
  }
  const r = Number.parseInt(normalized.slice(0, 2), 16) / 255;
  const g = Number.parseInt(normalized.slice(2, 4), 16) / 255;
  const b = Number.parseInt(normalized.slice(4, 6), 16) / 255;
  return { r, g, b };
}

function getPdfFontName(fontFamily: FontFamilyId, fontWeight: 'normal' | 'bold', fontStyle: 'normal' | 'italic') {
  if (fontFamily === 'times') {
    if (fontWeight === 'bold' && fontStyle === 'italic') {
      return StandardFonts.TimesRomanBoldItalic;
    }
    if (fontWeight === 'bold') {
      return StandardFonts.TimesRomanBold;
    }
    if (fontStyle === 'italic') {
      return StandardFonts.TimesRomanItalic;
    }
    return StandardFonts.TimesRoman;
  }

  if (fontFamily === 'mono') {
    if (fontWeight === 'bold') {
      return StandardFonts.CourierBold;
    }
    return StandardFonts.Courier;
  }

  if (fontWeight === 'bold' && fontStyle === 'italic') {
    return StandardFonts.HelveticaBoldOblique;
  }
  if (fontWeight === 'bold') {
    return StandardFonts.HelveticaBold;
  }
  if (fontStyle === 'italic') {
    return StandardFonts.HelveticaOblique;
  }
  return StandardFonts.Helvetica;
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
  onClose: () => void;
}

function StudioFloatingMenu({ element, onUpdate, onDelete, onDuplicate, onClose }: StudioFloatingMenuProps) {
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
    setElements([]);
    setHistory([[]]);
    setHistoryIndex(0);
    setSelectedElementId(null);
    setDraftRect(null);
    setDraftStroke(null);
    setTextEditor(null);
    setTextLayerSpans([]);

    if (preview) {
      void (async () => {
        try {
          const entry = await runtime.vfs.read(preview.page.fileId);
          const blob = await entry.getBlob();
          const bytes = new Uint8Array(await blob.arrayBuffer());
          const spans = await buildTextLayerSpans(bytes, preview.page.pageIndex + 1);
          setTextLayerSpans(spans);
        } catch (error) {
          console.error('Failed to load text layer:', error);
        }
      })();
    }
  }, [preview?.page.id, runtime.vfs]);

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
        // Find if we clicked on a text span
        const clickedSpan = textLayerSpans.find(span =>
          point.x >= span.xRatio && point.x <= span.xRatio + span.widthRatio &&
          point.y >= span.yRatio && point.y <= span.yRatio + span.heightRatio
        );

        if (clickedSpan) {
          // Merge spans into a line (logic from pdf-editor)
          const lineThreshold = Math.max(0.0025, clickedSpan.heightRatio * 0.55);
          const lineSpans = textLayerSpans
            .filter((candidate) => (
              Math.abs(candidate.yRatio - clickedSpan.yRatio) <= lineThreshold ||
              Math.abs((candidate.yRatio + candidate.heightRatio) - (clickedSpan.yRatio + clickedSpan.heightRatio)) <= lineThreshold
            ))
            .sort((a, b) => a.xRatio - b.xRatio);

          if (lineSpans.length > 0) {
            const left = Math.min(...lineSpans.map((s) => s.xRatio));
            const top = Math.min(...lineSpans.map((s) => s.yRatio));
            const right = Math.max(...lineSpans.map((s) => s.xRatio + s.widthRatio));
            const bottom = Math.max(...lineSpans.map((s) => s.yRatio + s.heightRatio));
            const width = right - left;
            const height = bottom - top;

            let mergedText = '';
            for (let i = 0; i < lineSpans.length; i += 1) {
              const current = lineSpans[i];
              if (i > 0) {
                const prev = lineSpans[i - 1];
                const gap = current.xRatio - (prev.xRatio + prev.widthRatio);
                if (gap > Math.max(0.0015, current.heightRatio * 0.2) && !mergedText.endsWith(' ') && !current.text.startsWith(' ')) {
                  mergedText += ' ';
                }
              }
              mergedText += current.text;
            }
            mergedText = mergedText.replace(/\s+/g, ' ').trim();

            if (!mergedText) return;

            // Check if we already have an element for this line
            const existing = elements.find(el =>
              el.type === 'text' &&
              Math.abs(el.x - left) < 0.005 &&
              Math.abs(el.y - top) < 0.005
            );

            if (existing) {
              setSelectedElementId(existing.id);
              startEditingText(existing as TextElement);
              return;
            }

            const whiteout: RectElement = {
              id: crypto.randomUUID(),
              type: 'rect',
              x: left - 0.001,
              y: top - 0.001,
              w: width + 0.002,
              h: height + 0.002,
              fill: '#ffffff',
              stroke: 'transparent',
              strokeWidth: 0,
              opacity: 1,
            };

            // Font detection logic
            let fontFamily: FontFamilyId = 'sora';
            if (clickedSpan.fontName) {
              const lowerName = clickedSpan.fontName.toLowerCase();
              if (lowerName.includes('serif') || lowerName.includes('times')) {
                fontFamily = 'times';
              } else if (lowerName.includes('mono') || lowerName.includes('courier')) {
                fontFamily = 'mono';
              }
            }

            const next: TextElement = {
              id: crypto.randomUUID(),
              type: 'text',
              x: left,
              y: top - 0.0005, // Subtle upward shift for baseline alignment
              w: width + 0.02,
              h: height + 0.005,
              text: mergedText,
              color: '#000000',
              fontSize: Math.round(clickedSpan.fontSizeRatio * 842 * 0.98), // Refined scale
              fontFamily,
              fontWeight: 'normal',
              fontStyle: 'normal',
              textAlign: 'left',
              opacity: 1,
            };
            console.log('E2E_DEBUG: whiteout_rect', whiteout);
            console.log('E2E_DEBUG: text_element', next);
            applyElements([...elements, whiteout, next]);
            setSelectedElementId(next.id);
            startEditingText(next);
            return;
          }
        }
      }

      const next: TextElement = {
        id: crypto.randomUUID(),
        type: 'text',
        x: point.x,
        y: point.y,
        w: 0.22,
        h: 0.06,
        text: 'Text',
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
    if (tool === 'text') {
      setSelectedElementId(element.id);
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
    if (tool !== 'text') {
      return;
    }
    const target = event.target as HTMLElement | null;
    if (target && target.tagName === 'TEXTAREA') {
      return;
    }
    if (textEditor?.id !== element.id && textEditor) {
      commitTextEditor();
    }
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
    setTextEditor({ id: element.id, value: element.text, initialValue: element.text });
  };

  const commitTextEditor = useCallback(() => {
    if (!textEditor) {
      return;
    }
    if (textEditor.value !== textEditor.initialValue) {
      pushHistory(elements);
    }
    setTextEditor(null);
  }, [elements, pushHistory, textEditor]);

  const handleTextEditorChange = useCallback((id: string, value: string) => {
    setTextEditor((prev) => (prev && prev.id === id ? { ...prev, value } : prev));
    setElements((prev) => prev.map((item) => {
      if (item.id !== id || item.type !== 'text') {
        return item;
      }
      return { ...item, text: value };
    }));
  }, []);

  const applyChanges = async () => {
    if (!preview) {
      return;
    }

    setIsApplying(true);
    setMessage(null);
    try {
      const sourceEntry = await runtime.vfs.read(preview.page.fileId);
      const sourceBlob = await sourceEntry.getBlob();
      const sourceBytes = new Uint8Array(await sourceBlob.arrayBuffer());
      const pdf = await PDFDocument.load(sourceBytes);
      const page = pdf.getPage(preview.page.pageIndex);
      const pageWidth = page.getWidth();
      const pageHeight = page.getHeight();

      const fontCache = new Map<string, PDFFont>();
      const getFont = async (family: FontFamilyId, weight: 'normal' | 'bold', style: 'normal' | 'italic') => {
        const fontName = getPdfFontName(family, weight, style);
        const key = String(fontName);
        const cached = fontCache.get(key);
        if (cached) {
          return cached;
        }
        const embedded = await pdf.embedFont(fontName);
        fontCache.set(key, embedded);
        return embedded;
      };

      for (const element of elements) {
        if (element.type === 'text') {
          const font = await getFont(element.fontFamily, element.fontWeight, element.fontStyle);
          const { r, g, b } = hexToRgb(element.color);
          const lines = element.text.split('\n');
          const lineHeight = element.fontSize * 1.25;
          for (let i = 0; i < lines.length; i += 1) {
            const line = lines[i] || ' ';
            const lineWidth = font.widthOfTextAtSize(line, element.fontSize);
            const blockWidth = element.w * pageWidth;
            let x = element.x * pageWidth;
            if (element.textAlign === 'center') {
              x += Math.max(0, (blockWidth - lineWidth) / 2);
            }
            if (element.textAlign === 'right') {
              x += Math.max(0, blockWidth - lineWidth);
            }
            const yTop = element.y * pageHeight + i * lineHeight;
            const y = pageHeight - yTop - element.fontSize;
            page.drawText(line, {
              x,
              y,
              size: element.fontSize,
              font,
              color: rgb(r, g, b),
              opacity: element.opacity,
            });
          }
          continue;
        }

        if (element.type === 'stroke') {
          if (element.points.length < 4) {
            continue;
          }
          const { r, g, b } = hexToRgb(element.color);
          for (let i = 0; i < element.points.length - 2; i += 2) {
            const sx = element.points[i] * pageWidth;
            const sy = pageHeight - (element.points[i + 1] * pageHeight);
            const ex = element.points[i + 2] * pageWidth;
            const ey = pageHeight - (element.points[i + 3] * pageHeight);
            page.drawLine({
              start: { x: sx, y: sy },
              end: { x: ex, y: ey },
              thickness: element.width,
              color: rgb(r, g, b),
              opacity: element.opacity,
            });
          }
          continue;
        }

        const sx = element.x * pageWidth;
        const sy = pageHeight - ((element.y + element.h) * pageHeight);
        const sw = element.w * pageWidth;
        const sh = element.h * pageHeight;
        const strokeRgb = hexToRgb(element.stroke);
        const fillColor = element.fill === 'transparent' ? undefined : rgb(...Object.values(hexToRgb(element.fill)) as [number, number, number]);

        page.drawRectangle({
          x: sx,
          y: sy,
          width: sw,
          height: sh,
          borderWidth: element.strokeWidth,
          borderColor: rgb(strokeRgb.r, strokeRgb.g, strokeRgb.b),
          color: fillColor,
          opacity: element.opacity,
          borderOpacity: element.opacity,
        });
      }

      const outputBytes = await pdf.save();
      const stableBytes = new Uint8Array(outputBytes.byteLength);
      stableBytes.set(outputBytes);
      const outputBlob = new Blob([stableBytes.buffer], { type: 'application/pdf' });
      const outputName = sourceEntry.getName() ?? 'edited.pdf';
      const outputFile = new File([outputBlob], outputName, { type: 'application/pdf' });
      const updatedEntry = await runtime.vfs.write(outputFile);

      const previewData = await defaultFilePreviewService.getPdfPagePreview(runtime, updatedEntry.id, preview.page.pageIndex + 1, { scale: 2 });
      updatePage(preview.docId, preview.page.id, {
        fileId: updatedEntry.id,
        pageIndex: preview.page.pageIndex,
        thumbnailUrl: previewData.thumbnailUrl ?? preview.page.thumbnailUrl,
      });
      setMessage('Changes applied to PDF page.');
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to apply changes';
      setMessage(msg);
    } finally {
      setIsApplying(false);
    }
  };

  if (!preview) {
    return (
      <section className="studio-edit-shell">
        <div className="studio-edit-empty">
          <h2 className="studio-edit-empty-title">Select a page to start Edit mode</h2>
          <button type="button" className="studio-edit-back-btn" onClick={() => navigate('/studio')}>
            Back to Canvas
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
            if (tool === 'text') setIsSelectMode(!isSelectMode);
          }}
          title={isSelectMode ? "Switch to Manual Mode" : "Switch to Select Text Mode"}
        >
          <LinearIcon name="word" className="linear-icon" />
          <span>{isSelectMode ? 'Select Text' : 'Text'}</span>
        </button>
        <button type="button" className="studio-edit-tool-btn" title="Coming soon">
          <LinearIcon name="merge" className="linear-icon" /><span>Links</span>
        </button>
        <button type="button" className="studio-edit-tool-btn" title="Coming soon">
          <LinearIcon name="split" className="linear-icon" /><span>Forms</span>
        </button>
        <button type="button" className="studio-edit-tool-btn" title="Coming soon">
          <LinearIcon name="image" className="linear-icon" /><span>Images</span>
        </button>
        <button type="button" className="studio-edit-tool-btn" title="Coming soon">
          <LinearIcon name="lock" className="linear-icon" /><span>Sign</span>
        </button>
        <button type="button" className={`studio-edit-tool-btn ${tool === 'whiteout' ? 'active' : ''}`} onClick={() => { setTool('whiteout'); setIsSelectMode(false); }}>
          <LinearIcon name="delete-pages" className="linear-icon" /><span>Whiteout</span>
        </button>
        <button type="button" className={`studio-edit-tool-btn ${tool === 'annotate' ? 'active' : ''}`} onClick={() => { setTool('annotate'); setIsSelectMode(false); }}>
          <LinearIcon name="tool" className="linear-icon" /><span>Annotate</span>
        </button>
        <button type="button" className={`studio-edit-tool-btn ${tool === 'shapes' ? 'active' : ''}`} onClick={() => { setTool('shapes'); setIsSelectMode(false); }}>
          <LinearIcon name="rotate" className="linear-icon" /><span>Shapes</span>
        </button>
        <button type="button" className="studio-edit-tool-btn" onClick={undo} disabled={historyIndex <= 0}>
          <LinearIcon name="chevron-left" className="linear-icon" /><span>Undo</span>
        </button>
        <button type="button" className="studio-edit-tool-btn" onClick={redo} disabled={historyIndex >= history.length - 1}>
          <LinearIcon name="chevron-right" className="linear-icon" /><span>Redo</span>
        </button>
        <button type="button" className="studio-edit-tool-btn" onClick={deleteSelected} disabled={!selectedElementId}>
          <LinearIcon name="x" className="linear-icon" /><span>Delete</span>
        </button>
        <button type="button" className="studio-edit-tool-btn studio-edit-apply-btn" onClick={() => { void applyChanges(); }} disabled={isApplying}>
          <span>{isApplying ? 'Applying...' : 'Apply changes'}</span>
        </button>
        <button type="button" className="studio-edit-back-btn" onClick={() => navigate('/studio')}>
          Back
        </button>
      </header>

      <div className="studio-edit-meta">
        <span className="studio-edit-page-badge">Page {preview.indexInDoc + 1}</span>
        <span className="studio-edit-page-badge">{preview.docName}</span>
        <span className="studio-edit-page-badge">Selection: {selectedPages.length || 1}</span>
        {message && <span className="studio-edit-page-badge studio-edit-message">{message}</span>}
        {selectedElement && (
          <span className="studio-edit-page-badge debugging" style={{ background: '#f59e0b', color: '#000' }}>
            DEBUG: x={selectedElement.x.toFixed(4)} y={selectedElement.y.toFixed(4)} w={('w' in selectedElement ? (selectedElement.w as number).toFixed(4) : '0')}
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
              .filter(span => !elements.some(el => el.type === 'text' && Math.abs(el.x - span.xRatio) < 0.001)) // Прячем подсветку, если уже есть элемент
              .map(span => (
                <div
                  key={span.id}
                  className="studio-edit-text-highlight"
                  style={{
                    left: `${span.xRatio * 100}%`,
                    top: `${span.yRatio * 100}%`,
                    width: `${span.widthRatio * 100}%`,
                    height: `${span.heightRatio * 100}%`,
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
                          setTextEditor(null);
                        }
                        if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                          event.preventDefault();
                          commitTextEditor();
                        }
                      }}
                      autoFocus
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
                        onClose={() => setSelectedElementId(null)}
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
