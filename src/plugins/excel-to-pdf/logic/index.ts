import type { ToolLogicFunction } from '../../../core/types/contracts';

function isZipContainer(bytes: Uint8Array): boolean {
    return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b;
}

function isCfbContainer(bytes: Uint8Array): boolean {
    return (
        bytes.length >= 8 &&
        bytes[0] === 0xd0 &&
        bytes[1] === 0xcf &&
        bytes[2] === 0x11 &&
        bytes[3] === 0xe0 &&
        bytes[4] === 0xa1 &&
        bytes[5] === 0xb1 &&
        bytes[6] === 0x1a &&
        bytes[7] === 0xe1
    );
}

function isLikelyExcelBinary(bytes: Uint8Array): boolean {
    return isZipContainer(bytes) || isCfbContainer(bytes);
}

export const run: ToolLogicFunction = async ({ inputIds, fs, emitProgress }) => {
    if (inputIds.length === 0) {
        throw new Error('Excel to PDF requires at least one input file');
    }

    const { read, utils } = await import('xlsx');
    const { jsPDF } = await import('jspdf');
    const { default: autoTable } = await import('jspdf-autotable');

    const outputIds: string[] = [];

    for (let i = 0; i < inputIds.length; i++) {
        const entry = await fs.read(inputIds[i]);
        const arrayBuffer = await entry.getBlob().then(b => b.arrayBuffer());
        const bytes = new Uint8Array(arrayBuffer);

        if (!isLikelyExcelBinary(bytes)) {
            throw new Error(`Failed to parse Excel file ${inputIds[i]}: unsupported container format`);
        }

        const workbook = read(arrayBuffer, { type: 'array' });

        if (workbook.SheetNames.length === 0) {
            throw new Error(`Failed to parse Excel file ${inputIds[i]}: no sheets found`);
        }

        const doc = new jsPDF();

        // Convert each sheet to a table in PDF
        workbook.SheetNames.forEach((sheetName, index) => {
            if (index > 0) {
                doc.addPage();
            }

            const worksheet = workbook.Sheets[sheetName];
            const data = utils.sheet_to_json(worksheet, { header: 1 }) as any[][];

            if (data.length > 0) {
                doc.text(`Sheet: ${sheetName}`, 14, 15);
                autoTable(doc, {
                    head: [data[0]],
                    body: data.slice(1),
                    startY: 20,
                });
            }
        });

        const pdfArrayBuffer = doc.output('arraybuffer');
        const outBlob = new Blob([pdfArrayBuffer], { type: 'application/pdf' });
        const outEntry = await fs.write(outBlob);
        outputIds.push(outEntry.id);

        const progress = Math.round(((i + 1) / inputIds.length) * 100);
        emitProgress?.(progress);
    }

    return { outputIds };
};
