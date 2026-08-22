import type { IFileSystem, ToolLogicFunction, ToolProgressDetail } from '../../../core/types/contracts';
import { createOcrEngine, type OcrWord } from '../../../services/ocr/ocr-engine';
import { OcrPipelineError } from '../../../services/ocr/ocr-errors';
import { buildFontSupportProfile } from '../../../services/ocr/font-profile';
import { detectDocumentLanguage, selectAutoOcrLanguagePack, type SupportedOcrLanguage } from '../../../services/ocr/language-detector';
import { detectTablesFromWords, renderDetectedTablesAsMarkdown, type DetectedTable } from '../../../services/ocr/table-detector';
import { buildSearchablePdfFromImages } from '../../../services/ocr/searchable-pdf';
import { preprocessImageForOcr, type OcrPreprocessProfile } from '../../../services/ocr/image-preprocess';
import { createPdfRasterizer } from '../../../services/pdf/pdf-rasterizer';
import { extractEmbeddedPdfText } from '../../../services/pdf/pdf-text-extractor';

type OcrLanguageMode = 'auto' | 'manual';
type OcrOutputFormat = 'txt' | 'json' | 'searchable-pdf';
type OcrMode = 'accurate' | 'fast';

interface OcrRunOptions {
  languageMode: OcrLanguageMode;
  language: string;
  outputFormat: OcrOutputFormat;
  mode: OcrMode;
  preserveFormatting: boolean;
  detectTables: boolean;
}

interface PageAnalysis {
  text: string;
  words: OcrWord[];
  tables: DetectedTable[];
}

interface OcrChunkResult {
  text: string;
  confidence: number | null;
  usedLanguage: string;
  languageFallbackUsed: boolean;
  words: OcrWord[];
}

async function imageSizeFromBlob(blob: Blob): Promise<{ width: number; height: number } | null> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(blob);
      const size = { width: bitmap.width, height: bitmap.height };
      bitmap.close();
      return size;
    } catch {
      return null;
    }
  }
  if (typeof Image !== 'undefined' && typeof URL !== 'undefined') {
    const url = URL.createObjectURL(blob);
    try {
      const size = await new Promise<{ width: number; height: number }>((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
        image.onerror = () => reject(new Error('Failed to decode image'));
        image.src = url;
      });
      return size;
    } catch {
      return null;
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  return null;
}

async function remapWordsToRenderBlob(words: OcrWord[], ocrBlob: Blob, renderBlob: Blob): Promise<OcrWord[]> {
  const [ocrSize, renderSize] = await Promise.all([imageSizeFromBlob(ocrBlob), imageSizeFromBlob(renderBlob)]);
  if (!ocrSize || !renderSize || ocrSize.width <= 0 || ocrSize.height <= 0) {
    return words;
  }
  if (ocrSize.width === renderSize.width && ocrSize.height === renderSize.height) {
    return words;
  }
  const scaleX = renderSize.width / ocrSize.width;
  const scaleY = renderSize.height / ocrSize.height;
  return words.map((word) => ({
    ...word,
    bbox: {
      x0: word.bbox.x0 * scaleX,
      y0: word.bbox.y0 * scaleY,
      x1: word.bbox.x1 * scaleX,
      y1: word.bbox.y1 * scaleY,
    },
  }));
}

const SUPPORTED_LANGUAGES: SupportedOcrLanguage[] = ['eng', 'rus', 'ukr', 'deu', 'fra', 'spa', 'ita', 'por', 'jpn', 'chi_sim', 'hin', 'ara'];
const DEFAULT_LANGUAGE: SupportedOcrLanguage = 'eng';
const AUTO_PROBE_LANGUAGE_PACK = 'eng';
const OCR_FAST_RASTER_SCALE = 1.25;
const OCR_ACCURATE_RASTER_SCALE = 2.0;
const LOW_CONFIDENCE_THRESHOLD = 78;
const LOW_CONFIDENCE_TEXT_MIN = 40;
const LOW_CONFIDENCE_MAX_RETRY_PAGES = 6;
const CHUNK_SIZE = 5;

/** Write a partial text result to VFS and return its id (survives worker crash). */
async function savePartialResult(fs: IFileSystem, text: string): Promise<string> {
  const blob = new Blob([text], { type: 'text/plain' });
  const entry = await fs.write(blob);
  return entry.id;
}

function ocrRasterScale(mode: OcrMode): number {
  return mode === 'fast' ? OCR_FAST_RASTER_SCALE : OCR_ACCURATE_RASTER_SCALE;
}

function ocrPreprocessProfile(mode: OcrMode, retry = false): OcrPreprocessProfile {
  if (mode === 'fast') {
    return 'none';
  }
  return retry ? 'aggressive' : 'balanced';
}

function normalizeLanguagePack(raw: string | undefined): string {
  const input = (raw ?? '').trim().toLowerCase();
  if (!input) {
    return DEFAULT_LANGUAGE;
  }
  const tokens = input.split('+').map((part) => part.trim()).filter(Boolean);
  const unique = Array.from(new Set(tokens))
    .filter((token): token is SupportedOcrLanguage => SUPPORTED_LANGUAGES.includes(token as SupportedOcrLanguage));
  if (unique.length === 0) {
    return DEFAULT_LANGUAGE;
  }
  return unique.join('+');
}

function enrichAutoLanguagePack(languagePack: string, sampleText: string): string {
  const tokens = new Set(languagePack.split('+').map((t) => t.trim()).filter(Boolean));
  if (/\p{Script=Latin}/u.test(sampleText)) {
    tokens.add('eng');
  }
  if (/\p{Script=Cyrillic}/u.test(sampleText)) {
    tokens.add('rus');
  }
  if (/\p{Script=Hiragana}|\p{Script=Katakana}/u.test(sampleText)) {
    tokens.add('jpn');
  }
  if (/\p{Script=Han}/u.test(sampleText)) {
    tokens.add('chi_sim');
  }
  if (/\p{Script=Devanagari}/u.test(sampleText)) {
    tokens.add('hin');
  }
  return Array.from(tokens).join('+') || DEFAULT_LANGUAGE;
}

function parseOptions(input: Record<string, unknown> | undefined): OcrRunOptions {
  const languageMode = input?.languageMode === 'manual' ? 'manual' : 'auto';
  const language = normalizeLanguagePack(typeof input?.language === 'string' ? input.language : DEFAULT_LANGUAGE);
  const outputFormat = input?.outputFormat === 'json'
    ? 'json'
    : input?.outputFormat === 'searchable-pdf'
      ? 'searchable-pdf'
      : 'txt';
  const mode = input?.mode === 'fast' ? 'fast' : 'accurate';
  const preserveFormatting = input?.preserveFormatting !== false;
  const detectTables = input?.detectTables === true;
  return { languageMode, language, outputFormat, mode, preserveFormatting, detectTables };
}

function analyzePages(results: Array<{ text: string; words: OcrWord[] }>, options: OcrRunOptions): PageAnalysis[] {
  return results.map((result) => {
    const tables = options.detectTables ? detectTablesFromWords(result.words) : [];
    const tableMarkdown = tables.length > 0 ? renderDetectedTablesAsMarkdown(tables) : '';
    const text = options.detectTables && tableMarkdown
      ? options.preserveFormatting
        ? [result.text.trim(), tableMarkdown].filter(Boolean).join('\n\n')
        : [result.text.trim(), tableMarkdown.replace(/\|/g, '\t').replace(/^\s*---.*$/gm, '').replace(/\n{3,}/g, '\n\n').trim()].filter(Boolean).join('\n\n')
      : result.text;
    return {
      text,
      words: result.words,
      tables,
    };
  });
}

function isLowConfidence(result: OcrChunkResult): boolean {
  const textLength = result.text.trim().length;
  if (typeof result.confidence !== 'number') {
    return textLength < LOW_CONFIDENCE_TEXT_MIN;
  }
  if (result.confidence < LOW_CONFIDENCE_THRESHOLD) {
    return true;
  }
  return result.confidence < LOW_CONFIDENCE_THRESHOLD + 5 && textLength < LOW_CONFIDENCE_TEXT_MIN * 2;
}

function scoreResult(result: OcrChunkResult): number {
  const confidence = typeof result.confidence === 'number' ? result.confidence : 0;
  const textScore = Math.min(result.text.trim().length / 10, 24);
  const wordScore = Math.min(result.words.length / 6, 16);
  return confidence + textScore + wordScore;
}

function emitFileProgress(
  emitProgress: Parameters<ToolLogicFunction>[0]['emitProgress'],
  fileIndex: number,
  fileCount: number,
  localPercent: number,
  detail?: ToolProgressDetail,
): void {
  const safeLocal = Math.max(0, Math.min(100, localPercent));
  const overall = Math.round(((fileIndex + safeLocal / 100) / fileCount) * 100);
  const progress = Math.max(0, Math.min(100, overall));
  if (!emitProgress) {
    return;
  }
  if (detail) {
    emitProgress({ progress, detail });
  } else {
    emitProgress(progress);
  }
}

export const run: ToolLogicFunction = async ({ inputIds, options: runOptions, fs, emitProgress }) => {
  if (inputIds.length === 0) {
    throw new Error('OCR PDF requires at least one input file');
  }

  const options = parseOptions(runOptions);
  const outputIds: string[] = [];
  const ocr = await createOcrEngine();

  try {
    const recognizeChunk = async (input: Blob, language: string): Promise<OcrChunkResult> => {
      const recognized = await ocr.recognize(input, { language, detectLanguage: true });
      return {
        text: recognized.text,
        confidence: recognized.confidence,
        usedLanguage: recognized.usedLanguage,
        languageFallbackUsed: recognized.languageFallbackUsed,
        words: recognized.words,
      };
    };

    for (let i = 0; i < inputIds.length; i += 1) {
      const updateFileProgress = (localPercent: number, detail?: ToolProgressDetail): void => {
        emitFileProgress(emitProgress, i, inputIds.length, localPercent, detail);
      };

      updateFileProgress(2);
      const entry = await fs.read(inputIds[i]);
      const blob = await entry.getBlob();
      const byteLength = blob.size;
      const mime = await entry.getType();
      updateFileProgress(8);

      let recognizedText = '';
      const initialLanguagePack = options.languageMode === 'manual' ? options.language : AUTO_PROBE_LANGUAGE_PACK;
      let finalLanguagePack = initialLanguagePack;
      let autoSecondPassApplied = false;
      let lowConfidenceRetryApplied = false;
      let lowConfidenceRetryCount = 0;
      const pageConfidence: number[] = [];
      const usedLanguages = new Set<string>();
      let languageFallbackUsed = false;
      let languageDetection = detectDocumentLanguage('');
      let pageLayers: Array<{ imageBlob: Blob; words: OcrChunkResult['words'] }> = [];
      let pageAnalysis: PageAnalysis[] = [];
      let usedEmbeddedText = false;

      if (mime === 'application/pdf') {
        const embedded = await extractEmbeddedPdfText(blob);
        const text = embedded?.text ?? '';
        const letterCount = (text.match(/\p{L}/ug) || []).length;
        const wordCount = text.split(/\s+/).filter(Boolean).length;
        const hasEmbeddedText = letterCount >= 100 || (letterCount >= 20 && wordCount >= 8);
        if (hasEmbeddedText) {
          updateFileProgress(26);
          recognizedText = embedded?.text ?? '';
          pageAnalysis = [{
            text: recognizedText,
            words: [],
            tables: [],
          }];
          languageDetection = detectDocumentLanguage(recognizedText);
          usedEmbeddedText = true;
          updateFileProgress(78, {
            pageIndex: 0,
            pageCount: 1,
            completedPages: 1,
            partialText: recognizedText,
            partialOutputId: await savePartialResult(fs, recognizedText),
          });
        } else {
          updateFileProgress(20);
          // Emit progress before rasterization to reset the worker timeout window.
          // Rasterizing many pages can take 30+ seconds without intermediate progress,
          // which would trigger the 120s worker timeout and lose the user's work.
          updateFileProgress(22);

          const rasterizer = await createPdfRasterizer();
          if (!rasterizer) {
            throw new OcrPipelineError(
              'OCR_PDF_RASTERIZER_MISSING',
              'PDF OCR pipeline requires rasterizer integration (pdf.js -> image)',
            );
          }

          const rasterOptions = {
            scale: ocrRasterScale(options.mode),
            imageFormat: 'image/jpeg' as const,
          };
          const preprocessProfile = ocrPreprocessProfile(options.mode);
          const pageResults: OcrChunkResult[] = [];
          const pageImages: Blob[] = [];
          const pageRenderImages: Blob[] = [];
          let probeLanguageResolved = false;
          let lowConfidenceRetriesThisDoc = 0;

          const pageCount = await rasterizer.forEachPage(blob, rasterOptions, async (info) => {
            const { pageIndex, pageCount: totalPages, blob: sourceImage } = info;
            updateFileProgress(24 + (pageIndex / Math.max(1, totalPages)) * 14);

            const ocrImage = await preprocessImageForOcr(sourceImage, preprocessProfile);
            pageRenderImages.push(sourceImage);
            pageImages.push(ocrImage);

            let pageResult: OcrChunkResult;
            if (options.languageMode === 'auto' && !probeLanguageResolved) {
              const probe = await recognizeChunk(ocrImage, initialLanguagePack);
              const probeDetection = detectDocumentLanguage(probe.text);
              const suggestedPack = enrichAutoLanguagePack(selectAutoOcrLanguagePack(probeDetection), probe.text);
              finalLanguagePack = suggestedPack;
              autoSecondPassApplied = suggestedPack !== initialLanguagePack;
              probeLanguageResolved = true;
              pageResult = suggestedPack !== initialLanguagePack
                ? await recognizeChunk(ocrImage, suggestedPack)
                : probe;
            } else {
              const languagePack = options.languageMode === 'auto' ? finalLanguagePack : initialLanguagePack;
              pageResult = await recognizeChunk(ocrImage, languagePack);
            }

            if (
              options.mode === 'accurate'
              && totalPages > 1
              && isLowConfidence(pageResult)
              && lowConfidenceRetriesThisDoc < LOW_CONFIDENCE_MAX_RETRY_PAGES
            ) {
              const aggressiveBlob = await preprocessImageForOcr(sourceImage, ocrPreprocessProfile(options.mode, true));
              const languagePack = options.languageMode === 'auto' ? finalLanguagePack : initialLanguagePack;
              const retried = await recognizeChunk(aggressiveBlob, languagePack);
              const oldScore = scoreResult(pageResult);
              const newScore = scoreResult(retried);
              if (newScore >= oldScore + 2 || (!isLowConfidence(retried) && isLowConfidence(pageResult))) {
                pageResult = retried;
                pageImages[pageImages.length - 1] = aggressiveBlob;
              }
              lowConfidenceRetryApplied = true;
              lowConfidenceRetriesThisDoc += 1;
              lowConfidenceRetryCount = lowConfidenceRetriesThisDoc;
            }

            pageResults.push(pageResult);

            const partialAnalysis = analyzePages(
              pageResults.map((item) => ({ text: item.text, words: item.words })),
              options,
            );
            const partialText = partialAnalysis.map((page) => page.text).join('\n\n');

            // Write partial result to VFS every CHUNK_SIZE pages (survives worker crash)
            const partialOutputId = (
              (pageIndex + 1) % CHUNK_SIZE === 0
              || pageIndex + 1 === totalPages
            )
              ? await savePartialResult(fs, partialText)
              : undefined;

            updateFileProgress(38 + ((pageIndex + 1) / Math.max(1, totalPages)) * 50, {
              pageIndex,
              pageCount: totalPages,
              completedPages: pageIndex + 1,
              partialText,
              partialOutputId,
            });
          });

          if (pageCount === 0) {
            recognizedText = '';
          } else {
            pageAnalysis = analyzePages(pageResults.map((item) => ({ text: item.text, words: item.words })), options);
            recognizedText = pageAnalysis.map((item) => item.text).join('\n\n');
            const remappedLayers: Array<{ imageBlob: Blob; words: OcrWord[] }> = [];
            for (let idx = 0; idx < pageRenderImages.length; idx += 1) {
              const recognizedWords = pageResults[idx]?.words ?? [];
              const remappedWords = await remapWordsToRenderBlob(recognizedWords, pageImages[idx], pageRenderImages[idx]);
              remappedLayers.push({ imageBlob: pageRenderImages[idx], words: remappedWords });
            }
            pageLayers = remappedLayers;
            languageDetection = detectDocumentLanguage(recognizedText);
            for (const item of pageResults) {
              usedLanguages.add(item.usedLanguage);
              if (typeof item.confidence === 'number') {
                pageConfidence.push(item.confidence);
              }
              languageFallbackUsed ||= item.languageFallbackUsed;
            }
          }
        }
      } else {
        const preparedBlob = await preprocessImageForOcr(blob, ocrPreprocessProfile(options.mode));
        const imageRenderBlob =
          blob.type === 'image/png' || blob.type === 'image/jpeg' || blob.type === 'image/jpg'
            ? blob
            : preparedBlob;
        let finalWordsOcrBlob = preparedBlob;
        updateFileProgress(24);
        if (options.languageMode === 'auto') {
          const probe = await recognizeChunk(preparedBlob, initialLanguagePack);
          updateFileProgress(48);
          const probeDetection = detectDocumentLanguage(probe.text);
          finalLanguagePack = enrichAutoLanguagePack(selectAutoOcrLanguagePack(probeDetection), probe.text);

          let finalResult = finalLanguagePack !== initialLanguagePack
            ? await recognizeChunk(preparedBlob, finalLanguagePack)
            : probe;
          autoSecondPassApplied = finalLanguagePack !== initialLanguagePack;

          if (options.mode === 'accurate' && isLowConfidence(finalResult)) {
            const aggressiveBlob = await preprocessImageForOcr(blob, ocrPreprocessProfile(options.mode, true));
            const retried = await recognizeChunk(aggressiveBlob, finalLanguagePack);
            if (scoreResult(retried) >= scoreResult(finalResult) + 2 || (!isLowConfidence(retried) && isLowConfidence(finalResult))) {
              finalResult = retried;
              finalWordsOcrBlob = aggressiveBlob;
            }
            lowConfidenceRetryApplied = true;
            lowConfidenceRetryCount = 1;
            updateFileProgress(72);
          }

          updateFileProgress(80);
          pageAnalysis = analyzePages([{ text: finalResult.text, words: finalResult.words }], options);
          recognizedText = pageAnalysis[0]?.text ?? finalResult.text;
          const remappedWords = await remapWordsToRenderBlob(finalResult.words, finalWordsOcrBlob, imageRenderBlob);
          pageLayers = [{ imageBlob: imageRenderBlob, words: remappedWords }];
          languageDetection = detectDocumentLanguage(recognizedText);
          usedLanguages.add(finalResult.usedLanguage);
          if (typeof finalResult.confidence === 'number') {
            pageConfidence.push(finalResult.confidence);
          }
          languageFallbackUsed = finalResult.languageFallbackUsed;
        } else {
          let recognized = await recognizeChunk(preparedBlob, initialLanguagePack);
          if (options.mode === 'accurate' && isLowConfidence(recognized)) {
            const aggressiveBlob = await preprocessImageForOcr(blob, ocrPreprocessProfile(options.mode, true));
            const retried = await recognizeChunk(aggressiveBlob, initialLanguagePack);
            if (scoreResult(retried) >= scoreResult(recognized) + 2 || (!isLowConfidence(retried) && isLowConfidence(recognized))) {
              recognized = retried;
              finalWordsOcrBlob = aggressiveBlob;
            }
            lowConfidenceRetryApplied = true;
            lowConfidenceRetryCount = 1;
            updateFileProgress(70);
          }

          updateFileProgress(80);
          pageAnalysis = analyzePages([{ text: recognized.text, words: recognized.words }], options);
          recognizedText = pageAnalysis[0]?.text ?? recognized.text;
          const remappedWords = await remapWordsToRenderBlob(recognized.words, finalWordsOcrBlob, imageRenderBlob);
          pageLayers = [{ imageBlob: imageRenderBlob, words: remappedWords }];
          languageDetection = detectDocumentLanguage(recognizedText);
          usedLanguages.add(recognized.usedLanguage);
          if (typeof recognized.confidence === 'number') {
            pageConfidence.push(recognized.confidence);
          }
          languageFallbackUsed = recognized.languageFallbackUsed;
        }

        updateFileProgress(88, {
          pageIndex: 0,
          pageCount: 1,
          completedPages: 1,
          partialText: recognizedText,
          partialOutputId: await savePartialResult(fs, recognizedText),
        });
      }

      const fontProfile = buildFontSupportProfile(recognizedText, languageDetection);
      const averageConfidence = pageConfidence.length > 0
        ? Number((pageConfidence.reduce((sum, value) => sum + value, 0) / pageConfidence.length).toFixed(2))
        : null;

      const payload = {
        sourceFileId: entry.id,
        sourceMime: mime,
        sourceBytes: byteLength,
        ocr: {
          mode: options.mode,
          languageMode: options.languageMode,
          preserveFormatting: options.preserveFormatting,
          detectTables: options.detectTables,
          requestedLanguage: initialLanguagePack,
          suggestedLanguagePack: options.languageMode === 'auto' ? finalLanguagePack : null,
          autoSecondPassApplied: options.languageMode === 'auto' ? autoSecondPassApplied : false,
          lowConfidenceRetryApplied,
          lowConfidenceRetryCount,
          usedLanguages: Array.from(usedLanguages),
          averageConfidence,
          languageFallbackUsed,
          usedEmbeddedText,
        },
        languageDetection,
        fontSupport: fontProfile,
        recognizedText,
        pages: pageAnalysis.map((page, index) => ({
          index,
          text: page.text,
          tables: page.tables.map((table) => ({
            columns: table.columns,
            rows: table.rows.map((row) => row.cells.slice(0, table.columns).map((cell) => cell.text)),
          })),
        })),
      };

      const txtReport = new Blob([payload.recognizedText], { type: 'text/plain' });

      const reportBlob = options.outputFormat === 'searchable-pdf'
        ? await (async () => {
          if (usedEmbeddedText && mime === 'application/pdf') {
            // The source PDF already has a text layer; return PDF to preserve searchable preview/download UX.
            return blob;
          }
          if (pageLayers.length === 0) {
            throw new Error('Cannot create Searchable PDF: no page layers available from OCR');
          }
          try {
            return await buildSearchablePdfFromImages(pageLayers);
          } catch (err) {
            throw new Error(
              `Failed to build Searchable PDF: ${err instanceof Error ? err.message : 'unknown error'}`,
            );
          }
        })()
        : options.outputFormat === 'json'
          ? new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
          : txtReport;

      updateFileProgress(92);
      const out = await fs.write(reportBlob);
      outputIds.push(out.id);

      updateFileProgress(100);
    }

    return { outputIds };
  } finally {
    await ocr.terminate?.();
  }
};
