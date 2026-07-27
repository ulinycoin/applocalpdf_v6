import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import type {
  WorkerStudioEditElement,
  WorkerStudioFontFamilyId,
  WorkerStudioTextEditElement,
  WorkerStudioStrokeEditElement,
  WorkerStudioRectEditElement,
  WorkerStudioImageEditElement,
  WorkerStudioFormFieldEditElement,
  WorkerStudioWatermarkEditElement,
} from '../../core/types/contracts';
import { parsePdfTextOperators } from './pdf-content-stream-parser';
import {
  collectOperatorsForRedaction,
  collectOperatorsInRect,
  isStudioTextEditV2Enabled,
  matchesPatchedOperator,
  redactOperatorsInDecodedStreams,
  resolveTargetRect,
  resolveTypographyFromElement,
  resolveFontSizeFromElement,
  textElementMovedFromOriginal as hasTextElementMovedFromOriginal,
  type StreamOperatorRef,
} from './text-edit';

const getPdfCore = (() => {
  let promise: Promise<{ decodePDFRawStream?: (stream: unknown) => { decode: () => Uint8Array } } | null> | null = null;
  return (): Promise<{ decodePDFRawStream?: (stream: unknown) => { decode: () => Uint8Array } } | null> => {
    if (!promise) {
      promise = Promise.race([
        import('pdf-lib/es/core/index.js')
          .then((module) => {
            const maybeCore = (module as { default?: { decodePDFRawStream?: (stream: unknown) => { decode: () => Uint8Array } } }).default;
            return maybeCore ?? null;
          })
          .catch(() => null),
        new Promise<null>((resolve) => {
          setTimeout(() => resolve(null), 300);
        }),
      ]);
    }
    return promise;
  };
})();

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function sanitizeInlineText(value: string): string {
  return value.replace(/\0/g, '').replace(/[\r\n]+/gu, ' ');
}

function measureTextWidthWithTracking(font: PDFFont, text: string, fontSize: number, tracking: number): number {
  if (!text) {
    return 0;
  }
  return font.widthOfTextAtSize(text, fontSize) + tracking * Math.max(0, text.length - 1);
}

function segmentTextForWrapping(text: string): string[] {
  const source = text || '';
  if (!source) {
    return [];
  }

  if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
    const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
    return Array.from(segmenter.segment(source), (item) => item.segment).filter(Boolean);
  }

  return Array.from(source).filter(Boolean);
}

function layoutTextAtFixedFontSize(params: {
  font: PDFFont;
  text: string;
  blockWidth: number;
  fontSize: number;
  tracking: number;
}): { lines: Array<{ text: string; width: number }>; overflow: boolean } {
  const { font, text, blockWidth, fontSize, tracking } = params;
  const safeText = text.trim() || ' ';
  const maxWidth = Math.max(1, blockWidth);
  const words = safeText.split(/\s+/u).filter(Boolean);
  const lines: Array<{ text: string; width: number }> = [];

  const measure = (value: string) => measureTextWidthWithTracking(font, value, fontSize, tracking);
  const pushLine = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) {
      return;
    }
    lines.push({ text: trimmed, width: measure(trimmed) });
  };

  const breakWord = (word: string): string[] => {
    const segments = segmentTextForWrapping(word);
    if (segments.length <= 1) {
      return [word];
    }

    const chunks: string[] = [];
    let chunk = '';
    for (const segment of segments) {
      const next = chunk ? `${chunk}${segment}` : segment;
      if (!chunk || measure(next) <= maxWidth) {
        chunk = next;
        continue;
      }
      chunks.push(chunk);
      chunk = segment;
    }
    if (chunk) {
      chunks.push(chunk);
    }
    return chunks.length > 0 ? chunks : [word];
  };

  let currentLine = '';
  for (const word of words) {
    if (!currentLine) {
      if (measure(word) <= maxWidth) {
        currentLine = word;
        continue;
      }

      const chunks = breakWord(word);
      if (chunks.length === 1) {
        currentLine = chunks[0]!;
        continue;
      }
      for (let i = 0; i < chunks.length - 1; i += 1) {
        pushLine(chunks[i]!);
      }
      currentLine = chunks[chunks.length - 1] ?? '';
      continue;
    }

    const nextLine = `${currentLine} ${word}`;
    if (measure(nextLine) <= maxWidth) {
      currentLine = nextLine;
      continue;
    }

    pushLine(currentLine);

    if (measure(word) <= maxWidth) {
      currentLine = word;
      continue;
    }

    const chunks = breakWord(word);
    if (chunks.length === 1) {
      currentLine = chunks[0]!;
      continue;
    }
    for (let i = 0; i < chunks.length - 1; i += 1) {
      pushLine(chunks[i]!);
    }
    currentLine = chunks[chunks.length - 1] ?? '';
  }

  if (currentLine) {
    pushLine(currentLine);
  }

  const overflow = lines.some((line) => line.width > maxWidth + 0.5);
  return {
    lines: lines.length > 0 ? lines : [{ text: safeText, width: measure(safeText) }],
    overflow,
  };
}

function hexToRgb(color: string): { r: number; g: number; b: number } {
  const normalized = color.replace('#', '').trim();
  const safe = normalized.length === 3
    ? normalized
      .split('')
      .map((ch) => ch + ch)
      .join('')
    : normalized.padEnd(6, '0').slice(0, 6);
  const intValue = Number.parseInt(safe, 16);
  if (Number.isNaN(intValue)) {
    return { r: 0, g: 0, b: 0 };
  }
  return {
    r: ((intValue >> 16) & 255) / 255,
    g: ((intValue >> 8) & 255) / 255,
    b: (intValue & 255) / 255,
  };
}

function getPdfFontName(
  fontFamily: WorkerStudioFontFamilyId,
  fontWeight: 'normal' | 'bold',
  fontStyle: 'normal' | 'italic',
) {
  if (fontFamily === 'times') {
    if (fontWeight === 'bold' && fontStyle === 'italic') {
      return StandardFonts.TimesRomanBoldItalic;
    }
    if (fontWeight === 'bold') {
      return StandardFonts.TimesRomanBold;
    }
    if (fontStyle === 'italic') {
      return StandardFonts.TimesRomanItalic;
    }
    return StandardFonts.TimesRoman;
  }

  if (fontFamily === 'mono') {
    if (fontWeight === 'bold') {
      return StandardFonts.CourierBold;
    }
    return StandardFonts.Courier;
  }

  if (fontWeight === 'bold' && fontStyle === 'italic') {
    return StandardFonts.HelveticaBoldOblique;
  }
  if (fontWeight === 'bold') {
    return StandardFonts.HelveticaBold;
  }
  if (fontStyle === 'italic') {
    return StandardFonts.HelveticaOblique;
  }
  return StandardFonts.Helvetica;
}

function escapePdfLiteralString(input: string): string {
  return input
    .replace(/\\/gu, '\\\\')
    .replace(/\(/gu, '\\(')
    .replace(/\)/gu, '\\)')
    .replace(/\r/gu, '\\r')
    .replace(/\n/gu, '\\n');
}

function canEncodeAsLatin1(input: string): boolean {
  for (let i = 0; i < input.length; i += 1) {
    if (input.charCodeAt(i) > 0xff) {
      return false;
    }
  }
  return true;
}

function containsArabic(input: string): boolean {
  return /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/u.test(input);
}

function containsCyrillic(input: string): boolean {
  return /\p{Script=Cyrillic}/u.test(input);
}

function containsCjk(input: string): boolean {
  return /[\u3040-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF\uAC00-\uD7AF]/u.test(input);
}

function containsDevanagari(input: string): boolean {
  return /[\u0900-\u097F]/u.test(input);
}

const LATVIAN_TRANSLITERATION: Record<string, string> = {
  ā: 'a', Ā: 'A', č: 'c', Č: 'C', ē: 'e', Ē: 'E',
  ģ: 'g', Ģ: 'G', ī: 'i', Ī: 'I', ķ: 'k', Ķ: 'K',
  ļ: 'l', Ļ: 'L', ņ: 'n', Ņ: 'N', ū: 'u', Ū: 'U',
  š: 's', Š: 'S', ž: 'z', Ž: 'Z',
};

function replaceUnsupportedChars(input: string): string {
  return input.replace(/[^\u0000-\u00FF]/gu, (char) => LATVIAN_TRANSLITERATION[char] ?? '?');
}

function canFontEncodeText(font: PDFFont, text: string): boolean {
  try {
    font.encodeText(text || ' ');
    return true;
  } catch {
    return false;
  }
}

function hasMissingGlyphs(font: PDFFont, text: string): boolean {
  for (const char of text) {
    if (char > '\u00FF') {
      try {
        const width = font.widthOfTextAtSize(char, 12);
        if (width < 0.1) {
          return true;
        }
      } catch {
        return true;
      }
      break;
    }
  }
  return false;
}

function isAutoWhiteoutRect(element: WorkerStudioEditElement): boolean {
  if (element.type !== 'rect') {
    return false;
  }
  const fill = String(element.fill || '').trim().toLowerCase();
  const stroke = String(element.stroke || '').trim().toLowerCase();
  return (
    (fill === '#ffffff' || fill === '#fff')
    && (stroke === 'transparent' || stroke === '#000000' || stroke === '#ffffff' || stroke === '#fff')
    && (element.strokeWidth ?? 0) <= 0.001
    && (element.opacity ?? 1) >= 0.99
  );
}

function encodeLatin1(input: string): Uint8Array {
  const bytes = new Uint8Array(input.length);
  for (let i = 0; i < input.length; i += 1) {
    bytes[i] = input.charCodeAt(i) & 0xff;
  }
  return bytes;
}

function dataUrlToBytes(dataUrl: string): { mimeType: string; bytes: Uint8Array } | null {
  const match = /^data:(image\/(?:png|jpeg|jpg));base64,([a-z0-9+/=]+)$/iu.exec(dataUrl.trim());
  if (!match) {
    return null;
  }
  const mimeType = match[1]!.toLowerCase() === 'image/jpg' ? 'image/jpeg' : match[1]!.toLowerCase();
  const base64 = match[2]!;
  try {
    const decoded = atob(base64);
    const bytes = new Uint8Array(decoded.length);
    for (let i = 0; i < decoded.length; i += 1) {
      bytes[i] = decoded.charCodeAt(i);
    }
    return { mimeType, bytes };
  } catch {
    return null;
  }
}

async function decodePageStreamToLatin1(contentStream: unknown): Promise<string | null> {
  if (
    !contentStream
    || typeof contentStream !== 'object'
    || typeof (contentStream as { getContents?: unknown }).getContents !== 'function'
  ) {
    return null;
  }

  if (typeof (contentStream as { getUnencodedContents?: unknown }).getUnencodedContents === 'function') {
    const bytes = (contentStream as { getUnencodedContents: () => Uint8Array }).getUnencodedContents();
    return new TextDecoder('latin1').decode(bytes);
  }

  const core = await getPdfCore();
  if (core?.decodePDFRawStream) {
    try {
      const decoded = core.decodePDFRawStream(contentStream);
      if (decoded && typeof decoded.decode === 'function') {
        return new TextDecoder('latin1').decode(decoded.decode());
      }
    } catch {
      // Fallback to raw decode paths.
    }
  }

  const rawBytes = (contentStream as { getContents: () => Uint8Array }).getContents();
  const direct = new TextDecoder('latin1').decode(rawBytes);
  if (/\b(Tj|TJ)\b/u.test(direct)) {
    return direct;
  }
  if (typeof DecompressionStream === 'undefined') {
    return '';
  }
  const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number): Promise<T> => {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        promise,
        new Promise<T>((_, reject) => {
          timeoutId = setTimeout(() => reject(new Error('DECOMPRESS_TIMEOUT')), timeoutMs);
        }),
      ]);
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  };
  for (const format of ['deflate', 'deflate-raw'] as const) {
    try {
      const inflated = await withTimeout((async () => {
        const stream = new DecompressionStream(format);
        const writer = stream.writable.getWriter();
        const safeBytes = new Uint8Array(rawBytes.byteLength);
        safeBytes.set(rawBytes);
        await writer.write(safeBytes);
        await writer.close();
        return new Uint8Array(await new Response(stream.readable).arrayBuffer());
      })(), 250);
      const decoded = new TextDecoder('latin1').decode(inflated);
      if (/\b(Tj|TJ)\b/u.test(decoded)) {
        return decoded;
      }
    } catch {
      // Try next format.
    }
  }
  return '';
}

function selectOperatorCandidateByPosition(params: {
  candidates: Array<{ streamIndex: number; operator: ReturnType<typeof parsePdfTextOperators>[number] }>;
  pageWidth: number;
  pageHeight: number;
  targetXRatio: number;
  targetYRatio: number;
  targetWidthRatio: number;
  targetHeightRatio: number;
  targetTextAlign: 'left' | 'center' | 'right';
  targetText: string;
}): { streamIndex: number; operator: ReturnType<typeof parsePdfTextOperators>[number] } | null {
  const {
    candidates,
    pageWidth,
    pageHeight,
    targetXRatio,
    targetYRatio,
    targetWidthRatio,
    targetHeightRatio,
    targetTextAlign,
    targetText,
  } = params;
  if (candidates.length === 0) {
    return null;
  }

  const selectLexicalCandidate = () => {
    const targetTokens = targetText
      .toLowerCase()
      .split(/\s+/u)
      .map((token) => token.trim())
      .filter(Boolean);
    if (targetTokens.length === 0) {
      return null;
    }
    const lexical = candidates
      .map((candidate) => {
        const sourceText = candidate.operator.textSegments.join(' ').toLowerCase();
        const overlap = targetTokens.filter((token) => sourceText.includes(token)).length;
        const score = overlap / targetTokens.length;
        return { candidate, score };
      })
      .sort((left, right) => right.score - left.score);
    const bestLexical = lexical[0];
    const secondLexical = lexical[1];
    if (!bestLexical || bestLexical.score <= 0) {
      return null;
    }
    if (secondLexical && bestLexical.score - secondLexical.score < 0.25) {
      return null;
    }
    return bestLexical.candidate;
  };

  const targetLeftX = targetXRatio * pageWidth;
  const targetWidth = targetWidthRatio * pageWidth;
  const targetX = targetTextAlign === 'center'
    ? targetLeftX + targetWidth / 2
    : targetTextAlign === 'right'
      ? targetLeftX + targetWidth
      : targetLeftX;
  const targetY = pageHeight - ((targetYRatio + targetHeightRatio * 0.5) * pageHeight);

  const scored = candidates
    .filter((candidate) => Number.isFinite(candidate.operator.textMatrixX) && Number.isFinite(candidate.operator.textMatrixY))
    .map((candidate) => {
      const dx = (candidate.operator.textMatrixX as number) - targetX;
      const dy = (candidate.operator.textMatrixY as number) - targetY;
      const normDx = Math.abs(dx) / Math.max(1, pageWidth);
      const normDy = Math.abs(dy) / Math.max(1, pageHeight);
      const posScore = Math.hypot(normDx, normDy);
      const sourceText = candidate.operator.textSegments.join('');
      const estimatedWidth = Math.max(
        0,
        sourceText.length * Math.max(4, candidate.operator.fontSize ?? 12) * 0.5,
      );
      const widthScore = Math.abs(estimatedWidth - targetWidth) / Math.max(1, targetWidth);
      // Width mismatch is a weak signal: user edit boxes are often wider than source glyph runs.
      const score = posScore + Math.min(0.08, widthScore * 0.05);
      return {
        candidate,
        score,
        normDx,
        normDy,
        widthScore,
      };
    })
    .sort((left, right) => (
      left.score - right.score
      || left.normDy - right.normDy
      || left.normDx - right.normDx
      || left.widthScore - right.widthScore
      || left.candidate.streamIndex - right.candidate.streamIndex
      || left.candidate.operator.start - right.candidate.operator.start
    ));

  if (scored.length === 0) {
    return selectLexicalCandidate();
  }

  const best = scored[0];
  const second = scored[1];
  if (!best) {
    return null;
  }
  if (best.score > 0.08) {
    return selectLexicalCandidate();
  }
  if (
    second
    && second.score < 0.06
    && second.score - best.score < 0.01
    && Math.abs(second.normDy - best.normDy) < 0.002
    && Math.abs(second.normDx - best.normDx) < 0.002
    && Math.abs(second.widthScore - best.widthScore) < 0.05
  ) {
    return null;
  }
  return best.candidate;
}

interface PageStreamState {
  pdf: PDFDocument;
  resolved: any;
  decodedByStream: Array<{ index: number; content: string; operators: ReturnType<typeof parsePdfTextOperators> }>;
  PDFName: typeof import('pdf-lib').PDFName;
  page: ReturnType<PDFDocument['getPage']>;
}

async function loadPageStreamState(pdf: PDFDocument, pageIndex: number): Promise<PageStreamState | null> {
  const { PDFName } = await import('pdf-lib');
  const page = pdf.getPage(pageIndex);
  const contentsRef = page.node.get(PDFName.of('Contents'));
  if (!contentsRef) {
    return null;
  }
  const resolved = pdf.context.lookup(contentsRef as any) as any;
  const streamEntries: Array<{ stream: any; index: number }> = [];
  if (resolved && typeof resolved.size === 'function' && typeof resolved.get === 'function') {
    const count = Number(resolved.size());
    for (let i = 0; i < count; i += 1) {
      streamEntries.push({ stream: pdf.context.lookup(resolved.get(i)), index: i });
    }
  } else {
    streamEntries.push({ stream: resolved, index: 0 });
  }
  if (streamEntries.length === 0) {
    return null;
  }

  const decodedByStream: Array<{ index: number; content: string; operators: ReturnType<typeof parsePdfTextOperators> }> = [];
  for (const entry of streamEntries) {
    const decodedContent = await decodePageStreamToLatin1(entry.stream);
    if (decodedContent === null || decodedContent.length === 0) {
      continue;
    }
    const operators = parsePdfTextOperators(decodedContent);
    if (operators.length === 0) {
      continue;
    }
    decodedByStream.push({
      index: entry.index,
      content: decodedContent,
      operators,
    });
  }
  if (decodedByStream.length === 0) {
    return null;
  }

  return { pdf, resolved, decodedByStream, PDFName, page };
}

function tryPatchStreamOperator(params: {
  state: PageStreamState;
  text: string;
  targetXRatio: number;
  targetYRatio: number;
  targetWidthRatio: number;
  targetHeightRatio: number;
  targetTextAlign: 'left' | 'center' | 'right';
  pageWidth: number;
  pageHeight: number;
  persist?: boolean;
}): { applied: boolean; reason?: string; patchedOperator?: StreamOperatorRef } {
  const { state, text } = params;
  const persist = params.persist !== false;
  const { resolved, decodedByStream, PDFName, page } = state;

  const candidates = decodedByStream.flatMap((entry) => entry.operators.map((operator) => ({
    streamIndex: entry.index,
    operator,
  })));

  let target: { streamIndex: number; operator: ReturnType<typeof parsePdfTextOperators>[number] } | null = null;
  if (candidates.length === 1) {
    target = candidates[0] ?? null;
  } else if (candidates.length > 1) {
    target = selectOperatorCandidateByPosition({
      candidates,
      pageWidth: params.pageWidth,
      pageHeight: params.pageHeight,
      targetXRatio: params.targetXRatio,
      targetYRatio: params.targetYRatio,
      targetWidthRatio: params.targetWidthRatio,
      targetHeightRatio: params.targetHeightRatio,
      targetTextAlign: params.targetTextAlign,
      targetText: text,
    });
    if (!target) {
      return { applied: false, reason: 'AMBIGUOUS_TEXT_OPERATORS' };
    }
  } else {
    return { applied: false, reason: 'TEXT_OPERATOR_NOT_FOUND' };
  }

  if (!target || (target.operator.operator !== 'Tj' && target.operator.operator !== 'TJ')) {
    return { applied: false, reason: 'TEXT_OPERATOR_UNSUPPORTED' };
  }

  const streamTarget = decodedByStream.find((entry) => entry.index === target!.streamIndex);
  if (!streamTarget) {
    return { applied: false, reason: 'STREAM_NOT_FOUND' };
  }

  const replacement = `(${escapePdfLiteralString(text)}) Tj`;
  const updatedContent = `${streamTarget.content.slice(0, target.operator.start)}${replacement}${streamTarget.content.slice(target.operator.end)}`;

  // Update the in-memory decoded content so subsequent patches in the same pass see the change.
  streamTarget.content = updatedContent;
  streamTarget.operators = parsePdfTextOperators(updatedContent);

  if (persist) {
    const updatedBytes = encodeLatin1(updatedContent);
    const updatedStream = state.pdf.context.flateStream(updatedBytes);
    const updatedRef = state.pdf.context.register(updatedStream);

    if (resolved && typeof resolved.size === 'function' && typeof resolved.set === 'function') {
      resolved.set(target.streamIndex, updatedRef);
    } else {
      page.node.set(PDFName.of('Contents'), updatedRef);
    }
  }

  return {
    applied: true,
    patchedOperator: {
      streamIndex: target.streamIndex,
      operator: target.operator,
    },
  };
}

function persistDecodedStreamChanges(state: PageStreamState, modifiedStreamIndices: ReadonlySet<number>): void {
  if (modifiedStreamIndices.size === 0) {
    return;
  }

  const { pdf, resolved, decodedByStream, PDFName, page } = state;
  for (const entry of decodedByStream) {
    if (!modifiedStreamIndices.has(entry.index)) {
      continue;
    }
    const updatedBytes = encodeLatin1(entry.content);
    const updatedStream = pdf.context.flateStream(updatedBytes);
    const updatedRef = pdf.context.register(updatedStream);

    if (resolved && typeof resolved.size === 'function' && typeof resolved.set === 'function') {
      resolved.set(entry.index, updatedRef);
    } else if (entry.index === 0) {
      page.node.set(PDFName.of('Contents'), updatedRef);
    }
  }
}

async function tryApplyTrueReplaceSingleTextOperator(params: {
  pdf: PDFDocument;
  pageIndex: number;
  text: string;
  targetXRatio: number;
  targetYRatio: number;
  targetWidthRatio: number;
  targetHeightRatio: number;
  targetTextAlign: 'left' | 'center' | 'right';
  pageWidth: number;
  pageHeight: number;
  state?: PageStreamState;
}): Promise<{ applied: boolean; reason?: string }> {
  const { text } = params;
  if (!canEncodeAsLatin1(text)) {
    return { applied: false, reason: 'NON_LATIN1_TEXT' };
  }

  const state = params.state ?? await loadPageStreamState(params.pdf, params.pageIndex);
  if (!state) {
    return { applied: false, reason: 'STREAM_DECODE_FAILED' };
  }

  return tryPatchStreamOperator({
    state,
    text,
    targetXRatio: params.targetXRatio,
    targetYRatio: params.targetYRatio,
    targetWidthRatio: params.targetWidthRatio,
    targetHeightRatio: params.targetHeightRatio,
    targetTextAlign: params.targetTextAlign,
    pageWidth: params.pageWidth,
    pageHeight: params.pageHeight,
  });
}

export async function applyStudioTextEditsToPdfBytes(params: {
  sourceBytes: Uint8Array;
  pageIndex: number;
  elements: WorkerStudioEditElement[];
  signal?: AbortSignal;
}): Promise<{
  outputBytes: Uint8Array;
  overflowDetected: boolean;
  trueReplaceApplied: boolean;
  trueReplaceFallbackReason?: string;
  formFieldErrors?: string[];
}> {
  const pdf = await PDFDocument.load(params.sourceBytes);
  if (params.pageIndex < 0 || params.pageIndex >= pdf.getPageCount()) {
    throw new Error(`Page index out of range: ${params.pageIndex}`);
  }

  const page = pdf.getPage(params.pageIndex);
  const pageWidth = page.getWidth();
  const pageHeight = page.getHeight();

  pdf.registerFontkit(fontkit);

  const fontCache = new Map<string, PDFFont>();
  const imageCache = new Map<string, Awaited<ReturnType<typeof pdf.embedPng>>>();

  const getStandardFont = async (family: WorkerStudioFontFamilyId, weight: 'normal' | 'bold', style: 'normal' | 'italic') => {
    const fontName = getPdfFontName(family, weight, style);
    const key = String(fontName);
    const cached = fontCache.get(key);
    if (cached) return cached;
    const embedded = await pdf.embedFont(fontName);
    fontCache.set(key, embedded);
    return embedded;
  };

  // Embed Cyrillic and Latin-Ext Noto fonts. String literals in import() let Vite resolve them
  // at build time; each is wrapped in try/catch so one failure doesn't block the other.
  try {
    const cyrillicMod = await import('@fontsource/noto-sans/files/noto-sans-cyrillic-400-normal.woff?url') as { default: string };
    const resp = await fetch(cyrillicMod.default);
    if (resp.ok) {
      const bytes = new Uint8Array(await resp.arrayBuffer());
      fontCache.set('noto-sans-cyrillic-400', await pdf.embedFont(bytes, { subset: true }));
    }
  } catch { /* skip */ }

  try {
    const latinExtMod = await import('@fontsource/noto-sans/files/noto-sans-latin-ext-400-normal.woff?url') as { default: string };
    const resp = await fetch(latinExtMod.default);
    if (resp.ok) {
      const bytes = new Uint8Array(await resp.arrayBuffer());
      fontCache.set('noto-sans-latin-ext-400', await pdf.embedFont(bytes, { subset: true }));
    }
  } catch { /* skip */ }

  // Roboto from /public/fonts — covers Latin, Latin-Ext, Cyrillic; works as fallback.
  try {
    const robotoResp = await fetch('/fonts/Roboto-Regular.ttf');
    if (robotoResp.ok) {
      const bytes = new Uint8Array(await robotoResp.arrayBuffer());
      const font = await pdf.embedFont(bytes, { subset: true });
      fontCache.set('roboto-regular', font);
    }
  } catch { /* skip */ }

  // Standard PDF fonts for ASCII-only text.
  void pdf.embedFont(StandardFonts.Helvetica).then((f) => fontCache.set('helvetica', f));
  void pdf.embedFont(StandardFonts.TimesRoman).then((f) => fontCache.set('times', f));
  void pdf.embedFont(StandardFonts.Courier).then((f) => fontCache.set('courier', f));

  const getPreferredFontCandidates = async (
    family: WorkerStudioFontFamilyId,
    weight: 'normal' | 'bold',
    style: 'normal' | 'italic',
    text: string,
  ): Promise<PDFFont[]> => {
    const needsExtended = !canEncodeAsLatin1(text);
    const candidates: PDFFont[] = [];
    const addUnique = (font: PDFFont | null) => {
      if (font && !candidates.includes(font)) {
        candidates.push(font);
      }
    };

    if (!needsExtended) {
      addUnique(await getStandardFont(family, weight, style));
    }

    addUnique(fontCache.get('noto-sans-latin-ext-400') ?? null);
    addUnique(fontCache.get('noto-sans-cyrillic-400') ?? null);
    addUnique(fontCache.get('noto-sans-latin-400') ?? null);
    addUnique(fontCache.get('roboto-regular') ?? null);

    return candidates;
  };



  const resolveRenderableText = async (params: {
    family: WorkerStudioFontFamilyId;
    weight: 'normal' | 'bold';
    style: 'normal' | 'italic';
    text: string;
  }): Promise<{ font: PDFFont; text: string }> => {
    const needsExtended = !canEncodeAsLatin1(params.text);
    const candidates = await getPreferredFontCandidates(params.family, params.weight, params.style, params.text);
    for (const candidate of candidates) {
      if (canFontEncodeText(candidate, params.text)) {
        if (!needsExtended || !hasMissingGlyphs(candidate, params.text)) {
          return { font: candidate, text: params.text };
        }
      }
    }

    if (needsExtended) {
      // Transiterate to ASCII — better than rectangles.
      const bestFallback = fontCache.get('noto-sans-latin-ext-400')
        ?? fontCache.get('roboto-regular')
        ?? await getStandardFont('sora', 'normal', 'normal');
      return { font: bestFallback, text: replaceUnsupportedChars(params.text) || ' ' };
    }
    return { font: await getStandardFont('sora', 'normal', 'normal'), text: params.text };
  };

  let overflowDetected = false;
  const usedFormFieldNames = new Set<string>();
  let formAppearanceFont: PDFFont | null = null;
  let trueReplaceApplied = false;
  let trueReplaceFallbackReason: string | undefined = 'INELIGIBLE_EDIT_PAYLOAD';
  const formFieldErrors: string[] = [];
  const consumedTextIds = new Set<string>();

  const streamState = await loadPageStreamState(pdf, params.pageIndex);

  applyTrueReplaceToTextElements(params.elements, streamState);
  params.signal?.throwIfAborted();

  for (const element of params.elements) {
    params.signal?.throwIfAborted();
    await processEditElement(element);
  }

  const outputBytes = await pdf.save();
  const stableBytes = new Uint8Array(outputBytes.byteLength);
  stableBytes.set(outputBytes);
  return {
    outputBytes: stableBytes,
    overflowDetected,
    trueReplaceApplied,
    trueReplaceFallbackReason,
    formFieldErrors: formFieldErrors.length > 0 ? formFieldErrors : undefined,
  };

  async function applyTrueReplaceToTextElements(
    elements: WorkerStudioEditElement[],
    streamState: PageStreamState | null,
  ): Promise<void> {
    const textEditV2 = isStudioTextEditV2Enabled();
    const modifiedStreamIndices = new Set<number>();
    const textElements = elements.filter((e): e is WorkerStudioTextEditElement => e.type === 'text');
    for (const target of textElements) {
      const sanitizedText = sanitizeInlineText(target.text || ' ');
      const movedFromOriginal = hasTextElementMovedFromOriginal(target);
      const targetRect = resolveTargetRect(target);
      if (!streamState) {
        trueReplaceFallbackReason = 'STREAM_DECODE_FAILED';
        continue;
      }

      const isNonLatin1 = !canEncodeAsLatin1(sanitizedText);
      const patchText = movedFromOriginal || isNonLatin1 ? '' : sanitizedText;

      const result = tryPatchStreamOperator({
        state: streamState,
        text: patchText,
        targetXRatio: targetRect.x,
        targetYRatio: targetRect.y,
        targetWidthRatio: targetRect.w,
        targetHeightRatio: targetRect.h,
        targetTextAlign: target.textAlign,
        pageWidth,
        pageHeight,
        persist: !textEditV2,
      });
      if (result.applied) {
        if (result.patchedOperator) {
          modifiedStreamIndices.add(result.patchedOperator.streamIndex);
        }
        if (!movedFromOriginal && !isNonLatin1) {
          consumedTextIds.add(target.id);
        }
        trueReplaceApplied = true;
        trueReplaceFallbackReason = undefined;
      } else {
        trueReplaceFallbackReason = result.reason ?? 'TRUE_REPLACE_FAILED';
      }

      if (textEditV2) {
        const operatorsInRect = collectOperatorsForRedaction({
          decodedByStream: streamState.decodedByStream,
          pageWidth,
          pageHeight,
          rect: targetRect,
          anchorOperator: result.patchedOperator?.operator,
          fontSizeRatio: target.sourceFontSizeRatio,
        });
        const shouldPreservePatch = result.applied && !movedFromOriginal && !isNonLatin1;
        const operatorsToRedact = shouldPreservePatch && result.patchedOperator
          ? operatorsInRect.filter((item) => !matchesPatchedOperator(item, result.patchedOperator))
          : operatorsInRect;
        if (operatorsToRedact.length > 0) {
          for (const item of operatorsToRedact) {
            modifiedStreamIndices.add(item.streamIndex);
          }
          redactOperatorsInDecodedStreams(streamState.decodedByStream, operatorsToRedact);
        }
      }
    }

    if (textEditV2 && streamState && modifiedStreamIndices.size > 0) {
      persistDecodedStreamChanges(streamState, modifiedStreamIndices);
    }
  }

  async function processTextEditElement(element: WorkerStudioTextEditElement): Promise<void> {
    if (consumedTextIds.has(element.id)) {
      return;
    }
    const line = sanitizeInlineText(element.text || ' ');
    const typography = resolveTypographyFromElement(element);
    const rendered = await resolveRenderableText({
      family: typography.fontFamily,
      weight: typography.fontWeight,
      style: typography.fontStyle,
      text: line,
    });
    const font = rendered.font;
    const textToDraw = rendered.text || ' ';
    const { r, g, b } = hexToRgb(element.color);
    const blockWidth = element.w * pageWidth;
    const blockHeight = element.h * pageHeight;
    const yTop = element.y * pageHeight;

    const requestedFontSize = resolveFontSizeFromElement(element, pageHeight);

    let renderFontSize = requestedFontSize;
    const textWidth = measureTextWidthWithTracking(font, textToDraw, renderFontSize, element.letterSpacing ?? 0);
    if (textWidth > blockWidth) {
      renderFontSize = clamp((renderFontSize * blockWidth) / textWidth, 4, renderFontSize);
    }

    const lineHeightFactor = typeof element.lineHeight === 'number' ? element.lineHeight : 1.2;
    const textLayout = layoutTextAtFixedFontSize({
      font,
      text: textToDraw,
      blockWidth,
      fontSize: renderFontSize,
      tracking: element.letterSpacing ?? 0,
    });
    overflowDetected ||= textLayout.overflow || (textLayout.lines.length * renderFontSize * Math.max(0.8, lineHeightFactor) > blockHeight + 0.5);

    const lineHeightPt = Math.max(1, renderFontSize * Math.max(0.8, lineHeightFactor));

    const ascentHint = element.ascentRatio !== undefined
      ? element.ascentRatio * pageHeight
      : element.ascent !== undefined
        ? element.ascent
        : undefined;

    let ascent = ascentHint ?? renderFontSize * 0.8;
    try {
      const fontAscent = font.heightAtSize(renderFontSize, { descender: false });
      if (Number.isFinite(fontAscent) && fontAscent > 0) {
        // Prefer embedded font ascent for overlay text so Save matches the preview baseline.
        if (!element.originalRect && !element.sourceFontName) {
          ascent = fontAscent;
        } else if (ascentHint === undefined) {
          ascent = fontAscent;
        }
      }
    } catch {
      // keep fallback ascent
    }

    const descent = element.descentRatio !== undefined
      ? element.descentRatio * pageHeight
      : renderFontSize * 0.2;

    const isOverlayText = !element.originalRect && !element.sourceFontName;
    let baseY: number;
    if (typeof element.baselineRatio === 'number' && Number.isFinite(element.baselineRatio)) {
      // Snapped to a PDF text-layer baseline — use it directly (WYSIWYG after Save).
      baseY = pageHeight - clamp(element.baselineRatio, 0, 1) * pageHeight;
    } else {
      // Editor positions the box by CSS top; glyphs sit inside the first line-box
      // (half-leading + em ascent). pdf-lib drawText uses the alphabetic baseline.
      const lineBox = renderFontSize * Math.max(1, lineHeightFactor);
      const halfLeading = isOverlayText ? Math.max(0, (lineBox - renderFontSize) / 2) : 0;
      const baselineFromTop = halfLeading + ascent;
      baseY = pageHeight - yTop - baselineFromTop;
    }

    // Prefer the linked `_bg` rect from the editor; avoid a second oversized whiteout here.
    // Brand-new overlay text (no originalRect) must NOT paint a white field — it covers the page.
    const hasLinkedBackground = params.elements.some(
      (candidate) => candidate.type === 'rect' && candidate.id === `${element.id}_bg`,
    );
    const isReplacingExistingPdfText = Boolean(element.originalRect || element.sourceFontName);
    if (!hasLinkedBackground && isReplacingExistingPdfText) {
      const whiteoutPadX = Math.min(1.5, blockWidth * 0.006);
      const whiteoutHeight = Math.min(ascent + descent, renderFontSize * 1.12);
      const whiteoutDescent = Math.min(descent, renderFontSize * 0.22);
      page.drawRectangle({
        x: element.x * pageWidth - whiteoutPadX,
        y: baseY - whiteoutDescent,
        width: blockWidth + whiteoutPadX * 2,
        height: whiteoutHeight,
        color: rgb(1, 1, 1),
        opacity: 1,
        borderWidth: 0,
      });
    }

    for (let lineIndex = 0; lineIndex < textLayout.lines.length; lineIndex += 1) {
      const layoutLine = textLayout.lines[lineIndex]!;
      let x = element.x * pageWidth;
      if (element.textAlign === 'center') {
        x += Math.max(0, (blockWidth - layoutLine.width) / 2);
      }
      if (element.textAlign === 'right') {
        x += Math.max(0, blockWidth - layoutLine.width);
      }
      const y = baseY - (lineIndex * lineHeightPt);
      page.drawText(layoutLine.text, {
        x,
        y,
        size: renderFontSize,
        font,
        color: rgb(r, g, b),
        opacity: element.opacity,
      });
    }
  }

  async function processFormFieldElement(element: WorkerStudioFormFieldEditElement): Promise<void> {
    const form = pdf.getForm();
    const sx = element.x * pageWidth;
    const sh = element.h * pageHeight;
    const sy = pageHeight - (element.y * pageHeight) - sh;
    const sw = element.w * pageWidth;
    const preferredName = (element.name || element.id).trim().slice(0, 120) || element.id;
    let fieldName = preferredName;
    if (usedFormFieldNames.has(fieldName)) {
      fieldName = `${preferredName}_${element.id.slice(0, 8)}`;
    }
    usedFormFieldNames.add(fieldName);

    try {
      const ensureFormAppearanceFont = async (): Promise<PDFFont> => {
        if (formAppearanceFont) {
          return formAppearanceFont;
        }
        formAppearanceFont = await pdf.embedFont(StandardFonts.Helvetica);
        return formAppearanceFont;
      };

      if (element.formType === 'text') {
        const field = form.createTextField(fieldName);
        field.addToPage(page, { x: sx, y: sy, width: sw, height: sh });
        field.setFontSize(clamp(element.fontSize || 12, 6, 72));
        field.defaultUpdateAppearances(await ensureFormAppearanceFont());
        if (element.defaultValue) {
          field.setText(element.defaultValue);
        }
        if (element.required) field.enableRequired();
      } else if (element.formType === 'multiline') {
        const field = form.createTextField(fieldName);
        field.addToPage(page, { x: sx, y: sy, width: sw, height: sh });
        field.enableMultiline();
        field.setFontSize(clamp(element.fontSize || 12, 6, 72));
        field.defaultUpdateAppearances(await ensureFormAppearanceFont());
        if (element.defaultValue) {
          field.setText(element.defaultValue);
        }
        if (element.required) field.enableRequired();
      } else if (element.formType === 'checkbox') {
        const cb = form.createCheckBox(fieldName);
        cb.addToPage(page, { x: sx, y: sy, width: sw, height: sh });
        if (element.defaultValue && element.defaultValue.toLowerCase() !== 'off') cb.check();
        if (element.required) cb.enableRequired();
      } else if (element.formType === 'radio') {
        try {
          const existing = form.getRadioGroup(fieldName);
          if (existing) {
            existing.addOptionToPage(`Opt_${crypto.randomUUID().slice(0, 4)}`, page, { x: sx, y: sy, width: sw, height: sh });
          } else {
            const rg = form.createRadioGroup(fieldName);
            rg.addOptionToPage('Choice1', page, { x: sx, y: sy, width: sw, height: sh });
            if (element.defaultValue && element.defaultValue.toLowerCase() !== 'off') rg.select('Choice1');
            if (element.required) rg.enableRequired();
          }
        } catch {
          const rg = form.createRadioGroup(fieldName);
          rg.addOptionToPage('Choice1', page, { x: sx, y: sy, width: sw, height: sh });
          if (element.defaultValue && element.defaultValue.toLowerCase() !== 'off') rg.select('Choice1');
          if (element.required) rg.enableRequired();
        }
      } else if (element.formType === 'dropdown') {
        const dropdown = form.createDropdown(fieldName);
        dropdown.addToPage(page, { x: sx, y: sy, width: sw, height: sh });
        const options = Array.isArray(element.options) && element.options.length > 0
          ? element.options
          : ['Option 1', 'Option 2', 'Option 3'];
        dropdown.addOptions(options);
        if (element.defaultValue && options.includes(element.defaultValue)) {
          dropdown.select(element.defaultValue);
        } else if (options.length > 0) {
          dropdown.select(options[0]!);
        }
        if (element.required) dropdown.enableRequired();
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      formFieldErrors.push(`Form field '${fieldName}': ${errorMessage}`);
    }
  }

  async function processWatermarkElement(element: WorkerStudioWatermarkEditElement): Promise<void> {
    const line = sanitizeInlineText(element.text || ' ');
    const rendered = await resolveRenderableText({
      family: element.fontFamily,
      weight: element.fontWeight,
      style: element.fontStyle,
      text: line,
    });
    const font = rendered.font;
    const textToDraw = rendered.text || ' ';
    const { r, g, b } = hexToRgb(element.color);
    const uiAngle = element.rotation || 0;
    const pdfAngle = -uiAngle;
    const angleRad = (pdfAngle * Math.PI) / 180;
    const cos = Math.cos(angleRad);
    const sin = Math.sin(angleRad);
    const textWidthPt = Math.max(1, font.widthOfTextAtSize(textToDraw, element.fontSize));
    const textHeightPt = Math.max(1, element.fontSize * 1.1);
    const centerOffsetX = textWidthPt * 0.5;
    const centerOffsetY = element.fontSize * 0.3;

    const drawCenteredRotatedText = (centerX: number, centerY: number) => {
      const anchorX = centerX - (centerOffsetX * cos - centerOffsetY * sin);
      const anchorY = centerY - (centerOffsetX * sin + centerOffsetY * cos);
      page.drawText(textToDraw, {
        x: anchorX,
        y: anchorY,
        size: element.fontSize,
        font,
        color: rgb(r, g, b),
        opacity: element.opacity,
        rotate: degrees(pdfAngle),
      });
    };

    if (!element.repeatEnabled) {
      const xTopLeft = element.x * pageWidth;
      const yTop = element.y * pageHeight;
      const centerX = xTopLeft + textWidthPt * 0.5;
      const centerY = pageHeight - yTop - textHeightPt * 0.5;
      drawCenteredRotatedText(centerX, centerY);
    } else {
      const charCount = Math.max(4, textToDraw.trim().length || 0);
      const baseWidthRatio = Math.max(0.08, (element.fontSize * charCount * 0.64) / pageWidth);
      const baseHeightRatio = Math.max(0.02, (element.fontSize * 1.35) / pageHeight);
      const absCos = Math.abs(Math.cos(angleRad));
      const absSin = Math.abs(Math.sin(angleRad));
      const textWidthRatio = clamp(baseWidthRatio * absCos + baseHeightRatio * absSin, 0.14, 1.2);
      const textHeightRatio = clamp(baseWidthRatio * absSin + baseHeightRatio * absCos, 0.03, 0.35);
      const stepX = Math.max(textWidthRatio * 1.22, textWidthRatio + 0.06);
      const stepY = Math.max(textHeightRatio * 1.3, textHeightRatio + 0.05);
      const startX = -textWidthRatio + clamp(element.x, 0, 1);
      const startY = -textHeightRatio + clamp(element.y, 0, 1);
      const cols = Math.max(1, Math.ceil((1 + textWidthRatio * 3) / stepX));
      const rows = Math.max(1, Math.ceil((1 + textHeightRatio * 3) / stepY));
      const MAX_WATERMARK_REPEATS = 1000;
      const repeatCount = Math.min(MAX_WATERMARK_REPEATS, cols * rows);

      for (let i = 0; i < repeatCount; i += 1) {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const staggerX = row % 2 === 1 ? stepX * 0.5 : 0;
        const xRatio = startX + staggerX + col * stepX;
        const yRatio = startY + row * stepY;
        const centerX = (xRatio + textWidthRatio * 0.5) * pageWidth;
        const centerY = pageHeight - ((yRatio + textHeightRatio * 0.5) * pageHeight);
        drawCenteredRotatedText(centerX, centerY);
      }
    }
  }

  async function processStrokeElement(element: WorkerStudioStrokeEditElement): Promise<void> {
    const strokePaths = [...(element.paths ?? []), element.points].filter((path) => path.length >= 4);
    if (strokePaths.length === 0) {
      return;
    }
    const { r, g, b } = hexToRgb(element.color);
    for (const path of strokePaths) {
      for (let i = 0; i < path.length - 2; i += 2) {
        const sx = path[i] * pageWidth;
        const sy = pageHeight - (path[i + 1] * pageHeight);
        const ex = path[i + 2] * pageWidth;
        const ey = pageHeight - (path[i + 3] * pageHeight);
        page.drawLine({
          start: { x: sx, y: sy },
          end: { x: ex, y: ey },
          thickness: element.width,
          color: rgb(r, g, b),
          opacity: element.opacity,
        });
      }
    }
  }

  async function processImageElement(element: WorkerStudioImageEditElement): Promise<void> {
    const decoded = dataUrlToBytes(element.dataUrl);
    if (!decoded) {
      return;
    }
    const cacheKey = `${decoded.mimeType}:${element.dataUrl.length}:${element.dataUrl.slice(0, 64)}`;
    let embedded = imageCache.get(cacheKey);
    if (!embedded) {
      embedded = decoded.mimeType === 'image/png'
        ? await pdf.embedPng(decoded.bytes)
        : await pdf.embedJpg(decoded.bytes);
      imageCache.set(cacheKey, embedded);
    }

    const sx = element.x * pageWidth;
    const sy = pageHeight - ((element.y + element.h) * pageHeight);
    const sw = element.w * pageWidth;
    const sh = element.h * pageHeight;
    page.drawImage(embedded, {
      x: sx,
      y: sy,
      width: sw,
      height: sh,
      opacity: element.opacity,
    });
  }

  async function processRectElement(element: WorkerStudioRectEditElement): Promise<void> {
    // Intentional whiteout = true redaction: remove text operators under the rect, then paint.
    if (isAutoWhiteoutRect(element) && streamState) {
      const rect = { x: element.x, y: element.y, w: element.w, h: element.h };
      // Prefer loose bbox match for paint-redact; baseline-only collector is tuned for text replace.
      let operators = collectOperatorsInRect({
        decodedByStream: streamState.decodedByStream,
        pageWidth,
        pageHeight,
        rect,
      });
      if (operators.length === 0) {
        operators = collectOperatorsForRedaction({
          decodedByStream: streamState.decodedByStream,
          pageWidth,
          pageHeight,
          rect,
        });
      }
      if (operators.length > 0) {
        const modifiedStreamIndices = new Set(operators.map((item) => item.streamIndex));
        redactOperatorsInDecodedStreams(streamState.decodedByStream, operators);
        persistDecodedStreamChanges(streamState, modifiedStreamIndices);
      }
    }

    const sx = element.x * pageWidth;
    const sy = pageHeight - ((element.y + element.h) * pageHeight);
    const sw = element.w * pageWidth;
    const sh = element.h * pageHeight;
    const strokeRgb = hexToRgb(element.stroke);
    const fillRgb = hexToRgb(element.fill);
    const fillColor = element.fill === 'transparent'
      ? undefined
      : rgb(fillRgb.r, fillRgb.g, fillRgb.b);

    page.drawRectangle({
      x: sx,
      y: sy,
      width: sw,
      height: sh,
      borderWidth: element.strokeWidth,
      borderColor: rgb(strokeRgb.r, strokeRgb.g, strokeRgb.b),
      color: fillColor,
      opacity: element.opacity,
      borderOpacity: element.opacity,
    });
  }

  async function processEditElement(element: WorkerStudioEditElement): Promise<void> {
    switch (element.type) {
      case 'text':
        await processTextEditElement(element);
        return;
      case 'form-field':
        await processFormFieldElement(element);
        return;
      case 'watermark':
        await processWatermarkElement(element);
        return;
      case 'stroke':
        await processStrokeElement(element);
        return;
      case 'image':
        await processImageElement(element);
        return;
      case 'rect':
        if (trueReplaceApplied && isAutoWhiteoutRect(element)) {
          return;
        }
        await processRectElement(element);
        return;
    }
  }
}
