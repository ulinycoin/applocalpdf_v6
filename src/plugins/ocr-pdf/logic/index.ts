import type { ToolLogicFunction } from '../../../core/types/contracts';
import { createOcrEngine } from '../../../services/ocr/ocr-engine';
import { OcrPipelineError } from '../../../services/ocr/ocr-errors';
import { createPdfRasterizer } from '../../../services/pdf/pdf-rasterizer';

export const run: ToolLogicFunction = async ({ inputIds, fs, emitProgress }) => {
  if (inputIds.length === 0) {
    throw new Error('OCR PDF requires at least one input file');
  }

  const outputIds: string[] = [];
  const ocr = await createOcrEngine();
  for (let i = 0; i < inputIds.length; i += 1) {
    const entry = await fs.read(inputIds[i]);
    const blob = await entry.getBlob();
    const byteLength = blob.size;
    const mime = await entry.getType();

    let recognizedText = '';
    if (mime === 'application/pdf') {
      const rasterizer = await createPdfRasterizer();
      if (!rasterizer) {
        throw new OcrPipelineError(
          'OCR_PDF_RASTERIZER_MISSING',
          'PDF OCR pipeline requires rasterizer integration (pdf.js -> image)',
        );
      }
      const images = await rasterizer.rasterize(blob);
      const chunks: string[] = [];
      for (const image of images) {
        const recognized = await ocr.recognize(image);
        chunks.push(recognized.text);
      }
      recognizedText = chunks.join('\n\n');
    } else {
      const recognized = await ocr.recognize(blob);
      recognizedText = recognized.text;
    }

    const report = [
      `sourceFileId=${entry.id}`,
      `sourceMime=${mime}`,
      `sourceBytes=${byteLength}`,
      'recognizedText=',
      recognizedText,
    ].join('\n');

    const reportBlob = new Blob([report], { type: 'text/plain' });
    const out = await fs.write(reportBlob);
    outputIds.push(out.id);

    const progress = Math.round(((i + 1) / inputIds.length) * 100);
    emitProgress?.(progress);
  }

  return { outputIds };
};
