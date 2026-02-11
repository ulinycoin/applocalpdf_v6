import { OcrPipelineError } from './ocr-errors';

export interface OcrResult {
  text: string;
}

export interface OcrEngine {
  recognize(blob: Blob): Promise<OcrResult>;
}

class FallbackOcrEngine implements OcrEngine {
  async recognize(): Promise<OcrResult> {
    throw new OcrPipelineError('OCR_ENGINE_UNAVAILABLE', 'OCR engine is unavailable');
  }
}

class TesseractOcrEngine implements OcrEngine {
  async recognize(blob: Blob): Promise<OcrResult> {
    if (blob.type === 'application/pdf') {
      throw new OcrPipelineError('OCR_UNSUPPORTED_INPUT', 'OCR engine does not accept PDF blob directly');
    }

    const tesseract = await import('tesseract.js');
    try {
      const result = await tesseract.recognize(blob, 'eng');
      return { text: result.data.text };
    } catch (error) {
      throw new OcrPipelineError(
        'OCR_RECOGNITION_FAILED',
        `OCR failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }
  }
}

export async function createOcrEngine(): Promise<OcrEngine> {
  try {
    const mod = (await import('tesseract.js')) as { recognize?: unknown };
    if (typeof mod.recognize !== 'function') {
      return new FallbackOcrEngine();
    }
    return new TesseractOcrEngine();
  } catch {
    return new FallbackOcrEngine();
  }
}
