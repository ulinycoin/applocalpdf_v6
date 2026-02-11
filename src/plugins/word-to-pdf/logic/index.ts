import type { ToolLogicFunction } from '../../../core/types/contracts';

export const run: ToolLogicFunction = async ({ inputIds, fs, emitProgress }) => {
    if (inputIds.length === 0) {
        throw new Error('Word to PDF requires at least one input file');
    }

    // Lazy load dependencies for worker efficiency
    const mammoth = await import('mammoth');
    const { jsPDF } = await import('jspdf');

    const outputIds: string[] = [];

    for (let i = 0; i < inputIds.length; i++) {
        const entry = await fs.read(inputIds[i]);
        const arrayBuffer = await entry.getBlob().then(b => b.arrayBuffer());

        // Mammoth extract text (best for Worker-side without DOM)
        // In many cases extractRawText is more reliable than HTML-to-PDF without Puppeteer
        const result = await mammoth.extractRawText({ arrayBuffer });
        const text = result.value;

        const doc = new jsPDF();
        const margin = 20;
        const pageWidth = doc.internal.pageSize.getWidth();
        const maxLineLength = pageWidth - margin * 2;

        const lines = doc.splitTextToSize(text, maxLineLength);

        let y = margin;
        for (const line of lines) {
            if (y + 10 > doc.internal.pageSize.getHeight() - margin) {
                doc.addPage();
                y = margin;
            }
            doc.text(line, margin, y);
            y += 7;
        }

        const pdfArrayBuffer = doc.output('arraybuffer');
        const outBlob = new Blob([pdfArrayBuffer], { type: 'application/pdf' });
        const outEntry = await fs.write(outBlob);
        outputIds.push(outEntry.id);

        const progress = Math.round(((i + 1) / inputIds.length) * 100);
        emitProgress?.(progress);
    }

    return { outputIds };
};
