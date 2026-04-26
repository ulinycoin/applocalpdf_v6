import { useEffect, useState } from 'react';
import { useStudioStore, PageItem, StudioDocument as StudioDoc, StudioState } from './studio-store';
import { LinearIcon } from '../icons/linear-icon';
import { IPipelineRecipe } from '../../studio/pipeline/types';
import { PipelineRunner } from '../../studio/pipeline/PipelineRunner';
import { usePlatform } from '../../../app/react/platform-context';
import { canAddDocumentToStudio } from '../../../app/platform/plan-limits';
import { showStudioPaywall } from '../../../app/react/studio-paywall';
import { useHistoryStore } from './store/history-store';
import { StudioDialog } from './StudioDialog';

interface ReorderItem {
    sourceFileId: string;
    pageIndex: number;
    rotation: number;
}

type DialogState =
    | { kind: 'rename'; docId: string; current: string }
    | { kind: 'export'; docId: string; current: string }
    | null;

export function StudioActionBar() {
    const { runtime } = usePlatform();
    const [deleteArmedDocId, setDeleteArmedDocId] = useState<string | null>(null);
    const [dialog, setDialog] = useState<DialogState>(null);
    const createCheckpoint = useHistoryStore((s) => s.createCheckpoint);
    const addDocument = useStudioStore((s: StudioState) => s.addDocument);
    const removeDocument = useStudioStore((s: StudioState) => s.removeDocument);
    const setActiveDocument = useStudioStore((s: StudioState) => s.setActiveDocument);
    const setSelection = useStudioStore((s: StudioState) => s.setSelection);
    const requestInlineTool = useStudioStore((s: StudioState) => s.requestInlineTool);
    const updateDocument = useStudioStore((s: StudioState) => s.updateDocument);
    const activeDocumentId = useStudioStore((s: StudioState) => s.activeDocumentId);
    const markWorkspaceExported = useStudioStore((s: StudioState) => s.markWorkspaceExported);
    const documents = useStudioStore((s: StudioState) => s.documents);
    const activeDocument = documents.find((doc) => doc.id === activeDocumentId) ?? null;
    const hasDocuments = documents.length > 0;
    const hasActivePages = (activeDocument?.pages.length ?? 0) > 0;
    const deleteButtonCopy = activeDocument && deleteArmedDocId === activeDocument.id
        ? 'Confirm Delete'
        : 'Delete Space';

    useEffect(() => {
        if (!activeDocument || deleteArmedDocId !== activeDocument.id) {
            setDeleteArmedDocId(null);
        }
    }, [activeDocument, deleteArmedDocId]);

    const exportDocuments = async (docs: StudioDoc[], fileName: string) => {
        if (docs.length === 0) return;
        const sequence: ReorderItem[] = [];
        docs.forEach((doc: StudioDoc) => {
            doc.pages.forEach((page: PageItem) => {
                sequence.push({
                    sourceFileId: page.fileId,
                    pageIndex: page.pageIndex,
                    rotation: page.rotation
                });
            });
        });
        if (sequence.length === 0) return;

        const recipe: IPipelineRecipe = {
            inputs: Array.from(new Set(sequence.map((s) => s.sourceFileId))),
            operations: [{ type: 'reorder', sequence }],
            outputName: fileName
        };

        try {
            const runner = new PipelineRunner(runtime.vfs);
            const result = await runner.execute(recipe);
            const pdfBuffer = new ArrayBuffer(result.buffer.byteLength);
            new Uint8Array(pdfBuffer).set(result.buffer);
            const blob = new Blob([pdfBuffer], { type: 'application/pdf' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            markWorkspaceExported();
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'Unknown export error';
            console.error('Export failed:', message);
        }
    };

    const handleExportActive = () => {
        if (!activeDocument || activeDocument.pages.length === 0) return;
        setDialog({ kind: 'export', docId: activeDocument.id, current: activeDocument.name });
    };

    const handleCreateSpace = () => {
        const billingContext = runtime.billing.getContext();
        const limitCheck = canAddDocumentToStudio(billingContext, documents.length, 0);
        if (!limitCheck.allowed) {
            showStudioPaywall(
                runtime.telemetry,
                limitCheck.reason === 'workspace_limit'
                    ? 'Free includes up to 3 workspaces. Upgrade to Pro for unlimited workspaces.'
                    : 'Free supports documents up to 25 pages. Upgrade to Pro to open larger PDFs.',
                import.meta.env.VITE_BILLING_URL,
            );
            return;
        }
        const maxY = documents.reduce((acc, doc) => Math.max(acc, doc.y + 120), 80);
        const name = `Workspace ${documents.length + 1}`;
        const nextDocId = crypto.randomUUID();
        addDocument({
            id: nextDocId,
            name: name,
            x: 100,
            y: hasDocuments ? maxY + 40 : 100,
            pages: [],
            allowEmpty: true,
            includeInExport: true,
            isModified: true,
        });
        setActiveDocument(nextDocId);
        void createCheckpoint(runtime.vfs, 'system', 'Created Workspace');
    };

    const handleRenameActiveSpace = () => {
        if (!activeDocument) return;
        setDialog({ kind: 'rename', docId: activeDocument.id, current: activeDocument.name });
    };

    const handleDeleteActiveSpace = () => {
        if (!activeDocument) return;
        if (deleteArmedDocId !== activeDocument.id) {
            setDeleteArmedDocId(activeDocument.id);
            return;
        }
        setDeleteArmedDocId(null);
        removeDocument(activeDocument.id);
        setSelection([]);
        requestInlineTool(null);
        void createCheckpoint(runtime.vfs, 'system', 'Deleted Workspace');
    };

    const handleDialogConfirm = (value: string) => {
        if (!dialog) return;
        if (dialog.kind === 'rename') {
            updateDocument(dialog.docId, { name: value });
            void createCheckpoint(runtime.vfs, 'system', `Renamed to "${value}"`);
        } else if (dialog.kind === 'export') {
            const safeName = value.replace(/[<>:"/\\|?*]/g, '_').slice(0, 64) || 'Workspace';
            const doc = documents.find((d) => d.id === dialog.docId);
            if (doc) void exportDocuments([doc], `${safeName}.pdf`);
        }
        setDialog(null);
    };

    return (
        <>
            {dialog && (
                <StudioDialog
                    type="prompt"
                    title={dialog.kind === 'rename' ? 'Rename workspace' : 'File name for export'}
                    defaultValue={dialog.current}
                    onConfirm={handleDialogConfirm}
                    onCancel={() => setDialog(null)}
                />
            )}
            <div className="studio-action-bar animate-slide-up">
                <div className="studio-action-stack">
                    <button className="studio-space-btn" onClick={handleCreateSpace}>
                        <LinearIcon name="tool" className="linear-icon" />
                        <span>New Space</span>
                    </button>
                    <button className="studio-space-btn" onClick={handleRenameActiveSpace} disabled={!activeDocument}>
                        <LinearIcon name="edit" className="linear-icon" />
                        <span>Rename</span>
                    </button>
                    <button className="studio-space-btn studio-space-btn-danger" onClick={handleDeleteActiveSpace} disabled={!activeDocument}>
                        <LinearIcon name="delete-pages" className="linear-icon" />
                        <span>{deleteButtonCopy}</span>
                    </button>
                    <button className="export-btn" onClick={handleExportActive} disabled={!hasActivePages}>
                        <LinearIcon name="download" className="linear-icon" />
                        <span>Download Selected Area</span>
                    </button>
                </div>
            </div>
        </>
    );
}
