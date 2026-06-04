import { OcrPipelineError } from './ocr-errors';
import { detectDocumentLanguage, type LanguageDetectionResult } from './language-detector';

export interface OcrResult {
  text: string;
  confidence: number | null;
  requestedLanguage: string;
  usedLanguage: string;
  languageFallbackUsed: boolean;
  detectedLanguage?: LanguageDetectionResult;
  words: OcrWord[];
}

export interface OcrRecognizeOptions {
  language?: string;
  detectLanguage?: boolean;
}

export interface OcrWord {
  text: string;
  confidence: number | null;
  bbox: {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
  };
}

export interface OcrEngine {
  recognize(blob: Blob, options?: OcrRecognizeOptions): Promise<OcrResult>;
  terminate?(): Promise<void>;
}

class FallbackOcrEngine implements OcrEngine {
  async recognize(): Promise<OcrResult> {
    throw new OcrPipelineError('OCR_ENGINE_UNAVAILABLE', 'OCR engine is unavailable');
  }
}

interface TesseractResult {
  data?: {
    text?: string;
    confidence?: number;
    words?: TesseractWord[];
  };
}

interface TesseractWord {
  text?: string;
  confidence?: number;
  bbox?: { x0?: number; y0?: number; x1?: number; y1?: number };
}

interface TesseractWorker {
  recognize(
    image: Blob,
    options?: any,
    output?: any,
  ): Promise<TesseractResult>;
  reinitialize(
    langs?: string,
    oem?: number,
    config?: any,
  ): Promise<any>;
  terminate(): Promise<any>;
}

interface TesseractModule {
  createWorker(
    langs?: string,
    oem?: number,
    options?: {
      corePath?: string;
      langPath?: string;
      workerBlobURL?: boolean;
      workerPath?: string;
      cacheMethod?: string;
    },
  ): Promise<TesseractWorker>;
  recognize(
    input: Blob,
    language: string,
    options?: {
      corePath?: string;
      langPath?: string;
      workerBlobURL?: boolean;
      workerPath?: string;
      cacheMethod?: string;
    },
  ): Promise<TesseractResult>;
}

const TESSERACT_CACHE_METHOD = 'none';

function resolveAppAssetPath(relativePath: string): string {
  const baseUrl = typeof import.meta !== 'undefined' && typeof import.meta.env?.BASE_URL === 'string'
    ? import.meta.env.BASE_URL
    : '/';
  const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return `${normalizedBase}${relativePath.replace(/^\//, '')}`;
}

const TESSERACT_WORKER_PATH = resolveAppAssetPath('vendor/tesseract/worker.min.js');
const TESSERACT_CORE_PATH = resolveAppAssetPath('vendor/tesseract/core');
const TESSERACT_LANG_PATH = resolveAppAssetPath('vendor/tesseract/lang');

function isLanguagePackError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return /language|traineddata|load|fetch|worker|network|import/i.test(message);
}

function buildLanguageFallbackChain(requestedLanguage: string): string[] {
  const normalized = requestedLanguage
    .split('+')
    .map((token) => token.trim())
    .filter(Boolean);

  const unique = Array.from(new Set(normalized));
  if (unique.length === 0) {
    return ['eng'];
  }

  const chain: string[] = [];
  chain.push(unique.join('+'));

  if (unique.length > 1) {
    if (unique.includes('eng')) {
      chain.push('eng');
    }

    for (const token of unique) {
      chain.push(token);
    }

    const nonEnglish = unique.filter((token) => token !== 'eng');
    if (nonEnglish.length > 0) {
      chain.push(nonEnglish[0]!);
    }
  } else {
    chain.push('eng');
  }

  return Array.from(new Set(chain.filter(Boolean)));
}

function normalizeWords(words: TesseractWord[] | undefined): OcrWord[] {
  if (!Array.isArray(words)) {
    return [];
  }
  return words
    .map((word) => {
      const text = (word.text ?? '').trim();
      const x0 = Number(word.bbox?.x0);
      const y0 = Number(word.bbox?.y0);
      const x1 = Number(word.bbox?.x1);
      const y1 = Number(word.bbox?.y1);
      if (!text || !Number.isFinite(x0) || !Number.isFinite(y0) || !Number.isFinite(x1) || !Number.isFinite(y1)) {
        return null;
      }
      return {
        text,
        confidence: typeof word.confidence === 'number' ? Number(word.confidence.toFixed(2)) : null,
        bbox: { x0, y0, x1, y1 },
      } satisfies OcrWord;
    })
    .filter((word): word is OcrWord => word !== null);
}

class TesseractOcrEngine implements OcrEngine {
  private worker: TesseractWorker | null = null;
  private currentLanguage: string | null = null;

  constructor(private readonly tesseract: TesseractModule) { }

  private async getWorker(language: string): Promise<TesseractWorker> {
    if (this.worker) {
      if (this.currentLanguage !== language) {
        await this.worker.reinitialize(language, 1);
        this.currentLanguage = language;
      }
      return this.worker;
    }

    const worker = await this.tesseract.createWorker(language, 1, {
      workerPath: TESSERACT_WORKER_PATH,
      corePath: TESSERACT_CORE_PATH,
      langPath: TESSERACT_LANG_PATH,
      workerBlobURL: false,
      cacheMethod: TESSERACT_CACHE_METHOD,
    });
    this.worker = worker;
    this.currentLanguage = language;
    return worker;
  }

  private async runRecognize(blob: Blob, language: string): Promise<OcrResult> {
    const worker = await this.getWorker(language);
    const result = await worker.recognize(blob);
    return {
      text: result.data?.text ?? '',
      confidence: typeof result.data?.confidence === 'number' ? Number(result.data.confidence.toFixed(2)) : null,
      requestedLanguage: language,
      usedLanguage: language,
      languageFallbackUsed: false,
      words: normalizeWords(result.data?.words),
    };
  }

  async recognize(blob: Blob, options: OcrRecognizeOptions = {}): Promise<OcrResult> {
    if (blob.type === 'application/pdf') {
      throw new OcrPipelineError('OCR_UNSUPPORTED_INPUT', 'OCR engine does not accept PDF blob directly');
    }

    const requestedLanguage = options.language?.trim() || 'eng';
    const fallbackChain = buildLanguageFallbackChain(requestedLanguage);
    let lastLanguageError: unknown = null;

    for (let i = 0; i < fallbackChain.length; i += 1) {
      const candidateLanguage = fallbackChain[i]!;
      try {
        const result = await this.runRecognize(blob, candidateLanguage);
        if (options.detectLanguage) {
          result.detectedLanguage = detectDocumentLanguage(result.text);
        }
        return {
          ...result,
          requestedLanguage,
          languageFallbackUsed: candidateLanguage !== requestedLanguage,
        };
      } catch (error) {
        if (!isLanguagePackError(error)) {
          throw new OcrPipelineError(
            'OCR_RECOGNITION_FAILED',
            `OCR failed: ${error instanceof Error ? error.message : 'unknown error'}`,
          );
        }
        lastLanguageError = error;
      }
    }

    throw new OcrPipelineError(
      'OCR_LANGUAGE_PACK_UNAVAILABLE',
      `OCR language pack "${requestedLanguage}" is unavailable${lastLanguageError instanceof Error && lastLanguageError.message ? `: ${lastLanguageError.message}` : ''}`,
    );
  }

  async terminate(): Promise<void> {
    if (this.worker) {
      await this.worker.terminate();
      this.worker = null;
      this.currentLanguage = null;
    }
  }
}

export async function createOcrEngine(): Promise<OcrEngine> {
  try {
    const mod = (await import('tesseract.js')) as { recognize?: unknown; createWorker?: unknown };
    if (typeof mod.createWorker !== 'function') {
      return new FallbackOcrEngine();
    }
    return new TesseractOcrEngine(mod as unknown as TesseractModule);
  } catch {
    return new FallbackOcrEngine();
  }
}
