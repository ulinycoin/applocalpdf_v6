import { useStudioStore } from './studio-store';
import { LinearIcon } from '../icons/linear-icon';
import { IPipelineRecipe } from '../../core/pipeline/types';
import { PipelineRunner } from '../../core/pipeline/PipelineRunner';
import { usePlatform } from '../../../app/react/platform-context';

// Define interfaces for the types used in the store and documents
interface Page {
    fileId: string;
    pageIndex: number;
    rotation: number;
}

interface Document {
    pages: Page[];
}

interface StudioStoreState {
    documents: Document[];
}

export function StudioActionBar() {
    const { runtime } = usePlatform();
    const documents = useStudioStore((s: any) => s.documents);
    const hasDocuments = documents.length > 0;

    if (!hasDocuments) return null;

    const handleExport = async () => {
        const sequence: { sourceFileId: string; pageIndex: number; rotation: number }[] = [];
        documents.forEach((doc: any) => {
            doc.pages.forEach((page: any) => {
                sequence.push({
                    sourceFileId: page.fileId,
                    pageIndex: page.pageIndex,
                    rotation: page.rotation
                });
            });
        });

        const recipe: IPipelineRecipe = {
            inputs: Array.from(new Set(sequence.map(s => s.sourceFileId))),
            operations: [
                { type: 'reorder', sequence: sequence }
            ],
            outputName: 'LocalPDF_Studio_Export.pdf'
        };

        console.log('Starting Pipeline with recipe:', recipe);

        try {
            const runner = new PipelineRunner(runtime.vfs);
            const result = await runner.execute(recipe);

            // 3. Trigger download
            const blob = new Blob([result.buffer.buffer as any], { type: 'application/pdf' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = result.fileName;
            a.click();
            URL.revokeObjectURL(url);

            alert('Export Successful!');
        } catch (error: any) {
            console.error('Export failed:', error);
            alert('Export failed: ' + error.message);
        }
    };

    return (
        <div className="studio-action-bar animate-slide-up">
            <button className="export-btn" onClick={handleExport}>
                <LinearIcon name="download" className="linear-icon" />
                <span>Export Result</span>
            </button>
        </div>
    );
}
