import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePlatform } from '../../../../app/react/platform-context';
import { DEFAULT_TOOL_CONTEXT } from '../../../hooks/useWizardFlow';
import { defaultFilePreviewService } from '../../../preview/preview-service';
import { PipelineRunner } from '../../../studio/pipeline/PipelineRunner';
import type { IPipelineRecipe } from '../../../studio/pipeline/types';
import { type PageItem, type StudioDocument, type StudioState, useStudioStore } from '../studio-store';

export type StudioConvertToolId = 'ocr-pdf' | 'pdf-to-jpg';
export type StudioConvertStep = 'config' | 'processing' | 'result';

export interface StudioOcrSettings {
  languageMode: 'auto' | 'manual';
  language: string;
  mode: 'accurate' | 'fast';
  preserveFormatting: boolean;
  detectTables: boolean;
  recognizeHandwriting: boolean;
  outputFormat: 'txt' | 'searchable-pdf' | 'json';
}

export interface StudioPdfToJpgSettings {
  quality: number;
  dpi: number;
}

interface StudioConvertPageRef {
  docId: string;
  docName: string;
  pageId: string;
  fileId: string;
  pageIndex: number;
  rotation: number;
  thumbnailUrl: string | null;
}

interface StudioJpgResultItem {
  outputId: string;
  name: string;
  url: string | null;
}

interface StudioOcrResult {
  kind: 'text' | 'json' | 'pdf' | 'unknown';
  content: string | null;
  pdfUrl: string | null;
  fileName: string;
}

function clampZoom(scale: number): number {
  return Math.max(0.35, Math.min(6, scale));
}

function collectSelectedPages(
  documents: StudioDocument[],
  selection: Array<{ docId: string; pageId: string }>,
): StudioConvertPageRef[] {
  const out: StudioConvertPageRef[] = [];
  for (const selected of selection) {
    const doc = documents.find((item) => item.id === selected.docId);
    if (!doc) {
      continue;
    }
    const page = doc.pages.find((item) => item.id === selected.pageId);
    if (!page) {
      continue;
    }
    out.push({
      docId: doc.id,
      docName: doc.name,
      pageId: page.id,
      fileId: page.fileId,
      pageIndex: page.pageIndex,
      rotation: page.rotation ?? 0,
      thumbnailUrl: page.thumbnailUrl || null,
    });
  }
  return out;
}

function collectDocumentPages(doc: StudioDocument): StudioConvertPageRef[] {
  return doc.pages.map((page: PageItem) => ({
    docId: doc.id,
    docName: doc.name,
    pageId: page.id,
    fileId: page.fileId,
    pageIndex: page.pageIndex,
    rotation: page.rotation ?? 0,
    thumbnailUrl: page.thumbnailUrl || null,
  }));
}

async function downloadFileById(
  runtime: ReturnType<typeof usePlatform>['runtime'],
  fileId: string,
): Promise<void> {
  const entry = await runtime.vfs.read(fileId);
  const blob = await entry.getBlob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = entry.getName();
  anchor.click();
  URL.revokeObjectURL(url);
}

function maybeJsonName(fileName: string): boolean {
  return fileName.toLowerCase().endsWith('.json');
}

function maybePdfName(fileName: string): boolean {
  return fileName.toLowerCase().endsWith('.pdf');
}

export function useStudioConvertController() {
  const { runtime } = usePlatform();
  const navigate = useNavigate();

  const documents = useStudioStore((s: StudioState) => s.documents);
  const selection = useStudioStore((s: StudioState) => s.selection);
  const activeDocumentId = useStudioStore((s: StudioState) => s.activeDocumentId);
  const studioViewScale = useStudioStore((s: StudioState) => s.studioViewScale);
  const studioViewPosition = useStudioStore((s: StudioState) => s.studioViewPosition);
  const setStudioViewport = useStudioStore((s: StudioState) => s.setStudioViewport);
  const setInteractionMode = useStudioStore((s: StudioState) => s.setInteractionMode);

  const [activeTool, setActiveTool] = useState<StudioConvertToolId | null>('ocr-pdf');
  const [step, setStep] = useState<StudioConvertStep>('config');
  const [progress, setProgress] = useState(0);
  const [ocrSettings, setOcrSettings] = useState<StudioOcrSettings>({
    languageMode: 'auto',
    language: 'eng',
    mode: 'accurate',
    preserveFormatting: true,
    detectTables: false,
    recognizeHandwriting: false,
    outputFormat: 'txt',
  });
  const [pdfToJpgSettings, setPdfToJpgSettings] = useState<StudioPdfToJpgSettings>({
    quality: 92,
    dpi: 150,
  });
  const [selectedPageIds, setSelectedPageIds] = useState<string[]>([]);
  const [thumbnailOverrides, setThumbnailOverrides] = useState<Record<string, string>>({});
  const [zoomLevel, setZoomLevel] = useState(() => clampZoom(studioViewScale || 1));
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [outputIds, setOutputIds] = useState<string[]>([]);
  const [ocrResult, setOcrResult] = useState<StudioOcrResult | null>(null);
  const [jpgResults, setJpgResults] = useState<StudioJpgResultItem[]>([]);
  const objectUrlsRef = useRef<string[]>([]);

  const isRunning = step === 'processing';

  const activeDocument = useMemo(
    () => documents.find((doc) => doc.id === activeDocumentId) ?? null,
    [activeDocumentId, documents],
  );

  const selectedScopePages = useMemo(
    () => collectSelectedPages(documents, selection),
    [documents, selection],
  );

  const operationScope: 'selection' | 'document' = selectedScopePages.length > 0 ? 'selection' : 'document';
  const targetPages = useMemo<StudioConvertPageRef[]>(() => {
    if (operationScope === 'selection') {
      return selectedScopePages;
    }
    if (!activeDocument) {
      return [];
    }
    return collectDocumentPages(activeDocument);
  }, [activeDocument, operationScope, selectedScopePages]);

  const releaseResultUrls = useCallback(() => {
    for (const url of objectUrlsRef.current) {
      URL.revokeObjectURL(url);
    }
    objectUrlsRef.current = [];
  }, []);

  useEffect(() => {
    setInteractionMode('convert');
  }, [setInteractionMode]);

  useEffect(() => {
    return () => {
      releaseResultUrls();
    };
  }, [releaseResultUrls]);

  useEffect(() => {
    if (targetPages.length === 0) {
      setSelectedPageIds([]);
      return;
    }
    setSelectedPageIds((current) => {
      if (current.length === 0) {
        return targetPages.map((page) => page.pageId);
      }
      const allowed = new Set(targetPages.map((page) => page.pageId));
      const filtered = current.filter((pageId) => allowed.has(pageId));
      return filtered.length > 0 ? filtered : targetPages.map((page) => page.pageId);
    });
  }, [targetPages]);

  useEffect(() => {
    setStudioViewport(zoomLevel, studioViewPosition);
  }, [setStudioViewport, studioViewPosition, zoomLevel]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const entries = await Promise.all(targetPages.map(async (page) => {
        if (page.thumbnailUrl) {
          return { pageId: page.pageId, thumbnailUrl: page.thumbnailUrl };
        }
        try {
          const preview = await defaultFilePreviewService.getPdfPagePreview(runtime, page.fileId, page.pageIndex + 1, { scale: 1.0 });
          return { pageId: page.pageId, thumbnailUrl: preview.thumbnailUrl };
        } catch {
          return { pageId: page.pageId, thumbnailUrl: null };
        }
      }));
      if (cancelled) {
        return;
      }
      setThumbnailOverrides((current) => {
        const next = { ...current };
        for (const entry of entries) {
          if (entry.thumbnailUrl) {
            next[entry.pageId] = entry.thumbnailUrl;
          }
        }
        return next;
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [runtime, targetPages]);

  const selectedPages = useMemo(() => {
    if (selectedPageIds.length === 0) {
      return [];
    }
    const selected = new Set(selectedPageIds);
    return targetPages.filter((page) => selected.has(page.pageId));
  }, [selectedPageIds, targetPages]);

  const previewPages = useMemo(() => {
    return targetPages.map((page) => ({
      ...page,
      thumbnailUrl: thumbnailOverrides[page.pageId] ?? page.thumbnailUrl,
      selected: selectedPageIds.includes(page.pageId),
    }));
  }, [selectedPageIds, targetPages, thumbnailOverrides]);

  const togglePage = useCallback((pageId: string) => {
    setSelectedPageIds((current) => (
      current.includes(pageId)
        ? current.filter((id) => id !== pageId)
        : [...current, pageId]
    ));
  }, []);

  const selectAllPages = useCallback(() => {
    setSelectedPageIds(targetPages.map((page) => page.pageId));
  }, [targetPages]);

  const clearPageSelection = useCallback(() => {
    setSelectedPageIds([]);
  }, []);

  const zoomIn = useCallback(() => {
    setZoomLevel((value) => clampZoom(value * 1.25));
  }, []);

  const zoomOut = useCallback(() => {
    setZoomLevel((value) => clampZoom(value / 1.25));
  }, []);

  const zoomToHundred = useCallback(() => {
    setZoomLevel(1);
  }, []);

  const fitToWidth = useCallback(() => {
    setZoomLevel(1);
  }, []);

  const buildInputForPages = useCallback(async (pages: StudioConvertPageRef[]): Promise<string[]> => {
    if (pages.length === 0) {
      return [];
    }
    const sequence = pages.map((page) => ({
      sourceFileId: page.fileId,
      pageIndex: page.pageIndex,
      rotation: page.rotation,
    }));
    const recipe: IPipelineRecipe = {
      inputs: Array.from(new Set(sequence.map((item) => item.sourceFileId))),
      operations: [{ type: 'reorder', sequence }],
      outputName: 'studio-convert-input.pdf',
    };
    const runner = new PipelineRunner(runtime.vfs);
    const result = await runner.execute(recipe);
    const payload = new Uint8Array(result.buffer.byteLength);
    payload.set(result.buffer);
    const blob = new Blob([payload], { type: 'application/pdf' });
    const entry = await runtime.vfs.write(new File([blob], result.fileName, { type: 'application/pdf' }));
    return [entry.id];
  }, [runtime.vfs]);

  const loadResultView = useCallback(async (tool: StudioConvertToolId, ids: string[], ocrOutputFormat: StudioOcrSettings['outputFormat']) => {
    releaseResultUrls();
    setOcrResult(null);
    setJpgResults([]);

    if (tool === 'pdf-to-jpg') {
      const previews = await Promise.all(ids.map(async (outputId) => {
        const entry = await runtime.vfs.read(outputId);
        const preview = await defaultFilePreviewService.getPreview(runtime, outputId);
        return {
          outputId,
          name: entry.getName(),
          url: preview.thumbnailUrl,
        } satisfies StudioJpgResultItem;
      }));
      setJpgResults(previews);
      return;
    }

    const firstOutputId = ids[0];
    if (!firstOutputId) {
      setOcrResult({ kind: 'unknown', content: null, pdfUrl: null, fileName: 'Unknown output' });
      return;
    }

    const entry = await runtime.vfs.read(firstOutputId);
    const fileName = entry.getName();
    const mimeType = await entry.getType();

    const isPdf = mimeType === 'application/pdf' || maybePdfName(fileName) || ocrOutputFormat === 'searchable-pdf';
    if (isPdf) {
      const blob = await entry.getBlob();
      const pdfUrl = URL.createObjectURL(blob);
      objectUrlsRef.current.push(pdfUrl);
      setOcrResult({ kind: 'pdf', content: null, pdfUrl, fileName });
      return;
    }

    const text = await entry.getText();
    const isJson = mimeType === 'application/json' || maybeJsonName(fileName) || ocrOutputFormat === 'json';
    setOcrResult({
      kind: isJson ? 'json' : 'text',
      content: text,
      pdfUrl: null,
      fileName,
    });
  }, [releaseResultUrls, runtime]);

  const updateOcrResultContent = useCallback((content: string) => {
    setOcrResult((current) => current ? { ...current, content } : null);
  }, []);

  const resetWorkspace = useCallback(() => {
    releaseResultUrls();
    setStep('config');
    setProgress(0);
    setError(null);
    setMessage(null);
    setOutputIds([]);
    setOcrResult(null);
    setJpgResults([]);
  }, [releaseResultUrls]);

  const runTool = useCallback(async () => {
    if (!activeTool || selectedPages.length === 0 || isRunning) {
      return;
    }

    resetWorkspace();
    setStep('processing');

    try {
      const inputIds = await buildInputForPages(selectedPages);
      if (inputIds.length === 0) {
        setError('No pages selected for conversion.');
        setStep('config');
        return;
      }

      const options: Record<string, unknown> = activeTool === 'ocr-pdf'
        ? {
          languageMode: ocrSettings.languageMode,
          language: ocrSettings.language,
          mode: ocrSettings.mode,
          outputFormat: ocrSettings.outputFormat,
          preserveFormatting: ocrSettings.preserveFormatting,
          detectTables: ocrSettings.detectTables,
          recognizeHandwriting: ocrSettings.recognizeHandwriting,
        }
        : {
          quality: pdfToJpgSettings.quality,
          dpi: pdfToJpgSettings.dpi,
        };

      const result = await runtime.runner.execute(
        activeTool,
        { inputIds, options },
        DEFAULT_TOOL_CONTEXT,
        (event) => {
          if (event.type === 'TOOL_PROGRESS') {
            setProgress(Math.max(0, Math.min(100, Math.round(event.progress))));
          }
        },
      );

      if (result.type === 'TOOL_ACCESS_DENIED') {
        setError(result.details ?? result.reason);
        setStep('config');
        return;
      }
      if (result.type === 'TOOL_ERROR') {
        setError(result.message);
        setStep('config');
        return;
      }

      setProgress(100);
      setOutputIds(result.outputIds);
      await loadResultView(activeTool, result.outputIds, ocrSettings.outputFormat);
      setMessage(activeTool === 'ocr-pdf' ? 'OCR completed.' : 'PDF to JPG completed.');
      setStep('result');
    } catch (runError) {
      const runMessage = runError instanceof Error ? runError.message : 'Conversion failed.';
      setError(runMessage);
      setStep('config');
    }
  }, [
    activeTool,
    buildInputForPages,
    isRunning,
    loadResultView,
    ocrSettings.detectTables,
    ocrSettings.language,
    ocrSettings.languageMode,
    ocrSettings.mode,
    ocrSettings.outputFormat,
    ocrSettings.preserveFormatting,
    ocrSettings.recognizeHandwriting,
    pdfToJpgSettings.dpi,
    pdfToJpgSettings.quality,
    resetWorkspace,
    runtime.runner,
    selectedPages,
  ]);

  const downloadResults = useCallback(async () => {
    if (activeTool === 'ocr-pdf' && ocrResult && (ocrResult.kind === 'text' || ocrResult.kind === 'json')) {
      const text = ocrResult.content || '';
      const blob = new Blob([text], { type: ocrResult.kind === 'json' ? 'application/json' : 'text/plain' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = ocrResult.fileName;
      anchor.click();
      URL.revokeObjectURL(url);
      return;
    }

    for (const outputId of outputIds) {
      await downloadFileById(runtime, outputId);
    }
  }, [activeTool, ocrResult, outputIds, runtime]);

  const navigateBack = useCallback(() => {
    setInteractionMode('convert');
    navigate('/studio');
  }, [navigate, setInteractionMode]);

  return {
    activeDocument,
    activeTool,
    setActiveTool,
    step,
    progress,
    ocrSettings,
    setOcrSettings,
    pdfToJpgSettings,
    setPdfToJpgSettings,
    operationScope,
    previewPages,
    selectedPageIds,
    selectedPages,
    togglePage,
    selectAllPages,
    clearPageSelection,
    zoomLevel,
    setZoomLevel,
    zoomIn,
    zoomOut,
    zoomToHundred,
    fitToWidth,
    isRunning,
    error,
    setError,
    message,
    setMessage,
    outputIds,
    ocrResult,
    jpgResults,
    updateOcrResultContent,
    runTool,
    downloadResults,
    resetWorkspace,
    navigateBack,
  };
}
