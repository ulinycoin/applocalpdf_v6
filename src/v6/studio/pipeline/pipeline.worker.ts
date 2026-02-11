import { PDFDocument, degrees } from 'pdf-lib';

// Note: In a real environment, we would use VFS to read/write.
// For this prototype, we'll assume the message sends the buffers.

self.onmessage = async (e: MessageEvent) => {
    const { recipe, files } = e.data;

    try {
        const outputDoc = await PDFDocument.create();
        const sourceDocs = new Map<string, PDFDocument>();

        // 1. Load all source documents
        for (const file of files) {
            const doc = await PDFDocument.load(file.buffer);
            sourceDocs.set(file.id, doc);
        }

        // 2. Simple Reorder/Merge execution (The base of Studio operations)
        // For now, let's implement the 'reorder' operation as it covers merge/split.
        const reorderOp = recipe.operations.find((op: any) => op.type === 'reorder');

        if (reorderOp) {
            for (const item of reorderOp.sequence) {
                const srcDoc = sourceDocs.get(item.sourceFileId);
                if (srcDoc) {
                    const [copiedPage] = await outputDoc.copyPages(srcDoc, [item.pageIndex]);

                    // Apply rotation from the sequence item or separate op
                    const rotation = item.rotation ?? 0;
                    if (rotation !== 0) {
                        copiedPage.setRotation(degrees(rotation));
                    }

                    outputDoc.addPage(copiedPage);
                }
            }
        }

        const pdfBytes = await outputDoc.save();

        self.postMessage({
            type: 'SUCCESS',
            buffer: pdfBytes,
            fileName: recipe.outputName
        }, [pdfBytes.buffer] as any);

    } catch (error: any) {
        self.postMessage({ type: 'ERROR', error: error.message });
    }
};
