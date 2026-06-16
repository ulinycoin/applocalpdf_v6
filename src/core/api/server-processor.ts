import { PDFDocument } from 'pdf-lib';

export interface ProcessOptions {
  quality?: 'low' | 'medium' | 'high';
  languages?: string[];
  signatureImage?: string;
  signaturePosition?: { x: number; y: number; page?: number };
}

export interface ProcessResult {
  file: string;
  stats: {
    inputSize: number;
    outputSize: number;
    processingTimeMs: number;
  };
}

export async function processPdf(
  fileBase64: string,
  tool: string,
  options: ProcessOptions = {}
): Promise<ProcessResult> {
  const startTime = Date.now();
  const inputBytes = Buffer.from(fileBase64, 'base64');
  const inputSize = inputBytes.length;

  let outputBytes: Uint8Array;

  switch (tool) {
    case 'compress':
      outputBytes = await compressPdf(inputBytes, options);
      break;
    case 'ocr':
      outputBytes = await ocrPdf(inputBytes, options);
      break;
    case 'sign':
      outputBytes = await signPdf(inputBytes, options);
      break;
    default:
      throw new Error(`Unknown tool: ${tool}`);
  }

  return {
    file: Buffer.from(outputBytes).toString('base64'),
    stats: {
      inputSize,
      outputSize: outputBytes.length,
      processingTimeMs: Date.now() - startTime,
    },
  };
}

async function compressPdf(
  input: Uint8Array,
  options: ProcessOptions
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(input);
  const useObjectStreams = options.quality !== 'low';
  return doc.save({ useObjectStreams, addDefaultPage: false });
}

async function ocrPdf(
  input: Uint8Array,
  options: ProcessOptions
): Promise<Uint8Array> {
  const { createWorker } = await import('tesseract.js');

  const doc = await PDFDocument.load(input);
  const pageCount = doc.getPageCount();

  const languages = options.languages?.join('+') || 'eng';
  const worker = await createWorker(languages);

  const embedFont = await doc.embedFont('Helvetica');

  for (let i = 0; i < pageCount; i++) {
    const page = doc.getPage(i);
    const { width, height } = page.getSize();

    const imagePage = await PDFDocument.create();
    await imagePage.embedPdf(doc, [i]);
    const imageBytes = await imagePage.save();

    const buffer = Buffer.from(imageBytes);
    const { data } = await worker.recognize(buffer);

    const lines = data.lines || [];
    for (const line of lines) {
      const bbox = line.bbox;
      const text = line.text;
      if (!text.trim()) continue;

      const lineHeight = bbox.y1 - bbox.y0;
      const fontSize = Math.max(8, Math.min(24, lineHeight * 0.8));
      const x = bbox.x0;
      const y = height - bbox.y0 - fontSize;

      page.drawText(text, {
        x: Math.max(0, Math.min(x, width - 50)),
        y: Math.max(fontSize, Math.min(y, height - fontSize)),
        size: fontSize,
        font: embedFont,
        opacity: 0,
      });
    }
  }

  await worker.terminate();
  return doc.save();
}

async function signPdf(
  input: Uint8Array,
  options: ProcessOptions
): Promise<Uint8Array> {
  if (!options.signatureImage) {
    throw new Error('Signature image is required for signing');
  }

  const doc = await PDFDocument.load(input);
  const signatureBytes = Buffer.from(options.signatureImage, 'base64');
  const signatureImage = await doc.embedPng(signatureBytes);

  const pos = options.signaturePosition || { x: 100, y: 100, page: 0 };
  const pageIndex = pos.page || 0;

  if (pageIndex >= doc.getPageCount()) {
    throw new Error(`Page ${pageIndex} does not exist`);
  }

  const page = doc.getPage(pageIndex);
  const { width, height } = page.getSize();

  const sigWidth = Math.min(200, width * 0.3);
  const sigHeight = sigWidth * (signatureImage.height / signatureImage.width);

  page.drawImage(signatureImage, {
    x: Math.max(0, Math.min(pos.x, width - sigWidth)),
    y: Math.max(0, Math.min(pos.y, height - sigHeight)),
    width: sigWidth,
    height: sigHeight,
  });

  return doc.save();
}
