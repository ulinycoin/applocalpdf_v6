import { PDFDocument, StandardFonts, rgb, type PDFFont } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import type { WorkerStudioEditElement, WorkerStudioFontFamilyId } from '../../core/types/contracts';
import { parsePdfTextOperators } from './pdf-content-stream-parser';

let pdfCorePromise: Promise<{ decodePDFRawStream?: (stream: unknown) => { decode: () => Uint8Array } } | null> | null = null;

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

function fitTextToWidth(
  font: PDFFont,
  text: string,
  targetWidth: number,
  preferredFontSize: number,
  preferredTracking: number,
  minFontSize = 8,
): { fontSize: number; tracking: number; overflow: boolean } {
  const safeText = text || ' ';
  let fontSize = preferredFontSize;
  let tracking = preferredTracking;

  const fitAtSize = (size: number) => {
    const baseWidth = measureTextWidthWithTracking(font, safeText, size, preferredTracking);
    // Use 2% tolerance to match client-side calculation
    const effectiveTargetWidth = targetWidth * 1.02;
    if (baseWidth <= effectiveTargetWidth || safeText.length <= 1) {
      return { size, tracking: preferredTracking, width: baseWidth };
    }
    const minTracking = -0.05 * size;
    const neededTracking = (effectiveTargetWidth - baseWidth) / (safeText.length - 1);
    const nextTracking = preferredTracking + clamp(neededTracking, minTracking, 0);
    const width = measureTextWidthWithTracking(font, safeText, size, nextTracking);
    return { size, tracking: nextTracking, width };
  };

  let fitted = fitAtSize(fontSize);
  const effectiveTargetWidth = targetWidth * 1.02;
  while (fitted.width > effectiveTargetWidth && fontSize > minFontSize) {
    fontSize = Math.max(minFontSize, fontSize - 0.5);
    fitted = fitAtSize(fontSize);
  }

  tracking = fitted.tracking;

  return {
    fontSize,
    tracking,
    overflow: fitted.width > targetWidth,
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

function containsNonLatin1(input: string): boolean {
  return !canEncodeAsLatin1(input);
}

function encodeLatin1(input: string): Uint8Array {
  const bytes = new Uint8Array(input.length);
  for (let i = 0; i < input.length; i += 1) {
    bytes[i] = input.charCodeAt(i) & 0xff;
  }
  return bytes;
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

  if (!pdfCorePromise) {
    pdfCorePromise = Promise.race([
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
  const core = await pdfCorePromise;
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
}): Promise<{ applied: boolean; reason?: string }> {
  const { pdf, pageIndex, text } = params;
  if (!canEncodeAsLatin1(text)) {
    return { applied: false, reason: 'NON_LATIN1_TEXT' };
  }

  const page = pdf.getPage(pageIndex);
  const { PDFName } = await import('pdf-lib');
  const contentsRef = page.node.get(PDFName.of('Contents'));
  if (!contentsRef) {
    return { applied: false, reason: 'CONTENTS_MISSING' };
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
    return { applied: false, reason: 'CONTENTS_MISSING' };
  }

  const decodedByStream: Array<{ index: number; content: string; operators: ReturnType<typeof parsePdfTextOperators> }> = [];
  for (const entry of streamEntries) {
    const decodedContent = await decodePageStreamToLatin1(entry.stream);
    if (!decodedContent) {
      return { applied: false, reason: 'STREAM_DECODE_FAILED' };
    }
    decodedByStream.push({
      index: entry.index,
      content: decodedContent,
      operators: parsePdfTextOperators(decodedContent),
    });
  }

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
      targetText: params.text,
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

  const streamTarget = decodedByStream.find((entry) => entry.index === target.streamIndex);
  if (!streamTarget) {
    return { applied: false, reason: 'STREAM_NOT_FOUND' };
  }

  const replacement = target.operator.operator === 'Tj'
    ? `(${escapePdfLiteralString(text)}) Tj`
    : `[(${escapePdfLiteralString(text)})] TJ`;
  const updatedContent = `${streamTarget.content.slice(0, target.operator.start)}${replacement}${streamTarget.content.slice(target.operator.end)}`;
  const updatedBytes = encodeLatin1(updatedContent);
  const updatedStream = pdf.context.flateStream(updatedBytes);
  const updatedRef = pdf.context.register(updatedStream);

  if (resolved && typeof resolved.size === 'function' && typeof resolved.set === 'function') {
    resolved.set(target.streamIndex, updatedRef);
  } else {
    page.node.set(PDFName.of('Contents'), updatedRef);
  }
  return { applied: true };
}

export async function applyStudioTextEditsToPdfBytes(params: {
  sourceBytes: Uint8Array;
  pageIndex: number;
  elements: WorkerStudioEditElement[];
}): Promise<{
  outputBytes: Uint8Array;
  overflowDetected: boolean;
  trueReplaceApplied: boolean;
  trueReplaceFallbackReason?: string;
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
  const getFont = async (family: WorkerStudioFontFamilyId, weight: 'normal' | 'bold', style: 'normal' | 'italic') => {
    if (family === 'roboto') {
      const key = `roboto-${weight}-${style}`;
      const cached = fontCache.get(key);
      if (cached) return cached;

      try {
        const url = new URL('/fonts/Roboto-Regular.ttf', typeof location !== 'undefined' ? location.origin : 'http://localhost:4173').href;
        const fontBytes = await fetch(url).then(res => res.arrayBuffer());
        const embedded = await pdf.embedFont(fontBytes);
        fontCache.set(key, embedded);
        return embedded;
      } catch (err) {
        console.warn('Failed to load Roboto TTF, falling back to Helvetica', err);
        const fallback = await pdf.embedFont(StandardFonts.Helvetica);
        fontCache.set(key, fallback);
        return fallback;
      }
    }

    const fontName = getPdfFontName(family, weight, style);
    const key = String(fontName);
    const cached = fontCache.get(key);
    if (cached) {
      return cached;
    }
    const embedded = await pdf.embedFont(fontName);
    fontCache.set(key, embedded);
    return embedded;
  };

  let overflowDetected = false;
  const textElements = params.elements.filter((element) => element.type === 'text');
  const consumedTextIds = new Set<string>();
  let trueReplaceApplied = false;
  let trueReplaceFallbackReason: string | undefined = 'TRUE_REPLACE_DISABLED_FOR_STABILITY';

  // Skip True Replace optimization as it can lead to stream corruption in complex PDFs.
  // We prefer the fallback path which appends clean content streams.

  for (const element of params.elements) {
    if (element.type === 'text') {
      if (consumedTextIds.has(element.id)) {
        continue;
      }
      const line = sanitizeInlineText(element.text || ' ');
      const needsMultiLanguage = containsNonLatin1(line);

      let finalFamily = element.fontFamily;
      if (needsMultiLanguage && finalFamily !== 'roboto') {
        console.info(`Cyrillic detected in element ${element.id}, forcing Roboto fallback for encoding compatibility.`);
        finalFamily = 'roboto';
      }

      const font = await getFont(finalFamily, element.fontWeight, element.fontStyle);
      const { r, g, b } = hexToRgb(element.color);
      const blockWidth = element.w * pageWidth;
      const fit = fitTextToWidth(font, line, blockWidth, element.fontSize, element.letterSpacing ?? 0, 8);
      overflowDetected ||= fit.overflow;

      const lineWidth = font.widthOfTextAtSize(line, fit.fontSize) + fit.tracking * Math.max(0, line.length - 1);
      let x = element.x * pageWidth;
      if (element.textAlign === 'center') {
        x += Math.max(0, (blockWidth - lineWidth) / 2);
      }
      if (element.textAlign === 'right') {
        x += Math.max(0, blockWidth - lineWidth);
      }
      const yTop = element.y * pageHeight;
      // If we have the exact ascent from extraction, use it. Otherwise use 0.82 heuristic.
      const ascent = element.ascent ?? (fit.fontSize * 0.82);
      const y = pageHeight - yTop - ascent;

      // Use a small tolerance for tracking to avoid manual loop for floating point noise
      if (Math.abs(fit.tracking) < 0.001 || line.length <= 1) {
        page.drawText(line, {
          x,
          y,
          size: fit.fontSize,
          font,
          color: rgb(r, g, b),
          opacity: element.opacity,
        });
      } else {
        let cursor = x;
        for (let i = 0; i < line.length; i += 1) {
          const char = line[i]!;
          page.drawText(char, {
            x: cursor,
            y,
            size: fit.fontSize,
            font,
            color: rgb(r, g, b),
            opacity: element.opacity,
          });
          cursor += font.widthOfTextAtSize(char, fit.fontSize) + (i < line.length - 1 ? fit.tracking : 0);
        }
      }
      continue;
    }

    if (element.type === 'stroke') {
      if (element.points.length < 4) {
        continue;
      }
      const { r, g, b } = hexToRgb(element.color);
      for (let i = 0; i < element.points.length - 2; i += 2) {
        const sx = element.points[i] * pageWidth;
        const sy = pageHeight - (element.points[i + 1] * pageHeight);
        const ex = element.points[i + 2] * pageWidth;
        const ey = pageHeight - (element.points[i + 3] * pageHeight);
        page.drawLine({
          start: { x: sx, y: sy },
          end: { x: ex, y: ey },
          thickness: element.width,
          color: rgb(r, g, b),
          opacity: element.opacity,
        });
      }
      continue;
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

  const outputBytes = await pdf.save();
  const stableBytes = new Uint8Array(outputBytes.byteLength);
  stableBytes.set(outputBytes);
  return {
    outputBytes: stableBytes,
    overflowDetected,
    trueReplaceApplied,
    trueReplaceFallbackReason,
  };
}
