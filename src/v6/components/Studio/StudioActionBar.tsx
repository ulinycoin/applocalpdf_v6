import { useStudioStore, PageItem, StudioDocument as StudioDoc, StudioState } from './studio-store';
import { LinearIcon } from '../icons/linear-icon';
import { IPipelineRecipe } from '../../studio/pipeline/types';
import { PipelineRunner } from '../../studio/pipeline/PipelineRunner';
import { usePlatform } from '../../../app/react/platform-context';

interface ReorderItem {
    sourceFileId: string;
    pageIndex: number;
    rotation: number;
}

export function StudioActionBar() {
    const { runtime } = usePlatform();
    const addDocument = useStudioStore((s: StudioState) => s.addDocument);
    const setActiveDocument = useStudioStore((s: StudioState) => s.setActiveDocument);
    const activeDocumentId = useStudioStore((s: StudioState) => s.activeDocumentId);
    const markWorkspaceExported = useStudioStore((s: StudioState) => s.markWorkspaceExported);
    const documents = useStudioStore((s: StudioState) => s.documents);
    const exportableDocuments = documents.filter((doc) => doc.includeInExport !== false);
    const activeDocument = documents.find((doc) => doc.id === activeDocumentId) ?? null;
    const hasDocuments = documents.length > 0;
    const hasActivePages = (activeDocument?.pages.length ?? 0) > 0;

    const exportDocuments = async (docs: StudioDoc[], fileName: string) => {
        if (docs.length === 0) {
            return;
        }
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
        if (sequence.length === 0) {
            return;
        }

        const recipe: IPipelineRecipe = {
            inputs: Array.from(new Set(sequence.map((s) => s.sourceFileId))),
            operations: [
                { type: 'reorder', sequence }
            ],
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
            a.download = result.fileName;
            a.click();
            URL.revokeObjectURL(url);
            markWorkspaceExported();
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'Unknown export error';
            console.error('Export failed:', message);
        }
    };

    const handleExportActive = async () => {
        if (!activeDocument || activeDocument.pages.length === 0) {
            return;
        }
        const safeName = activeDocument.name.replace(/[^\w.-]+/g, '_').slice(0, 64) || 'workspace';
        await exportDocuments([activeDocument], `LocalPDF_${safeName}.pdf`);
    };

    const handleCreateSpace = () => {
        const maxY = documents.reduce((acc, doc) => Math.max(acc, doc.y + 360), 80);
        const nextDocId = crypto.randomUUID();
        addDocument({
            id: nextDocId,
            name: `Workspace ${documents.length + 1}`,
            x: 100,
            y: hasDocuments ? maxY : 100,
            pages: [],
            allowEmpty: true,
            includeInExport: true,
            isModified: true,
        });
        setActiveDocument(nextDocId);
    };

    return (
        <div className="studio-action-bar animate-slide-up">
            <div className="studio-action-stack">
                <button className="studio-space-btn" onClick={handleCreateSpace}>
                    <LinearIcon name="tool" className="linear-icon" />
                    <span>New Space</span>
                </button>
                <button className="export-btn" onClick={handleExportActive} disabled={!hasActivePages}>
                    <LinearIcon name="download" className="linear-icon" />
                    <span>Download Selected Area</span>
                </button>
            </div>
        </div>
    );
}
