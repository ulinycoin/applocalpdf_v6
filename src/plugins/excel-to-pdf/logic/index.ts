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

function normalizeCellValue(value: unknown): string | number | null {
    if (value === null || value === undefined) {
        return null;
    }
    if (typeof value === 'number' || typeof value === 'string') {
        return value;
    }
    if (value instanceof Date) {
        return value.toISOString();
    }
    if (typeof value === 'boolean') {
        return value ? 'TRUE' : 'FALSE';
    }
    if (typeof value === 'object') {
        if ('result' in value) {
            const result = (value as { result?: unknown }).result;
            return normalizeCellValue(result);
        }
        if ('text' in value && typeof (value as { text?: unknown }).text === 'string') {
            return (value as { text: string }).text;
        }
        if ('richText' in value && Array.isArray((value as { richText?: unknown }).richText)) {
            return ((value as { richText: Array<{ text?: string }> }).richText)
                .map(part => part.text ?? '')
                .join('');
        }
    }
    return String(value);
}

export const run: ToolLogicFunction = async ({ inputIds, fs, emitProgress }) => {
    if (inputIds.length === 0) {
        throw new Error('Excel to PDF requires at least one input file');
    }

    const { Workbook } = await import('exceljs');
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

        const workbook = new Workbook();
        await workbook.xlsx.load(arrayBuffer);

        if (workbook.worksheets.length === 0) {
            throw new Error(`Failed to parse Excel file ${inputIds[i]}: no sheets found`);
        }

        const doc = new jsPDF();

        // Convert each sheet to a table in PDF
        workbook.worksheets.forEach((worksheet, index) => {
            if (index > 0) {
                doc.addPage();
            }

            const data: Array<Array<string | number | null>> = [];
            worksheet.eachRow({ includeEmpty: true }, row => {
                const rowValues = Array.isArray(row.values) ? row.values.slice(1) : [];
                data.push(rowValues.map(cell => normalizeCellValue(cell)));
            });

            if (data.length > 0) {
                doc.text(`Sheet: ${worksheet.name}`, 14, 15);
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
