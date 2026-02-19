import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePlatform } from '../../../app/react/platform-context';
import type { IWorkerCommand, WorkerPdfTextLayerSpan, WorkerStudioEditElement } from '../../../core/public/contracts';
import { extractEmbeddedPdfText } from '../../../services/pdf/pdf-text-extractor';
import { extractPdfTextLayerSpans } from '../../../services/pdf/pdf-text-layer-extractor';
import { defaultFilePreviewService } from '../../preview/preview-service';
import { useStudioStore, type PageItem, type StudioDocument, type StudioEditToolId, type StudioState } from './studio-store';
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
import { StudioPageEditor } from './StudioPageEditor';
import {
  EditElement,
  TextElement,
  RectElement,
  StrokeElement,
  RectDraft,
  StrokeDraft,
  DragSession,
  TextEditorState,
  InlineUiState,
  TextAlignId,
  TextLayerSpan,
  EditorToolId
} from './editor-types';

interface SelectedPage {
  docId: string;
  docName: string;
  page: PageItem;
  indexInDoc: number;
}

interface SaveCheckpointEntry {
  docId: string;
  pageId: string;
  pageIndex: number;
  prevFileId: string;
  prevThumbnailUrl: string;
  nextFileId: string;
  nextThumbnailUrl: string;
}

interface SaveCheckpoint {
  entries: SaveCheckpointEntry[];
}

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
          aria-label="Font family"
          title="Font family"
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
          data-testid="studio-floating-font-size"
          aria-label="Font size"
          title="Font size"
          value={textElem.fontSize}
          min={8}
          max={96}
          onChange={(e) => onUpdate({ fontSize: clamp(Number(e.target.value) || 16, 8, 96) })}
        />
        <input
          type="number"
          className="studio-floating-input font-size"
          data-testid="studio-floating-line-height"
          aria-label="Line height"
          value={textElem.lineHeight}
          min={0.8}
          max={3}
          step={0.05}
          title="Line height"
          onChange={(e) => onUpdate({ lineHeight: clamp(Number(e.target.value) || 1.2, 0.8, 3) })}
        />
        <input
          type="number"
          className="studio-floating-input font-size"
          data-testid="studio-floating-letter-spacing"
          aria-label="Letter spacing"
          value={textElem.letterSpacing}
          min={-2}
          max={20}
          step={0.2}
          title="Letter spacing"
          onChange={(e) => onUpdate({ letterSpacing: clamp(Number(e.target.value) || 0, -2, 20) })}
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
  const editSession = useStudioStore((s: StudioState) => s.editSession);
  const updateEditSessionTool = useStudioStore((s: StudioState) => s.updateEditSessionTool);
  const syncEditSessionTarget = useStudioStore((s: StudioState) => s.syncEditSessionTarget);

  const imageRef = useRef<HTMLImageElement | null>(null);

  const [tool, setTool] = useState<EditorToolId>(editSession?.activeTool ?? 'text');
  const [elements, setElements] = useState<EditElement[]>([]);
  const [history, setHistory] = useState<EditElement[][]>([[]]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isApplying, setIsApplying] = useState(false);
  const [textEditor, setTextEditor] = useState<TextEditorState | null>(null);
  const [inlineUiState, setInlineUiState] = useState<InlineUiState>('idle');
  const [saveUndoStack, setSaveUndoStack] = useState<SaveCheckpoint[]>([]);
  const [saveRedoStack, setSaveRedoStack] = useState<SaveCheckpoint[]>([]);

  const locale = useMemo(() => detectStudioEditLocale(), []);
  const ui = useMemo(() => getStudioEditMessages(locale), [locale]);

  const selectedPages = useMemo(() => buildSelectedPages(documents, selection), [documents, selection]);
  const activeDocument = useMemo(
    () => documents.find((doc: StudioDocument) => doc.id === activeDocumentId) ?? null,
    [activeDocumentId, documents],
  );

  const preview = useMemo(() => {
    if (editSession) {
      const sessionDoc = documents.find((doc) => doc.id === editSession.docId);
      const sessionPage = sessionDoc?.pages.find((page) => page.id === editSession.pageId);
      const sessionIndexInDoc = sessionPage ? sessionDoc?.pages.findIndex((page) => page.id === sessionPage.id) ?? -1 : -1;
      if (sessionDoc && sessionPage && sessionIndexInDoc >= 0) {
        return {
          docId: sessionDoc.id,
          docName: sessionDoc.name,
          page: sessionPage,
          indexInDoc: sessionIndexInDoc,
        };
      }
    }
    if (selectedPages[0]) {
      return selectedPages[0];
    }
    if (activeDocument && activeDocument.pages[0]) {
      return {
        docId: activeDocument.id,
        docName: activeDocument.name,
        page: activeDocument.pages[0],
        indexInDoc: 0,
      };
    }
    return null;
  }, [activeDocument, documents, editSession, selectedPages]);
  const canApplyToSelection = selectedPages.length > 1;

  useEffect(() => {
    if (editSession?.activeTool && editSession.activeTool !== tool) {
      setTool(editSession.activeTool);
    }
  }, [editSession?.activeTool, tool]);

  useEffect(() => {
    if (!preview) {
      return;
    }
    syncEditSessionTarget({
      docId: preview.docId,
      pageId: preview.page.id,
      pageIndex: preview.page.pageIndex,
      workingFileId: preview.page.fileId,
    });
  }, [preview?.docId, preview?.page.fileId, preview?.page.id, preview?.page.pageIndex, syncEditSessionTarget]);

  const selectTool = useCallback((nextTool: StudioEditToolId) => {
    setTool(nextTool);
    updateEditSessionTool(nextTool);
  }, [updateEditSessionTool]);

  const [applyToSelection, setApplyToSelection] = useState(true);
  useEffect(() => {
    if (!canApplyToSelection && applyToSelection) {
      setApplyToSelection(false);
      return;
    }
    if (canApplyToSelection && !applyToSelection) {
      setApplyToSelection(true);
    }
  }, [applyToSelection, canApplyToSelection]);

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
    setTextEditor(null);
    setInlineUiState('idle');
    setSaveUndoStack([]);
    setSaveRedoStack([]);

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
        // setTextLayerSpans(spans); // This state is no longer needed here
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
          // setTextLayerSpans(fallbackSpans); // This state is no longer needed here
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
    setElements(next);
    pushHistory(next); // Push the new state to history
    setSelectedElementId(null);
    setTextEditor(null);
  }, [elements, pushHistory, selectedElementId]);

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

  const applyChanges = async () => {
    if (!preview) {
      return;
    }

    const targets = applyToSelection && canApplyToSelection ? selectedPages : [preview];
    let overflowCount = 0;
    let failureCount = 0;
    setIsApplying(true);
    setInlineUiState('saving');
    setMessage(null);
    const runId = crypto.randomUUID();
    try {
      const failureDetails: string[] = [];
      const checkpointEntries: SaveCheckpointEntry[] = [];

      for (const target of targets) {
        try {
          const prevFileId = target.page.fileId;
          const prevThumbnailUrl = target.page.thumbnailUrl;
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
          if (!finalEvent.payload.payload.trueReplaceApplied && finalEvent.payload.payload.trueReplaceFallbackReason) {
            runtime.telemetry.track({
              type: 'STUDIO_EDIT_GUARDRAIL',
              runId,
              toolId: 'studio.edit.text',
              fileId: target.page.fileId,
              pageIndex: target.page.pageIndex,
              code: `STUDIO_TRUE_REPLACE_FALLBACK_${finalEvent.payload.payload.trueReplaceFallbackReason}`,
              message: 'True replace fallback path used',
            });
          }
          const previewPromise = defaultFilePreviewService.getPdfPagePreview(
            runtime,
            finalEvent.payload.payload.outputId,
            target.page.pageIndex + 1,
            { scale: 2 },
          );
          const previewData = await Promise.race([
            previewPromise,
            new Promise<null>((resolve) => {
              setTimeout(() => resolve(null), 8000);
            }),
          ]);
          const nextThumbnailUrl = previewData?.thumbnailUrl ?? target.page.thumbnailUrl;
          updatePage(target.docId, target.page.id, {
            fileId: finalEvent.payload.payload.outputId,
            pageIndex: target.page.pageIndex,
            thumbnailUrl: nextThumbnailUrl,
          });
          checkpointEntries.push({
            docId: target.docId,
            pageId: target.page.id,
            pageIndex: target.page.pageIndex,
            prevFileId,
            prevThumbnailUrl,
            nextFileId: finalEvent.payload.payload.outputId,
            nextThumbnailUrl,
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
      if (checkpointEntries.length > 0) {
        setSaveUndoStack((prev) => [...prev, { entries: checkpointEntries }]);
        setSaveRedoStack([]);
      }
      runtime.telemetry.track({
        type: 'STUDIO_EDIT_SAVE_ACTION',
        runId,
        toolId: 'studio.edit.text',
        action: 'apply',
        scope: targets.length > 1 ? 'selection' : 'single',
        pagesTotal: targets.length,
        pagesSucceeded: targets.length - failureCount,
        pagesFailed: failureCount,
        overflowCount,
        message: failureCount > 0 ? ui.partialSaveFailed : ui.changesApplied,
      });

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
      const pagesFailed = failureCount > 0 ? failureCount : targets.length;
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
      runtime.telemetry.track({
        type: 'STUDIO_EDIT_SAVE_ACTION',
        runId,
        toolId: 'studio.edit.text',
        action: 'apply',
        scope: targets.length > 1 ? 'selection' : 'single',
        pagesTotal: targets.length,
        pagesSucceeded: Math.max(0, targets.length - pagesFailed),
        pagesFailed,
        overflowCount,
        message: details,
      });
      setMessage(`${ui.saveFailed}${details ? ` ${details}` : ''}`.trim());
    } finally {
      setIsApplying(false);
    }
  };

  const undoLastSave = async () => {
    const checkpoint = saveUndoStack[saveUndoStack.length - 1];
    if (!checkpoint || isApplying) {
      return;
    }
    const runId = crypto.randomUUID();
    setIsApplying(true);
    try {
      for (const entry of checkpoint.entries) {
        updatePage(entry.docId, entry.pageId, {
          fileId: entry.prevFileId,
          pageIndex: entry.pageIndex,
          thumbnailUrl: entry.prevThumbnailUrl,
        });
      }
      setSaveUndoStack((prev) => prev.slice(0, -1));
      setSaveRedoStack((prev) => [...prev, checkpoint]);
      setMessage(ui.saveReverted);
      setInlineUiState('saved');
      runtime.telemetry.track({
        type: 'STUDIO_EDIT_SAVE_ACTION',
        runId,
        toolId: 'studio.edit.text',
        action: 'undo',
        scope: checkpoint.entries.length > 1 ? 'selection' : 'single',
        pagesTotal: checkpoint.entries.length,
        pagesSucceeded: checkpoint.entries.length,
        pagesFailed: 0,
        message: ui.saveReverted,
      });
    } finally {
      setIsApplying(false);
    }
  };

  const redoLastSave = async () => {
    const checkpoint = saveRedoStack[saveRedoStack.length - 1];
    if (!checkpoint || isApplying) {
      return;
    }
    const runId = crypto.randomUUID();
    setIsApplying(true);
    try {
      for (const entry of checkpoint.entries) {
        updatePage(entry.docId, entry.pageId, {
          fileId: entry.nextFileId,
          pageIndex: entry.pageIndex,
          thumbnailUrl: entry.nextThumbnailUrl,
        });
      }
      setSaveRedoStack((prev) => prev.slice(0, -1));
      setSaveUndoStack((prev) => [...prev, checkpoint]);
      setMessage(checkpoint.entries.length > 1 ? `${ui.changesAppliedSelection} ${checkpoint.entries.length}.` : ui.changesApplied);
      setInlineUiState('saved');
      runtime.telemetry.track({
        type: 'STUDIO_EDIT_SAVE_ACTION',
        runId,
        toolId: 'studio.edit.text',
        action: 'redo',
        scope: checkpoint.entries.length > 1 ? 'selection' : 'single',
        pagesTotal: checkpoint.entries.length,
        pagesSucceeded: checkpoint.entries.length,
        pagesFailed: 0,
        message: checkpoint.entries.length > 1 ? `${ui.changesAppliedSelection} ${checkpoint.entries.length}.` : ui.changesApplied,
      });
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
      <div className="studio-edit-meta" style={{ padding: '8px 16px', background: 'rgba(15,23,42,0.4)', borderRadius: '0 0 12px 12px', marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 12 }}>
          <span className="studio-edit-page-badge">{ui.page} {preview.indexInDoc + 1}</span>
          <span className="studio-edit-page-badge">{preview.docName}</span>
          {hasDirtyChanges && <span className="studio-edit-page-badge studio-edit-message">{ui.dirty}</span>}
        </div>
        {message && (
          <span className={`studio-edit-page-badge studio-edit-message ${inlineUiState === 'error' ? 'is-error' : 'is-success'}`}>
            {message}
          </span>
        )}
      </div>

      <div className="studio-edit-canvas-wrap">
        <div
          className="studio-edit-canvas-surface"
          style={{ width: 620, height: 840, position: 'relative' }}
        >
          <img
            ref={imageRef}
            src={preview.page.thumbnailUrl}
            alt={`Page ${preview.page.pageIndex + 1}`}
            className="studio-edit-page-image"
            crossOrigin="anonymous"
            draggable={false}
            style={{ width: '100%', height: '100%', position: 'absolute', inset: 0 }}
          />
          <StudioPageEditor
            page={preview.page}
            width={620}
            height={840}
            activeTool={tool}
            elements={elements}
            onElementsChange={setElements}
            onPushHistory={pushHistory}
            selectedElementId={selectedElementId}
            onSelectedElementIdChange={setSelectedElementId}
            textEditor={textEditor}
            onTextEditorChange={setTextEditor}
            onInlineUiStateChange={setInlineUiState}
            onMessageChange={setMessage}
            onFinish={() => {
              if (textEditor) commitTextEditor();
              void applyChanges();
            }}
            onDiscard={() => {
              if (hasDirtyChanges && !window.confirm(ui.unsavedConfirm)) return;
              navigate('/studio');
            }}
          />
        </div>
        {message && (
          <div className="studio-edit-message-overlay">
            <p className="studio-edit-message-text">{message}</p>
            <button type="button" className="studio-edit-message-close" onClick={() => setMessage(null)}>
              &times;
            </button>
          </div>
        )}
      </div>
      <footer className="studio-edit-action-bar">
        <button type="button" className="studio-edit-btn-cancel" onClick={() => navigate('/studio')}>
          {ui.backToCanvas}
        </button>
        <div className="studio-edit-action-group">
          <label className="studio-edit-checkbox-label">
            <input
              type="checkbox"
              checked={applyToSelection}
              onChange={(e) => setApplyToSelection(e.target.checked)}
              disabled={!canApplyToSelection}
            />
            <span>{ui.saveSelection} ({selectedPages.length})</span>
          </label>
          <button
            type="button"
            className="studio-edit-btn-apply"
            onClick={applyChanges}
            disabled={isApplying || (historyIndex === 0 && !hasDirtyChanges)}
          >
            {isApplying ? ui.saving : ui.save}
          </button>
        </div>
      </footer>
    </section>
  );
}
