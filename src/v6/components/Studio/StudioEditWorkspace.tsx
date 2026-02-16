import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PDFDocument, StandardFonts, rgb, type PDFFont } from 'pdf-lib';
import { usePlatform } from '../../../app/react/platform-context';
import { defaultFilePreviewService } from '../../preview/preview-service';
import { useStudioStore, type PageItem, type StudioDocument, type StudioState } from './studio-store';
import { LinearIcon } from '../icons/linear-icon';

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
  }, [preview?.page.id]);

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
        <button type="button" className={`studio-edit-tool-btn ${tool === 'text' ? 'active' : ''}`} onClick={() => setTool('text')}>
          <LinearIcon name="word" className="linear-icon" /><span>Text</span>
        </button>
        <button type="button" className="studio-edit-tool-btn" disabled title="Coming soon">
          <LinearIcon name="tool" className="linear-icon" /><span>Links</span>
        </button>
        <button type="button" className="studio-edit-tool-btn" disabled title="Coming soon">
          <LinearIcon name="tool" className="linear-icon" /><span>Forms</span>
        </button>
        <button type="button" className="studio-edit-tool-btn" disabled title="Coming soon">
          <LinearIcon name="image" className="linear-icon" /><span>Images</span>
        </button>
        <button type="button" className="studio-edit-tool-btn" disabled title="Coming soon">
          <LinearIcon name="tool" className="linear-icon" /><span>Sign</span>
        </button>
        <button type="button" className={`studio-edit-tool-btn ${tool === 'whiteout' ? 'active' : ''}`} onClick={() => setTool('whiteout')}>
          <LinearIcon name="delete-pages" className="linear-icon" /><span>Whiteout</span>
        </button>
        <button type="button" className={`studio-edit-tool-btn ${tool === 'annotate' ? 'active' : ''}`} onClick={() => setTool('annotate')}>
          <LinearIcon name="tool" className="linear-icon" /><span>Annotate</span>
        </button>
        <button type="button" className={`studio-edit-tool-btn ${tool === 'shapes' ? 'active' : ''}`} onClick={() => setTool('shapes')}>
          <LinearIcon name="tool" className="linear-icon" /><span>Shapes</span>
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

      {selectedText && (
        <div className="studio-text-style-panel" aria-label="Text styles">
          <label className="studio-text-style-field">
            <span>Font</span>
            <select value={selectedText.fontFamily} onChange={(event) => updateSelectedText({ fontFamily: event.target.value as FontFamilyId })}>
              <option value="sora">Sora</option>
              <option value="times">Times</option>
              <option value="mono">Mono</option>
            </select>
          </label>
          <label className="studio-text-style-field">
            <span>Size</span>
            <input
              type="number"
              min={8}
              max={96}
              value={selectedText.fontSize}
              onChange={(event) => updateSelectedText({ fontSize: clamp(Number(event.target.value) || 16, 8, 96) })}
            />
          </label>
          <label className="studio-text-style-field">
            <span>Color</span>
            <input type="color" value={selectedText.color} onChange={(event) => updateSelectedText({ color: event.target.value })} />
          </label>
          <label className="studio-text-style-field">
            <span>Align</span>
            <select value={selectedText.textAlign} onChange={(event) => updateSelectedText({ textAlign: event.target.value as TextAlignId })}>
              <option value="left">Left</option>
              <option value="center">Center</option>
              <option value="right">Right</option>
            </select>
          </label>
          <button
            type="button"
            className={`studio-text-style-toggle ${selectedText.fontWeight === 'bold' ? 'active' : ''}`}
            onClick={() => updateSelectedText({ fontWeight: selectedText.fontWeight === 'bold' ? 'normal' : 'bold' })}
          >
            Bold
          </button>
          <button
            type="button"
            className={`studio-text-style-toggle ${selectedText.fontStyle === 'italic' ? 'active' : ''}`}
            onClick={() => updateSelectedText({ fontStyle: selectedText.fontStyle === 'italic' ? 'normal' : 'italic' })}
          >
            Italic
          </button>
          <label className="studio-text-style-field studio-text-style-opacity">
            <span>Opacity</span>
            <input
              type="range"
              min={20}
              max={100}
              value={Math.round(selectedText.opacity * 100)}
              onChange={(event) => updateSelectedText({ opacity: Number(event.target.value) / 100 })}
            />
          </label>
        </div>
      )}

      <div className="studio-edit-meta">
        <span className="studio-edit-page-badge">Page {preview.indexInDoc + 1}</span>
        <span className="studio-edit-page-badge">{preview.docName}</span>
        <span className="studio-edit-page-badge">Selection: {selectedPages.length || 1}</span>
        {message && <span className="studio-edit-page-badge studio-edit-message">{message}</span>}
      </div>

      <div className="studio-edit-canvas">
        <div
          ref={canvasRef}
          className="studio-edit-page-sheet"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
        >
          <img
            ref={imageRef}
            src={preview.page.thumbnailUrl}
            alt={`Document page ${preview.indexInDoc + 1}`}
            className="studio-edit-preview-image"
            draggable={false}
          />

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
                  minHeight: `${text.h * 100}%`,
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
                {selectedElementId === text.id && !isEditing && (
                  <button
                    type="button"
                    className="studio-edit-text-resize"
                    onPointerDown={(event) => beginResizeText(event, text)}
                    aria-label="Resize text box"
                  />
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
    </section>
  );
}
