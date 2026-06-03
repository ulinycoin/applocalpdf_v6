import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { usePlatform } from '../../../app/react/platform-context';
import { useStudioStore, type StudioState } from './studio-store';
import { useHistoryStore } from './store/history-store';
import { getStudioEditMessages } from './studio-edit-i18n';
import { StudioTextSettingsPanel } from './edit/StudioTextSettingsPanel';
import { StudioAnnotateSettingsPanel } from './edit/StudioAnnotateSettingsPanel';
import { StudioSignSettingsPanel } from './edit/StudioSignSettingsPanel';
import { StudioWatermarkSettingsPanel } from './edit/StudioWatermarkSettingsPanel';
import { StudioWhiteoutSettingsPanel } from './edit/StudioWhiteoutSettingsPanel';
import { StudioProtectSettingsPanel } from './edit/StudioProtectSettingsPanel';
import { StudioFormsQuickBar } from './edit/StudioFormsQuickBar';
import { StudioOcrSettingsPanel } from './convert/StudioOcrSettingsPanel';
import { StudioPdfToJpgSettingsPanel } from './convert/StudioPdfToJpgSettingsPanel';
import { StudioCompressPdfSettingsPanel } from './convert/StudioCompressPdfSettingsPanel';
import { StudioExtractImagesSettingsPanel, type ExtractPagePreview } from './convert/StudioExtractImagesSettingsPanel';
import { LinearIcon } from '../icons/linear-icon';
import { StudioDialog } from './StudioDialog';
import type { StudioEditToolId } from './studio-store';
import type {
    EditElement,
    FormFieldElement,
    ImageElement,
    WatermarkElement,
    TextEditorState,
    InlineUiState,
    ShapePreset,
} from './editor-types';
import type { FontFamilyId } from './inline-text-utils';
import { normalizeTextLayerSpans } from './inline-text-utils';
import { requestTextLayerSpans, requestTextLayerSpansFallback } from '../../pdf/text-layer-client';
import { defaultFilePreviewService } from '../../preview/preview-service';
import { PipelineRunner } from '../../studio/pipeline/PipelineRunner';
import type { IPipelineRecipe } from '../../studio/pipeline/types';
import { requestPdfImageCandidates } from '../../pdf/image-candidate-client';
import type { WorkerPdfImageCandidate } from '../../../core/public/contracts';
import { createZipBlob } from '../../utils/zip';
import { showStudioPaywall } from '../../../app/react/studio-paywall';
import type { StudioPageEditorHandle } from './StudioPageEditor';
import { useStudioEditController } from './edit/use-studio-edit-controller';
import type {
    StudioOcrSettings,
    StudioPdfToJpgSettings,
    StudioExtractImagesSettings,
    StudioCompressPdfSettings,
    StudioConvertToolId,
    StudioConvertStep,
} from './convert/use-studio-convert-controller';

export type StudioInlineToolId = StudioEditToolId | StudioConvertToolId;

const EDIT_TOOLS: StudioEditToolId[] = ['text', 'annotate', 'sign', 'whiteout', 'watermark', 'forms', 'protect'];
const CONVERT_TOOLS: StudioConvertToolId[] = ['ocr-pdf', 'pdf-to-jpg', 'extract-images', 'compress-pdf'];

function isEditTool(id: StudioInlineToolId): id is StudioEditToolId {
    return (EDIT_TOOLS as string[]).includes(id);
}

function isConvertTool(id: StudioInlineToolId): id is StudioConvertToolId {
    return (CONVERT_TOOLS as string[]).includes(id);
}

function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

interface ExtractImageCandidate extends WorkerPdfImageCandidate {
    fileId: string;
    pageId: string;
    pageIndex: number;
    globalId: string;
}

interface ConvertPageRef {
    docId: string;
    pageId: string;
    fileId: string;
    pageIndex: number;
    rotation: number;
    thumbnailUrl: string | null;
}

interface StudioInlinePanelProps {
    activeTool: StudioInlineToolId;
    editorRef: React.RefObject<StudioPageEditorHandle | null>;
    elements: EditElement[];
    setElements: (els: EditElement[]) => void;
    selectedElementId: string | null;
    setSelectedElementId: (id: string | null) => void;
    textEditor: TextEditorState | null;
    inlineUiState: InlineUiState;
    isApplying: boolean;
    hasPendingDrawnSignature: boolean;
    hasPendingAnnotatePenDraft: boolean;
    onSave: () => void;
    onDiscard: () => void;
    onClose: () => void;
    // edit controller passthrough
    ctrl: ReturnType<typeof useStudioEditController>;
    canvasSize: { width: number; height: number };
}

export function StudioInlinePanel({
    activeTool,
    editorRef,
    elements,
    setElements,
    selectedElementId,
    setSelectedElementId,
    isApplying,
    hasPendingDrawnSignature,
    hasPendingAnnotatePenDraft,
    onSave,
    onDiscard,
    onClose,
    ctrl,
    canvasSize,
}: StudioInlinePanelProps) {
    const { runtime } = usePlatform();
    const [billingContext, setBillingContext] = useState(() => runtime.billing.getContext());

    useEffect(() => {
        return runtime.billing.subscribe((ctx) => {
            setBillingContext(ctx);
        });
    }, [runtime.billing]);

    const isPro = billingContext.plan === 'pro';
    const ui = useMemo(() => getStudioEditMessages(), []);
    const documents = useStudioStore((s: StudioState) => s.documents);
    const selection = useStudioStore((s: StudioState) => s.selection);
    const activeDocumentId = useStudioStore((s: StudioState) => s.activeDocumentId);
    const updatePage = useStudioStore((s: StudioState) => s.updatePage);
    const addDocument = useStudioStore((s: StudioState) => s.addDocument);
    const setDocuments = useStudioStore((s: StudioState) => s.setDocuments);
    const createCheckpoint = useHistoryStore((s) => s.createCheckpoint);

    // Convert state
    const [convertStep, setConvertStep] = useState<StudioConvertStep>('config');
    const [convertProgress, setConvertProgress] = useState(0);
    const [convertError, setConvertError] = useState<string | null>(null);
    const [convertMessage, setConvertMessage] = useState<string | null>(null);
    const [outputIds, setOutputIds] = useState<string[]>([]);
    const [ocrSettings, setOcrSettings] = useState<StudioOcrSettings>({
        languageMode: 'auto', language: 'eng', mode: 'accurate',
        preserveFormatting: true, detectTables: false, outputFormat: 'txt',
    });
    const [pdfToJpgSettings, setPdfToJpgSettings] = useState<StudioPdfToJpgSettings>({ quality: 92, dpi: 150 });
    const [extractImagesSettings, setExtractImagesSettings] = useState<StudioExtractImagesSettings>({
        format: 'png', jpegQuality: 0.92, minWidth: 32, minHeight: 32,
        includeInlineImages: true, dedupe: true,
    });
    const [compressPdfSettings, setCompressPdfSettings] = useState<StudioCompressPdfSettings>({ quality: 'medium' });
    const [jpgResults, setJpgResults] = useState<Array<{ outputId: string; name: string; url: string | null }>>([]);
    const [ocrResult, setOcrResult] = useState<{ kind: 'text' | 'json' | 'pdf' | 'unknown'; content: string | null; pdfUrl: string | null; fileName: string } | null>(null);
    const [compressResultSummary, setCompressResultSummary] = useState<{ inputBytes: number; outputBytes: number; outputFileName: string } | null>(null);
    const [imageCandidatesByPage, setImageCandidatesByPage] = useState<Record<string, ExtractImageCandidate[]>>({});
    const [selectedImageIds, setSelectedImageIds] = useState<string[]>([]);
    const [imageScanPendingByPage, setImageScanPendingByPage] = useState<Record<string, boolean>>({});
    const [selectedPageIds, setSelectedPageIds] = useState<string[]>([]);
    const [pendingDiscard, setPendingDiscard] = useState<(() => void) | null>(null);
    const objectUrlsRef = useRef<string[]>([]);
    const imageScanPendingRef = useRef<Record<string, boolean>>({});

    const activeDocument = useMemo(
        () => documents.find((d) => d.id === activeDocumentId) ?? null,
        [activeDocumentId, documents],
    );

    const selectedScopePages = useMemo<ConvertPageRef[]>(() => {
        const out: ConvertPageRef[] = [];
        for (const sel of selection) {
            const doc = documents.find((d) => d.id === sel.docId);
            const page = doc?.pages.find((p) => p.id === sel.pageId);
            if (doc && page) {
                out.push({ docId: doc.id, pageId: page.id, fileId: page.fileId, pageIndex: page.pageIndex, rotation: page.rotation ?? 0, thumbnailUrl: page.thumbnailUrl || null });
            }
        }
        return out;
    }, [documents, selection]);

    const documentPages = useMemo<ConvertPageRef[]>(() => {
        if (!activeDocument) return [];
        return activeDocument.pages.map((p) => ({
            docId: activeDocument.id, pageId: p.id, fileId: p.fileId,
            pageIndex: p.pageIndex, rotation: p.rotation ?? 0, thumbnailUrl: p.thumbnailUrl || null,
        }));
    }, [activeDocument]);

    const operationScope: 'selection' | 'document' =
        activeTool === 'compress-pdf' ? 'document'
            : selectedScopePages.length > 0 ? 'selection'
                : 'document';

    const targetPages = useMemo<ConvertPageRef[]>(() => (
        operationScope === 'selection' ? selectedScopePages : documentPages
    ), [operationScope, selectedScopePages, documentPages]);

    // Sync selectedPageIds when targetPages change
    useEffect(() => {
        if (!isConvertTool(activeTool)) return;
        if (targetPages.length === 0) { setSelectedPageIds([]); return; }
        if (activeTool === 'compress-pdf') { setSelectedPageIds(targetPages.map((p) => p.pageId)); return; }
        setSelectedPageIds((current) => {
            if (current.length === 0) return targetPages.map((p) => p.pageId);
            const allowed = new Set(targetPages.map((p) => p.pageId));
            const filtered = current.filter((id) => allowed.has(id));
            return filtered.length > 0 ? filtered : targetPages.map((p) => p.pageId);
        });
    }, [activeTool, targetPages]);

    const selectedConvertPages = useMemo<ConvertPageRef[]>(() => {
        if (activeTool === 'compress-pdf') return targetPages;
        const set = new Set(selectedPageIds);
        return targetPages.filter((p) => set.has(p.pageId));
    }, [activeTool, selectedPageIds, targetPages]);

    const extractImageCandidates = useMemo(() => Object.values(imageCandidatesByPage).flat(), [imageCandidatesByPage]);
    const selectedExtractImageCandidates = useMemo(() => {
        const set = new Set(selectedImageIds);
        return extractImageCandidates.filter((c) => set.has(c.globalId));
    }, [extractImageCandidates, selectedImageIds]);

    const selectedImageIdsSet = useMemo(() => new Set(selectedImageIds), [selectedImageIds]);

    const extractPagePreviews = useMemo<ExtractPagePreview[]>(() => {
        return selectedConvertPages.map((p) => ({
            pageId: p.pageId,
            thumbnailUrl: p.thumbnailUrl,
            candidates: (imageCandidatesByPage[p.pageId] ?? []).map((c) => ({
                globalId: c.globalId,
                xRatio: c.xRatio,
                yRatio: c.yRatio,
                widthRatio: c.widthRatio,
                heightRatio: c.heightRatio,
                pixelWidth: c.pixelWidth,
                pixelHeight: c.pixelHeight,
            })),
            isScanning: !!imageScanPendingByPage[p.pageId],
        }));
    }, [selectedConvertPages, imageCandidatesByPage, imageScanPendingByPage]);

    const handleToggleImage = useCallback((globalId: string) => {
        setSelectedImageIds((cur) => {
            const next = new Set(cur);
            if (next.has(globalId)) { next.delete(globalId); } else { next.add(globalId); }
            return Array.from(next);
        });
    }, []);

    const handleSelectAllImages = useCallback(() => {
        setSelectedImageIds(extractImageCandidates.map((c) => c.globalId));
    }, [extractImageCandidates]);

    const handleDeselectAllImages = useCallback(() => {
        setSelectedImageIds([]);
    }, []);

    // Extract-images scanning
    useEffect(() => {
        imageScanPendingRef.current = imageScanPendingByPage;
    }, [imageScanPendingByPage]);

    useEffect(() => {
        if (activeTool !== 'extract-images' || convertStep !== 'config') return;
        const pagesToScan = selectedConvertPages.filter((p) => !imageCandidatesByPage[p.pageId] && !imageScanPendingRef.current[p.pageId]);
        for (const page of pagesToScan) {
            imageScanPendingRef.current = { ...imageScanPendingRef.current, [page.pageId]: true };
            setImageScanPendingByPage((cur) => ({ ...cur, [page.pageId]: true }));
            void (async () => {
                try {
                    const candidates = await requestPdfImageCandidates(runtime, page.fileId, page.pageIndex + 1, new AbortController().signal);
                    const mapped = candidates.map((c) => ({ ...c, fileId: page.fileId, pageId: page.pageId, pageIndex: page.pageIndex, globalId: `${page.pageId}::${c.id}` }));
                    setImageCandidatesByPage((cur) => ({ ...cur, [page.pageId]: mapped }));
                    setSelectedImageIds((cur) => {
                        const next = new Set(cur);
                        for (const c of mapped) { next.add(c.globalId); }
                        return Array.from(next);
                    });
                } catch {
                    // silent
                } finally {
                    imageScanPendingRef.current = Object.fromEntries(Object.entries(imageScanPendingRef.current).filter(([id]) => id !== page.pageId));
                    setImageScanPendingByPage((cur) => { const next = { ...cur }; delete next[page.pageId]; return next; });
                }
            })();
        }
    }, [activeTool, convertStep, selectedConvertPages, imageCandidatesByPage, runtime]);

    // Cleanup object URLs on unmount
    useEffect(() => () => { for (const url of objectUrlsRef.current) URL.revokeObjectURL(url); }, []);

    // Reset convert state when tool changes
    useEffect(() => {
        if (!isConvertTool(activeTool)) return;
        setConvertStep('config');
        setConvertProgress(0);
        setConvertError(null);
        setConvertMessage(null);
        setOutputIds([]);
        setOcrResult(null);
        setCompressResultSummary(null);
        setJpgResults([]);
    }, [activeTool]);

    const buildInputForPages = useCallback(async (pages: ConvertPageRef[]): Promise<string[]> => {
        if (pages.length === 0) return [];
        const sequence = pages.map((p) => ({ sourceFileId: p.fileId, pageIndex: p.pageIndex, rotation: p.rotation }));
        const recipe: IPipelineRecipe = {
            inputs: Array.from(new Set(sequence.map((item) => item.sourceFileId))),
            operations: [{ type: 'reorder', sequence }],
            outputName: 'studio-convert-input.pdf',
        };
        const runner = new PipelineRunner(runtime.vfs);
        const result = await runner.execute(recipe);
        const blob = new Blob([result.buffer.buffer as ArrayBuffer], { type: 'application/pdf' });
        const entry = await runtime.vfs.write(new File([blob], result.fileName, { type: 'application/pdf' }));
        return [entry.id];
    }, [runtime.vfs]);

    const runConvert = useCallback(async () => {
        if (!isConvertTool(activeTool) || selectedConvertPages.length === 0 || convertStep === 'processing') return;
        setConvertStep('processing');
        setConvertProgress(0);
        setConvertError(null);
        setConvertMessage(null);
        try {
            const inputIds = activeTool === 'extract-images'
                ? Array.from(new Set(selectedConvertPages.map((p) => p.fileId)))
                : activeTool === 'compress-pdf'
                    ? Array.from(new Set(targetPages.map((p) => p.fileId)))
                    : await buildInputForPages(selectedConvertPages);

            if (activeTool === 'extract-images' && selectedExtractImageCandidates.length === 0) {
                setConvertError('No images selected for extraction.');
                setConvertStep('config');
                return;
            }

            const options: Record<string, unknown> = activeTool === 'ocr-pdf'
                ? { ...ocrSettings }
                : activeTool === 'pdf-to-jpg'
                    ? { ...pdfToJpgSettings }
                    : activeTool === 'compress-pdf'
                        ? { quality: compressPdfSettings.quality }
                        : {
                            ...extractImagesSettings,
                            selectedCandidates: selectedExtractImageCandidates.map((c) => ({ fileId: c.fileId, pageNumber: c.pageNumber, candidateId: c.id })),
                        };

            const result = await runtime.runner.execute(
                activeTool,
                { inputIds, options },
                runtime.billing.getContext(),
                (event) => { if (event.type === 'TOOL_PROGRESS') setConvertProgress(Math.max(0, Math.min(100, Math.round(event.progress)))); },
            );

            if (result.type === 'TOOL_ACCESS_DENIED') { setConvertError(result.details ?? result.reason); setConvertStep('config'); return; }
            if (result.type === 'TOOL_ERROR') { setConvertError(result.message); setConvertStep('config'); return; }

            setConvertProgress(100);
            setOutputIds(result.outputIds);

            // Load result view
            if (activeTool === 'pdf-to-jpg' || activeTool === 'extract-images') {
                const previews = await Promise.all(result.outputIds.map(async (id) => {
                    const entry = await runtime.vfs.read(id);
                    const preview = await defaultFilePreviewService.getPreview(runtime, id);
                    return { outputId: id, name: entry.getName(), url: preview.thumbnailUrl };
                }));
                setJpgResults(previews);
            } else if (activeTool === 'compress-pdf') {
                const inputEntries = await Promise.all(inputIds.map((id) => runtime.vfs.read(id)));
                const outputEntry = result.outputIds[0] ? await runtime.vfs.read(result.outputIds[0]) : null;
                const inputBytes = (await Promise.all(inputEntries.map((e) => e.getSize()))).reduce((s, v) => s + v, 0);
                const outputBytes = outputEntry ? await outputEntry.getSize() : 0;
                setCompressResultSummary({ inputBytes, outputBytes, outputFileName: outputEntry?.getName() ?? 'document-compressed.pdf' });
            } else if (activeTool === 'ocr-pdf') {
                const firstId = result.outputIds[0];
                if (firstId) {
                    const entry = await runtime.vfs.read(firstId);
                    const fileName = entry.getName();
                    const isPdf = ocrSettings.outputFormat === 'searchable-pdf' || fileName.toLowerCase().endsWith('.pdf');
                    if (isPdf) {
                        const blob = await entry.getBlob();
                        const pdfUrl = URL.createObjectURL(blob);
                        objectUrlsRef.current.push(pdfUrl);
                        setOcrResult({ kind: 'pdf', content: null, pdfUrl, fileName });
                    } else {
                        const text = await entry.getText();
                        setOcrResult({ kind: ocrSettings.outputFormat === 'json' ? 'json' : 'text', content: text, pdfUrl: null, fileName });
                    }
                }
            }

            setConvertMessage(
                activeTool === 'ocr-pdf' ? 'OCR completed.'
                    : activeTool === 'pdf-to-jpg' ? 'PDF to JPG completed.'
                        : activeTool === 'compress-pdf' ? 'Compression completed.'
                            : 'Image extraction completed.',
            );
            setConvertStep('result');
        } catch (err) {
            setConvertError(err instanceof Error ? err.message : 'Conversion failed.');
            setConvertStep('config');
        }
    }, [activeTool, selectedConvertPages, convertStep, targetPages, buildInputForPages, selectedExtractImageCandidates, ocrSettings, pdfToJpgSettings, compressPdfSettings, extractImagesSettings, runtime]);

    const downloadResults = useCallback(async () => {
        const baseName = activeDocument?.name || 'converted';
        if (activeTool === 'ocr-pdf' && ocrResult && (ocrResult.kind === 'text' || ocrResult.kind === 'json')) {
            const ext = ocrResult.kind === 'json' ? '.json' : '.txt';
            const blob = new Blob([ocrResult.content || ''], { type: ocrResult.kind === 'json' ? 'application/json' : 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a'); a.href = url; a.download = `${baseName}${ext}`; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
            return;
        }
        if (activeTool === 'extract-images' && outputIds.length > 2) {
            const entries = await Promise.all(outputIds.map(async (id) => ({ name: (await runtime.vfs.read(id)).getName(), blob: await (await runtime.vfs.read(id)).getBlob() })));
            const zipBlob = await createZipBlob(entries);
            const url = URL.createObjectURL(zipBlob);
            const a = document.createElement('a'); a.href = url; a.download = `${baseName}.zip`; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
            return;
        }
        for (let i = 0; i < outputIds.length; i++) {
            const id = outputIds[i]!;
            const entry = await runtime.vfs.read(id);
            const suffix = outputIds.length > 1 ? `_${i + 1}` : '';
            const name = activeTool === 'extract-images' ? entry.getName() : `${baseName}${suffix}${activeTool === 'pdf-to-jpg' ? '.jpg' : '.pdf'}`;
            const blob = await entry.getBlob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
        }
    }, [activeTool, activeDocument?.name, ocrResult, outputIds, runtime]);

    // Edit tool derived state
    const selectedTextElement = selectedElementId
        ? elements.find((e) => e.id === selectedElementId && e.type === 'text') as import('./editor-types').TextElement | undefined
        : undefined;
    const selectedRectElement = selectedElementId
        ? elements.find((e) => e.id === selectedElementId && e.type === 'rect') as import('./editor-types').RectElement | undefined
        : undefined;
    const selectedStrokeElement = selectedElementId
        ? elements.find((e) => e.id === selectedElementId && e.type === 'stroke') as import('./editor-types').StrokeElement | undefined
        : undefined;
    const selectedFormField = selectedElementId
        ? elements.find((e): e is FormFieldElement => e.id === selectedElementId && e.type === 'form-field') ?? null
        : null;
    const selectedWatermark = selectedElementId
        ? elements.find((e): e is WatermarkElement => e.id === selectedElementId && e.type === 'watermark') ?? null
        : null;

    const hasPendingChanges = elements.length > 0 || ctrl.historyIndex > 0 || hasPendingDrawnSignature || hasPendingAnnotatePenDraft;

    const handleSaveEdit = useCallback(() => {
        if (ctrl.tool === 'sign' && ctrl.signMode === 'draw') {
            flushSync(() => { editorRef.current?.commitPendingSignDraft(); });
        }
        if (ctrl.tool === 'annotate' && ctrl.annotateMode === 'pen') {
            flushSync(() => { editorRef.current?.commitPendingAnnotatePenDraft(); });
        }
        onSave();
    }, [ctrl.tool, ctrl.signMode, ctrl.annotateMode, editorRef, onSave]);

    const handleDiscardEdit = useCallback(() => {
        if (hasPendingChanges) {
            setPendingDiscard(() => onDiscard);
            return;
        }
        onDiscard();
    }, [hasPendingChanges, onDiscard]);

    const handleUpdateWatermarkOptions = useCallback((next: typeof ctrl.watermarkOptions) => {
        ctrl.setWatermarkOptions(next);
        if (!selectedWatermark) return;
        const patched = elements.map((e) => e.id === selectedWatermark.id && e.type === 'watermark' ? { ...e, ...next } : e);
        setElements(patched);
        ctrl.pushHistory(patched);
    }, [ctrl, selectedWatermark, elements, setElements]);

    const handleFormFieldUpdate = useCallback((patch: Partial<FormFieldElement>) => {
        if (!selectedFormField) return;
        const next = elements.map((e) => e.id === selectedFormField.id && e.type === 'form-field' ? { ...e, ...patch } : e);
        setElements(next);
        ctrl.pushHistory(next);
    }, [ctrl, elements, selectedFormField, setElements]);

    if (!isEditTool(activeTool) && !isConvertTool(activeTool)) return null;

    // ── Settings panel content ──────────────────────────────────────────────

    let settingsContent: React.ReactNode = null;

    if (activeTool === 'text') {
        settingsContent = (
            <StudioTextSettingsPanel
                title={ui.text}
                fontFamilyLabel={ui.textFontFamily}
                fontSizeLabel={ui.textFontSize}
                textColorLabel={ui.textColor}
                bgColorLabel={ui.textBackgroundColor}
                fontFamily={selectedTextElement?.fontFamily ?? ctrl.textStyle.fontFamily}
                fontSize={selectedTextElement?.fontSize ?? ctrl.textStyle.fontSize}
                fontWeight={selectedTextElement?.fontWeight ?? ctrl.textStyle.fontWeight}
                fontStyle={selectedTextElement?.fontStyle ?? ctrl.textStyle.fontStyle}
                lineHeight={selectedTextElement?.lineHeight ?? ctrl.textStyle.lineHeight}
                letterSpacing={selectedTextElement?.letterSpacing ?? ctrl.textStyle.letterSpacing}
                color={selectedTextElement?.color ?? ctrl.textStyle.color}
                backgroundColor={(() => {
                    const bgId = `${ctrl.selectedElementId}_bg`;
                    const bg = elements.find((e) => e.id === bgId && e.type === 'rect') as import('./editor-types').RectElement | undefined;
                    return bg?.fill ?? ctrl.textStyle.backgroundColor;
                })()}
                onStyleChange={(patch) => {
                    if (ctrl.selectedElementId) {
                        ctrl.handleElementAction(ctrl.selectedElementId, 'update', patch);
                        if (patch.backgroundColor) {
                            const bgId = `${ctrl.selectedElementId}_bg`;
                            const next = elements.map((e) => e.id === bgId && e.type === 'rect' ? { ...e, fill: patch.backgroundColor as string } : e);
                            setElements(next);
                        }
                    } else {
                        ctrl.setTextStyle({ ...ctrl.textStyle, ...patch });
                    }
                }}
                onDelete={ctrl.selectedElementId ? () => { ctrl.handleElementAction(ctrl.selectedElementId!, 'delete'); } : undefined}
                onDuplicate={ctrl.selectedElementId ? () => { ctrl.handleElementAction(ctrl.selectedElementId!, 'duplicate'); } : undefined}
            />
        );
    } else if (activeTool === 'annotate') {
        settingsContent = (
            <StudioAnnotateSettingsPanel
                title={ui.annotate}
                highlightLabel={ui.annotateHighlight}
                markerLabel={ui.annotateMarker}
                penLabel={ui.annotatePen}
                shapesLabel={ui.shapes}
                shapeLabel={ui.shapeRectangle}
                lineLabel={ui.shapeLine}
                arrowLabel={ui.shapeArrow}
                shapeThicknessLabel={ui.shapeThickness}
                penSizeLabel={ui.annotatePenSize}
                customColorLabel={ui.annotateCustomColor}
                color={(() => {
                    if (selectedRectElement) return selectedRectElement.fill || selectedRectElement.stroke;
                    if (selectedStrokeElement) return selectedStrokeElement.color;
                    return ctrl.annotateMode === 'shapes' ? ctrl.shapeColor : ctrl.annotateColor;
                })()}
                mode={ctrl.annotateMode}
                shapePreset={ctrl.shapePreset}
                strokeWidth={(() => {
                    if (selectedRectElement) return selectedRectElement.strokeWidth;
                    if (selectedStrokeElement) return selectedStrokeElement.width;
                    return ctrl.annotateMode === 'shapes' ? ctrl.shapeStrokeWidth : ctrl.annotateStrokeWidth;
                })()}
                onColorChange={(next) => {
                    if (selectedRectElement) { ctrl.handleElementAction(selectedRectElement.id, 'update', { fill: selectedRectElement.fill !== 'transparent' ? next : 'transparent', stroke: selectedRectElement.stroke !== 'transparent' ? next : 'transparent' }); return; }
                    if (selectedStrokeElement) { ctrl.handleElementAction(selectedStrokeElement.id, 'update', { color: next }); return; }
                    if (ctrl.annotateMode === 'shapes') { ctrl.setShapeColor(next); return; }
                    ctrl.setAnnotateColor(next);
                }}
                onModeChange={ctrl.setAnnotateMode}
                onShapePresetChange={ctrl.setShapePreset}
                onStrokeWidthChange={(next) => {
                    if (selectedRectElement) { ctrl.handleElementAction(selectedRectElement.id, 'update', { strokeWidth: next }); return; }
                    if (selectedStrokeElement) { ctrl.handleElementAction(selectedStrokeElement.id, 'update', { width: next }); return; }
                    if (ctrl.annotateMode === 'shapes') { ctrl.setShapeStrokeWidth(next); return; }
                    ctrl.setAnnotateStrokeWidth(next);
                }}
                onInsertPen={() => { flushSync(() => { editorRef.current?.commitPendingAnnotatePenDraft(); }); }}
                onClearPen={() => { editorRef.current?.clearPendingAnnotatePenDraft(); }}
                hasPendingPenDraft={hasPendingAnnotatePenDraft}
                onDelete={ctrl.selectedElementId ? () => { ctrl.handleElementAction(ctrl.selectedElementId!, 'delete'); } : undefined}
                onDuplicate={ctrl.selectedElementId ? () => { ctrl.handleElementAction(ctrl.selectedElementId!, 'duplicate'); } : undefined}
            />
        );
    } else if (activeTool === 'sign') {
        const selectedImageElement = selectedElementId
            ? elements.find((e) => e.id === selectedElementId && e.type === 'image') as ImageElement | undefined
            : undefined;
        const selectedTypedSignature = selectedImageElement?.signatureSource === 'typed' && selectedImageElement.typedSignatureMeta ? selectedImageElement : undefined;

        settingsContent = (
            <StudioSignSettingsPanel
                title={ui.sign}
                mode={ctrl.signMode}
                typedValue={ctrl.signTypedValue}
                typedFontSize={ctrl.signTypedFontSize}
                drawColor={ctrl.signDrawColor}
                drawStrokeWidth={ctrl.signDrawStrokeWidth}
                onModeChange={ctrl.setSignMode}
                onTypedValueChange={ctrl.setSignTypedValue}
                onTypedFontSizeChange={(next) => {
                    const normalized = Math.max(12, Math.min(96, Math.round(next || 30)));
                    if (ctrl.signMode === 'type' && selectedTypedSignature?.typedSignatureMeta) {
                        const prevSize = Math.max(12, Math.min(96, Math.round(ctrl.signTypedFontSize || 30)));
                        const scale = normalized / prevSize;
                        const aspect = Math.max(0.05, selectedTypedSignature.w / Math.max(0.01, selectedTypedSignature.h));
                        let nextW = Math.max(0.04, selectedTypedSignature.w * scale);
                        let nextH = nextW / aspect;
                        if (nextH > 1 - selectedTypedSignature.y) { nextH = 1 - selectedTypedSignature.y; nextW = nextH * aspect; }
                        ctrl.handleElementAction(selectedTypedSignature.id, 'update', { w: nextW, h: nextH });
                    }
                    ctrl.setSignTypedFontSize(normalized);
                }}
                onDrawColorChange={ctrl.setSignDrawColor}
                onDrawStrokeWidthChange={ctrl.setSignDrawStrokeWidth}
                onInsertTyped={ctrl.insertTypedSignature}
                onInsertDrawn={() => { flushSync(() => { editorRef.current?.commitPendingSignDraft(); }); }}
                onClearDrawn={() => { editorRef.current?.clearPendingSignDraft(); }}
                onUploadImage={ctrl.addImageSignature}
                hasPendingDrawnSignature={hasPendingDrawnSignature}
                onDelete={ctrl.selectedElementId ? () => { ctrl.handleElementAction(ctrl.selectedElementId!, 'delete'); } : undefined}
                onDuplicate={ctrl.selectedElementId ? () => { ctrl.handleElementAction(ctrl.selectedElementId!, 'duplicate'); } : undefined}
            />
        );
    } else if (activeTool === 'watermark') {
        settingsContent = (
            <StudioWatermarkSettingsPanel
                options={ctrl.watermarkOptions}
                onOptionsChange={handleUpdateWatermarkOptions}
            />
        );
    } else if (activeTool === 'whiteout') {
        settingsContent = (
            <StudioWhiteoutSettingsPanel
                title={ui.whiteout}
                customColorLabel={ui.whiteoutCustomColor}
                color={selectedRectElement?.fill ?? ctrl.whiteoutColor}
                onColorChange={(next) => {
                    if (selectedRectElement) { ctrl.handleElementAction(selectedRectElement.id, 'update', { fill: next }); }
                    else { ctrl.setWhiteoutColor(next); }
                }}
                onDelete={ctrl.selectedElementId ? () => { ctrl.handleElementAction(ctrl.selectedElementId!, 'delete'); } : undefined}
                onDuplicate={ctrl.selectedElementId ? () => { ctrl.handleElementAction(ctrl.selectedElementId!, 'duplicate'); } : undefined}
            />
        );
    } else if (activeTool === 'forms') {
        settingsContent = (
            <StudioFormsQuickBar
                onAddField={ctrl.addFormField}
                selectedField={selectedFormField}
                onUpdateSelectedField={handleFormFieldUpdate}
                canvasWidth={canvasSize.width}
                canvasHeight={canvasSize.height}
                onDelete={ctrl.selectedElementId ? () => { ctrl.handleElementAction(ctrl.selectedElementId!, 'delete'); } : undefined}
                onDuplicate={ctrl.selectedElementId ? () => { ctrl.handleElementAction(ctrl.selectedElementId!, 'duplicate'); } : undefined}
            />
        );
    } else if (activeTool === 'protect') {
        settingsContent = (
            <StudioProtectSettingsPanel
                ui={ui}
                onOptionsChange={ctrl.setProtectOptions}
            />
        );
    } else if (activeTool === 'ocr-pdf') {
        settingsContent = <StudioOcrSettingsPanel settings={ocrSettings} onChange={setOcrSettings} />;
    } else if (activeTool === 'pdf-to-jpg') {
        settingsContent = <StudioPdfToJpgSettingsPanel settings={pdfToJpgSettings} onChange={setPdfToJpgSettings} />;
    } else if (activeTool === 'compress-pdf') {
        settingsContent = <StudioCompressPdfSettingsPanel settings={compressPdfSettings} onChange={setCompressPdfSettings} />;
    } else if (activeTool === 'extract-images') {
        settingsContent = (
            <StudioExtractImagesSettingsPanel
                settings={extractImagesSettings}
                onChange={setExtractImagesSettings}
                pages={extractPagePreviews}
                selectedImageIds={selectedImageIdsSet}
                onToggleImage={handleToggleImage}
                onSelectAll={handleSelectAllImages}
                onDeselectAll={handleDeselectAllImages}
            />
        );
    }

    // ── Action buttons ──────────────────────────────────────────────────────

    let actionButtons: React.ReactNode = null;

    if (isEditTool(activeTool)) {
        if (activeTool === 'protect') {
            actionButtons = (
                <>
                    <button type="button" className="studio-inline-panel-run-btn" onClick={() => { void ctrl.protectAndReturnToStudio(ctrl.protectOptions ?? {}); }} disabled={isApplying}>
                        {isApplying ? 'Applying…' : 'Apply'}
                    </button>
                    <button type="button" className="studio-inline-panel-cancel-btn" onClick={onClose}>Cancel</button>
                </>
            );
        } else {
            actionButtons = (
                <>
                    <button
                        type="button"
                        className="studio-inline-panel-run-btn"
                        onClick={handleSaveEdit}
                        disabled={isApplying || !hasPendingChanges}
                    >
                        {isApplying ? 'Saving…' : 'Save'}
                    </button>
                    <button type="button" className="studio-inline-panel-cancel-btn" onClick={handleDiscardEdit}>
                        Discard
                    </button>
                </>
            );
        }
    } else if (isConvertTool(activeTool)) {
        if (convertStep === 'config') {
            actionButtons = (
                <button
                    type="button"
                    className="studio-inline-panel-run-btn"
                    onClick={() => { void runConvert(); }}
                    disabled={selectedConvertPages.length === 0 || (activeTool === 'extract-images' && selectedExtractImageCandidates.length === 0)}
                >
                    {activeTool === 'ocr-pdf' ? `Run OCR on ${selectedConvertPages.length} page${selectedConvertPages.length !== 1 ? 's' : ''}` : 'Run'}
                </button>
            );
        } else if (convertStep === 'processing') {
            actionButtons = null;
        } else {
            const isOcrDownloadBlocked = activeTool === 'ocr-pdf' && !isPro;
            actionButtons = (
                <>
                    <button
                        type="button"
                        className="studio-inline-panel-run-btn"
                        onClick={() => {
                            if (isOcrDownloadBlocked) {
                                showStudioPaywall(runtime.telemetry, 'OCR is a Pro feature. Upgrade to download results.', import.meta.env.VITE_BILLING_URL);
                            } else {
                                void downloadResults();
                            }
                        }}
                    >
                        {isOcrDownloadBlocked ? 'Upgrade to Pro' : 'Download'}
                    </button>
                    <button type="button" className="studio-inline-panel-cancel-btn" onClick={() => { setConvertStep('config'); setOutputIds([]); setOcrResult(null); setJpgResults([]); setCompressResultSummary(null); }}>
                        Run again
                    </button>
                </>
            );
        }
    }

    // ── Convert result overlay ───────────────────────────────────────────────

    const convertResultOverlay = isConvertTool(activeTool) && convertStep === 'result' && (
        <div className="studio-inline-panel-result-overlay">
            {(activeTool === 'pdf-to-jpg' || activeTool === 'extract-images') && jpgResults.length > 0 && (
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', padding: '12px 16px' }}>
                    {jpgResults.map((item) => (
                        <div key={item.outputId} style={{ width: 140, background: 'rgba(15,23,42,0.55)', borderRadius: 10, padding: 8 }}>
                            <div style={{ fontSize: 11, opacity: 0.75, marginBottom: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</div>
                            {item.url ? <img src={item.url} alt={item.name} style={{ width: '100%', borderRadius: 6 }} /> : <div style={{ height: 100, borderRadius: 6, background: 'rgba(2,6,23,0.55)', display: 'grid', placeItems: 'center', fontSize: 12 }}>No preview</div>}
                        </div>
                    ))}
                </div>
            )}
            {activeTool === 'ocr-pdf' && ocrResult && (
                <div style={{ padding: '12px 16px', maxWidth: 600 }}>
                    {ocrResult.kind === 'pdf' && ocrResult.pdfUrl ? (
                        <iframe title="OCR PDF" src={`${ocrResult.pdfUrl}#toolbar=0`} style={{ width: '100%', height: 400, border: 'none', borderRadius: 8, background: '#fff' }} />
                    ) : (
                        <textarea
                            value={ocrResult.content || ''}
                            onChange={(e) => setOcrResult((cur) => cur ? { ...cur, content: e.target.value } : null)}
                            style={{ width: '100%', minHeight: 200, resize: 'vertical', background: 'rgba(0,0,0,0.15)', border: '1px solid rgba(148,163,184,0.2)', borderRadius: 6, color: 'inherit', fontFamily: 'monospace', padding: 12, outline: 'none' }}
                        />
                    )}
                </div>
            )}
            {activeTool === 'compress-pdf' && compressResultSummary && (
                <div style={{ display: 'flex', gap: 12, padding: '12px 16px', alignItems: 'center' }}>
                    <span style={{ fontSize: 13 }}>Before: <strong>{formatBytes(compressResultSummary.inputBytes)}</strong></span>
                    <span style={{ opacity: 0.5 }}>→</span>
                    <span style={{ fontSize: 13 }}>After: <strong>{formatBytes(compressResultSummary.outputBytes)}</strong></span>
                    <span style={{ fontSize: 13, color: 'rgba(74,222,128,0.9)' }}>
                        Saved: <strong>{formatBytes(Math.max(0, compressResultSummary.inputBytes - compressResultSummary.outputBytes))}</strong>
                    </span>
                </div>
            )}
        </div>
    );

    const toolMeta: Record<string, { label: string; icon: React.ReactNode }> = {
        text:           { label: 'Text',           icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={`var(--accent)`} strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/></svg> },
        annotate:       { label: 'Annotate',       icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={`var(--accent)`} strokeWidth="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg> },
        sign:           { label: 'Sign',           icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={`var(--accent)`} strokeWidth="2"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg> },
        whiteout:       { label: 'Whiteout',       icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={`var(--accent)`} strokeWidth="2"><path d="M20 20H7L3 16l9.5-9.5 7 7Z"/></svg> },
        watermark:      { label: 'Watermark',      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={`var(--accent)`} strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M8 12h8M12 8v8"/></svg> },
        forms:          { label: 'Forms',          icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={`var(--accent)`} strokeWidth="2"><rect x="9" y="11" width="13" height="13" rx="2"/><path d="M5 7H3a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h2"/></svg> },
        protect:        { label: 'Protect',        icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={`var(--accent)`} strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg> },
        'ocr-pdf':      { label: 'OCR',            icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={`var(--accent)`} strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 8h10M7 12h6M7 16h4"/></svg> },
        'pdf-to-jpg':   { label: 'PDF to JPG',     icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={`var(--accent)`} strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg> },
        'compress-pdf': { label: 'Compress',       icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={`var(--accent)`} strokeWidth="2"><polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="10" y1="14" x2="21" y2="3"/><line x1="3" y1="21" x2="14" y2="10"/></svg> },
        'extract-images': { label: 'Extract Images', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={`var(--accent)`} strokeWidth="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg> },
    };
    const meta = toolMeta[activeTool] ?? { label: activeTool, icon: null };

    return (
        <div
            className="studio-inline-panel animate-fade-in"
            style={activeTool === 'extract-images' ? { width: 300 } : undefined}
        >
            <div className="studio-inline-panel-bar">
                {/* Header */}
                <div className="studio-inline-panel-header">
                    <div className="studio-inline-panel-header-icon">{meta.icon}</div>
                    <div>
                        <div className="studio-inline-panel-title">{meta.label}</div>
                    </div>
                    <button type="button" className="studio-inline-panel-close" onClick={onClose} title="Close">✕</button>
                </div>

                {/* Settings body */}
                <div className="studio-inline-panel-body">
                    <div className="studio-inline-panel-settings">
                        {settingsContent}
                    </div>
                </div>

                {/* Convert progress */}
                {isConvertTool(activeTool) && convertStep === 'processing' && (
                    <div style={{ padding: '0 14px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <div style={{ height: 4, background: 'var(--bg-2)', borderRadius: 2, overflow: 'hidden', border: '1px solid var(--border)' }}>
                            <div style={{ height: '100%', width: `${convertProgress}%`, background: 'var(--accent)', borderRadius: 2, transition: 'width 0.2s' }} />
                        </div>
                        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{Math.round(convertProgress)}%</span>
                    </div>
                )}

                {/* Error */}
                {convertError && (
                    <div style={{ padding: '0 14px 10px', fontSize: 12, color: 'var(--red)' }} title={convertError}>
                        {convertError}
                    </div>
                )}

                {/* Action buttons */}
                <div className="studio-inline-panel-actions">
                    {actionButtons}
                </div>
            </div>

            {/* Result overlay */}
            {convertResultOverlay}

            {pendingDiscard && (
                <StudioDialog
                    type="confirm"
                    title={ui.unsavedConfirm}
                    confirmLabel="Discard"
                    onConfirm={() => { pendingDiscard(); setPendingDiscard(null); }}
                    onCancel={() => setPendingDiscard(null)}
                />
            )}
        </div>
    );
}
