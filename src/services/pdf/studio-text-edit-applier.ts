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
import { decodePageStreamToLatin1 } from './pdf-content-stream-decode';
import { resolvePublicAssetUrl } from './public-asset-url';
import { isRasterTextAvailable, rasterizeTextRun } from './text-raster';
import {
  collectLinkedBackgroundOwners,
  collectOperatorsForRedaction,
  planTextSegments,
  resolvePageGeometry,
  countMissingGlyphs,
  isCoverRect,
  pickCoveringFont,
  collectOperatorsInRect,
  isStudioTextEditV2Enabled,
  matchesPatchedOperator,
  redactOperatorsInDecodedStreams,
  resolveRequestedFontSizeFromElement,
  resolveSourceFontInfo,
  resolveTargetRect,
  resolveTypographyFromElement,
  resolveWidgetPlacement,
  resolveFontSizeFromElement,
  inferTypographyFromBaseFont,
  textElementMovedFromOriginal as hasTextElementMovedFromOriginal,
  type SourceFontInfo,
  type StreamOperatorRef,
} from './text-edit';

/** Matches pdf-lib's own default for every `addToPage`, and the width used to place widgets. */
const STUDIO_FORM_FIELD_BORDER_WIDTH = 1;

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
  /** Width of an arbitrary substring, possibly spanning several fonts. */
  measure: (text: string) => number;
  text: string;
  blockWidth: number;
  fontSize: number;
}): { lines: Array<{ text: string; width: number }>; overflow: boolean } {
  const { measure, text, blockWidth } = params;
  const safeText = text.trim() || ' ';
  const maxWidth = Math.max(1, blockWidth);
  const words = safeText.split(/\s+/u).filter(Boolean);
  const lines: Array<{ text: string; width: number }> = [];
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

function containsHebrew(input: string): boolean {
  return /[\u0590-\u05FF\uFB1D-\uFB4F]/u.test(input);
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

function containsGreek(input: string): boolean {
  return /[\u0370-\u03FF\u1F00-\u1FFF]/u.test(input);
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
      // Width is only a tie-breaker: user edit boxes are routinely wider than the source glyph run,
      // and a weight large enough to overcome small position differences picked the wrong line.
      const score = posScore + Math.min(0.002, widthScore * 0.002);
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

interface PlannedTextRun {
  /** Text handed to `drawText`; a transliteration for runs that have to be rasterised. */
  text: string;
  font: PDFFont;
  /** Original characters when no embedded face can render them. */
  rasterText?: string;
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

function formatPdfNumber(value: number): string {
  return Number(value.toFixed(3)).toString();
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
  /** Text runs are only patched in place when the source font encodes Latin-1 literals. */
  requireSimpleFont?: boolean;
  /** Explicit size in points when the user changed it; the run inherits the stream size otherwise. */
  fontSizeOverride?: number;
  /** Explicit fill colour (hex) when the user picked one; the run keeps the stream colour otherwise. */
  colorOverride?: string;
  /**
   * Typography the user asked for, resolved against the source font once it is known. A mismatch
   * cannot be patched in place: the run keeps the font that is already selected.
   */
  requestedTypographyFor?: (sourceBaseFont?: string) => {
    fontFamily: WorkerStudioFontFamilyId;
    fontWeight: 'normal' | 'bold';
    fontStyle: 'normal' | 'italic';
  };
}): {
  applied: boolean;
  reason?: string;
  patchedOperator?: StreamOperatorRef;
  candidate?: StreamOperatorRef;
  sourceFont?: SourceFontInfo;
} {
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

  const candidate: StreamOperatorRef = { streamIndex: target.streamIndex, operator: target.operator };
  const sourceFont = resolveSourceFontInfo({ pdf: state.pdf, page, operator: target.operator });
  if (params.requireSimpleFont && !sourceFont.simpleLatin) {
    // Composite (Type0/Identity-H) and Type3 fonts address glyphs by their own codes, so a
    // Latin-1 literal written into them renders as wrong glyphs or blanks. Report the run so the
    // caller can erase it and draw the replacement instead.
    return {
      applied: false,
      reason: sourceFont.composite ? 'SOURCE_FONT_COMPOSITE' : 'SOURCE_FONT_UNSUPPORTED',
      candidate,
      sourceFont,
    };
  }

  const appearanceOps: string[] = [];
  const restoreOps: string[] = [];
  if (params.fontSizeOverride !== undefined && Number.isFinite(params.fontSizeOverride)) {
    const resourceName = target.operator.fontResourceName;
    if (!resourceName) {
      return { applied: false, reason: 'SOURCE_FONT_UNRESOLVED', candidate, sourceFont };
    }
    appearanceOps.push(`${resourceName} ${formatPdfNumber(params.fontSizeOverride)} Tf`);
    // `Tf` is stream state, not run state: without restoring it the following runs in the same
    // text object would silently inherit the new size too.
    const sourceSize = target.operator.fontSize;
    if (sourceSize !== undefined && Number.isFinite(sourceSize)) {
      restoreOps.push(`${resourceName} ${formatPdfNumber(sourceSize)} Tf`);
    }
  }
  if (params.colorOverride) {
    const requested = hexToRgb(params.colorOverride);
    const sourceColor = target.operator.fillColor ? hexToRgb(target.operator.fillColor) : undefined;
    const changed = !sourceColor
      || Math.abs(sourceColor.r - requested.r) > 0.001
      || Math.abs(sourceColor.g - requested.g) > 0.001
      || Math.abs(sourceColor.b - requested.b) > 0.001;
    if (changed) {
      appearanceOps.push(`${formatPdfNumber(requested.r)} ${formatPdfNumber(requested.g)} ${formatPdfNumber(requested.b)} rg`);
      // Same reasoning as `Tf`: `rg` is stream state and has to be put back for the next runs.
      if (sourceColor) {
        restoreOps.push(`${formatPdfNumber(sourceColor.r)} ${formatPdfNumber(sourceColor.g)} ${formatPdfNumber(sourceColor.b)} rg`);
      }
    }
  }

  if (params.requireSimpleFont && params.requestedTypographyFor) {
    // Patching only swaps the string operand, so it keeps the font that is already selected. A
    // different family/weight/style has to be drawn with its own embedded font instead.
    const sourceTypography = inferTypographyFromBaseFont(sourceFont.baseFont);
    const requestedTypography = params.requestedTypographyFor(sourceFont.baseFont);
    if (
      sourceTypography
      && (
        sourceTypography.fontFamily !== requestedTypography.fontFamily
        || sourceTypography.fontWeight !== requestedTypography.fontWeight
        || sourceTypography.fontStyle !== requestedTypography.fontStyle
      )
    ) {
      return { applied: false, reason: 'SOURCE_FONT_STYLE_MISMATCH', candidate, sourceFont };
    }
  }

  const replacement = [...appearanceOps, `(${escapePdfLiteralString(text)}) Tj`, ...restoreOps].join(' ');
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
    patchedOperator: candidate,
    candidate,
    sourceFont,
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
  // Editor ratios are relative to the *displayed* page (pdf.js viewport, `/Rotate` applied), while
  // content-stream matching works in the unrotated MediaBox. `pageWidth`/`pageHeight` are the
  // display size so every ratio → point conversion below matches what the user drew; the patch path
  // switches to the MediaBox explicitly.
  const geometry = resolvePageGeometry(page);
  const pageWidth = geometry.displayWidth;
  const pageHeight = geometry.displayHeight;

  pdf.registerFontkit(fontkit);

  const fontCache = new Map<string, PDFFont>();
  const imageCache = new Map<string, Awaited<ReturnType<typeof pdf.embedPng>>>();
  const rasterCache = new Map<string, Awaited<ReturnType<typeof pdf.embedPng>>>();
  // A run nothing can render is painted on a canvas and embedded once per distinct run.
  const embedRasterRun = async (
    text: string,
    raster: { bytes: Uint8Array; widthPt: number },
  ): Promise<Awaited<ReturnType<typeof pdf.embedPng>>> => {
    const key = `${text}\u0000${Math.round(raster.widthPt)}\u0000${raster.bytes.byteLength}`;
    const cached = rasterCache.get(key);
    if (cached) {
      return cached;
    }
    const embedded = await pdf.embedPng(raster.bytes);
    rasterCache.set(key, embedded);
    return embedded;
  };

  const getStandardFont = async (family: WorkerStudioFontFamilyId, weight: 'normal' | 'bold', style: 'normal' | 'italic') => {
    const fontName = getPdfFontName(family, weight, style);
    const key = String(fontName);
    const cached = fontCache.get(key);
    if (cached) return cached;
    const embedded = await pdf.embedFont(fontName);
    fontCache.set(key, embedded);
    return embedded;
  };

  // Script subsets, copied into public/fonts by scripts/copy-studio-fonts.mjs. They live next to
  // Roboto so every face is loaded the same way — the URLs respect the deployed base path, and the
  // pipeline can be exercised outside a Vite build. Arabic and Hebrew are separate Noto families
  // (their subsets are committed under scripts/assets/studio-fonts) because `noto-sans` has no face
  // for either script; CJK deliberately has none — its smallest complete face is ~9.6 MB, so those
  // runs stay raster text.
  const scriptSubsets: Array<{ key: string; file: string; features?: Record<string, boolean> }> = [
    { key: 'noto-sans-latin-400', file: 'fonts/noto-sans-latin-400.woff' },
    { key: 'noto-sans-latin-ext-400', file: 'fonts/noto-sans-latin-ext-400.woff' },
    { key: 'noto-sans-cyrillic-400', file: 'fonts/noto-sans-cyrillic-400.woff' },
    { key: 'noto-sans-greek-400', file: 'fonts/noto-sans-greek-400.woff' },
    { key: 'noto-sans-devanagari-400', file: 'fonts/noto-sans-devanagari-400.woff' },
    // `ccmp` off is what makes Arabic usable at all: Noto Sans Arabic decomposes every dotted letter
    // into a dotless base plus a detached mark, and the bundled shaper then mis-places those marks
    // and writes them without a Unicode mapping — the word renders broken *and* stops being
    // searchable. The precomposed contextual forms used without `ccmp` render correctly and are
    // extracted byte for byte.
    { key: 'noto-sans-arabic-400', file: 'fonts/noto-sans-arabic-400.woff', features: { ccmp: false } },
    { key: 'noto-sans-hebrew-400', file: 'fonts/noto-sans-hebrew-400.woff' },
  ];
  // Each face is independent: one failed fetch must not cost the other scripts their font.
  await Promise.all(scriptSubsets.map(async ({ key, file, features }) => {
    try {
      const resp = await fetch(resolvePublicAssetUrl(file));
      if (resp.ok) {
        const bytes = new Uint8Array(await resp.arrayBuffer());
        fontCache.set(key, await pdf.embedFont(bytes, { subset: true, ...(features ? { features } : {}) }));
      }
    } catch { /* skip this subset */ }
  }));

  // Roboto from /public/fonts — the only face here with full Latin + Latin-Ext + Cyrillic
  // coverage, so it is the first candidate for any non-Latin1 text.
  try {
    const robotoResp = await fetch(resolvePublicAssetUrl('fonts/Roboto-Regular.ttf'));
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
      // Standard fonts cover WinAnsi only; the embedded faces pick up anything past it.
      addUnique(fontCache.get('roboto-regular') ?? null);
      addUnique(fontCache.get('noto-sans-latin-ext-400') ?? null);
      return candidates;
    }

    // The Google subsets cover disjoint ranges — `cyrillic` has no digits, punctuation or ASCII and
    // `latin-ext` has no ASCII at all — so a single subset silently drops part of a real sentence
    // ("Итого 100 USD"). The catalogue below is tried in coverage order, and whatever no face covers
    // is drawn segment by segment instead of degrading the whole string.
    addUnique(fontCache.get('roboto-regular') ?? null);
    const scriptSubsetKeys = [
      ...(containsCyrillic(text) ? ['noto-sans-cyrillic-400'] : []),
      ...(containsGreek(text) ? ['noto-sans-greek-400'] : []),
      ...(containsDevanagari(text) ? ['noto-sans-devanagari-400'] : []),
      ...(containsArabic(text) ? ['noto-sans-arabic-400'] : []),
      ...(containsHebrew(text) ? ['noto-sans-hebrew-400'] : []),
      'noto-sans-latin-400',
      'noto-sans-latin-ext-400',
      'noto-sans-cyrillic-400',
      'noto-sans-greek-400',
      'noto-sans-devanagari-400',
      'noto-sans-arabic-400',
      'noto-sans-hebrew-400',
    ];
    for (const key of scriptSubsetKeys) {
      addUnique(fontCache.get(key) ?? null);
    }
    addUnique(await getStandardFont(family, weight, style));

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
    const covering = pickCoveringFont(candidates, params.text);
    if (covering) {
      return { font: covering, text: params.text };
    }

    if (needsExtended) {
      // Transliterate to ASCII — better than blank glyphs. The replacement text has to pass the same
      // coverage check, otherwise the fallback would itself draw a row of `.notdef` boxes.
      const transliterated = replaceUnsupportedChars(params.text) || ' ';
      const fallbacks: PDFFont[] = [];
      const addFallback = (font: PDFFont | null) => {
        if (font && !fallbacks.includes(font)) {
          fallbacks.push(font);
        }
      };
      addFallback(fontCache.get('roboto-regular') ?? null);
      addFallback(fontCache.get('noto-sans-latin-ext-400') ?? null);
      addFallback(await getStandardFont(params.family, params.weight, params.style));
      return {
        font: pickCoveringFont(fallbacks, transliterated)
          ?? await getStandardFont('sora', 'normal', 'normal'),
        text: transliterated,
      };
    }
    return { font: await getStandardFont(params.family, params.weight, params.style), text: params.text };
  };

  /**
   * Plans text as runs of fonts. A single covering face is the common case and stays a single run;
   * when no face covers the whole string the runs are split per grapheme so only the characters that
   * are genuinely unsupported get transliterated instead of the entire sentence.
   */
  const resolveTextPlan = async (params: {
    family: WorkerStudioFontFamilyId;
    weight: 'normal' | 'bold';
    style: 'normal' | 'italic';
    text: string;
  }): Promise<{
    runs: PlannedTextRun[];
    text: string;
    planSubstring: (value: string) => PlannedTextRun[];
  }> => {
    const candidates = await getPreferredFontCandidates(params.family, params.weight, params.style, params.text);
    const covering = pickCoveringFont(candidates, params.text);
    if (covering) {
      return {
        runs: [{ text: params.text, font: covering }],
        text: params.text,
        planSubstring: (value) => [{ text: value, font: covering }],
      };
    }

    const fallbackFont = await getStandardFont('sora', 'normal', 'normal');
    const indexed = candidates.map((candidateFont, index) => ({ candidateFont, index }));
    // Coverage of a grapheme never changes during one edit, and layout measures the same words
    // repeatedly, so the per-character answers are cached.
    const coverageCache = new Map<string, boolean>();
    const canRender = (candidate: { candidateFont: PDFFont; index: number }, value: string) => {
      const key = `${candidate.index}\u0000${value}`;
      const cached = coverageCache.get(key);
      if (cached !== undefined) {
        return cached;
      }
      const covered = countMissingGlyphs(candidate.candidateFont, value) === 0;
      coverageCache.set(key, covered);
      return covered;
    };

    const plan = (value: string): PlannedTextRun[] => planTextSegments({
      text: value,
      fonts: indexed,
      canRender,
    }).map((run) => (run.font
      ? { text: run.text, font: run.font.candidateFont }
      // Nothing can render these characters: keep the originals so layout, re-planning per line and
      // rasterisation all see the real text. Transliteration happens at draw time only, and only
      // when the runtime has no canvas at all.
      : { text: run.text, font: fallbackFont, rasterText: run.text }));

    const runs = plan(params.text);
    return { runs, text: runs.map((run) => run.text).join(''), planSubstring: plan };
  };

  let overflowDetected = false;
  const usedFormFieldNames = new Set<string>();
  let formAppearanceFont: PDFFont | null = null;
  let trueReplaceApplied = false;
  let trueReplaceFallbackReason: string | undefined = 'INELIGIBLE_EDIT_PAYLOAD';
  const formFieldErrors: string[] = [];
  const consumedTextIds = new Set<string>();
  const sourceFontByElementId = new Map<string, SourceFontInfo>();

  const streamState = await loadPageStreamState(pdf, params.pageIndex);

  // A brand-new box the user never typed into carries no content: keeping it would send an empty
  // replacement to the worker and, before the guard below, silently erase the nearest text run.
  const elements = params.elements.filter((element) => !(
    element.type === 'text' && !element.originalRect && element.text.trim().length === 0
  ));

  // The editor pairs every text box with a `${id}_bg` cover rectangle. The link is explicit, so the
  // applier can tell a companion cover from a whiteout the user drew — the old geometry heuristic
  // treated both the same way and silently dropped user whiteouts.
  const linkedBackgroundByRectId = collectLinkedBackgroundOwners(elements);

  applyTrueReplaceToTextElements(elements, streamState);
  params.signal?.throwIfAborted();

  for (const element of elements) {
    params.signal?.throwIfAborted();
    await processEditElement(element);
  }

  const outputBytes = await saveWithoutLosingTheDocument(pdf);
  const stableBytes = new Uint8Array(outputBytes.byteLength);
  stableBytes.set(outputBytes);
  return {
    outputBytes: stableBytes,
    overflowDetected,
    trueReplaceApplied,
    trueReplaceFallbackReason,
    formFieldErrors: formFieldErrors.length > 0 ? formFieldErrors : undefined,
  };

  /**
   * `save()` regenerates every field appearance, and pdf-lib throws when a value cannot be encoded by
   * its field font (WinAnsi for the standard fonts). That throw was outside every try/catch, so one
   * form value in a script no shipped face covers (CJK) failed the whole export — the user lost every
   * other edit on the page. The value itself is already stored in the field dictionary, so the
   * degraded save keeps the document and lets the viewer generate the appearance.
   */
  async function saveWithoutLosingTheDocument(document: PDFDocument): Promise<Uint8Array> {
    try {
      return await document.save();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      formFieldErrors.push(`Field appearances were not regenerated: ${message}`);
      return await document.save({ updateFieldAppearances: false });
    }
  }

  async function applyTrueReplaceToTextElements(
    elements: WorkerStudioEditElement[],
    streamState: PageStreamState | null,
  ): Promise<void> {
    const textEditV2 = isStudioTextEditV2Enabled();
    const modifiedStreamIndices = new Set<number>();
    const textElements = elements.filter((e): e is WorkerStudioTextEditElement => e.type === 'text');
    for (const target of textElements) {
      if (!target.originalRect) {
        // A box the user just placed is new content, not a replacement. Patching it would hijack
        // (and destroy) the nearest existing run instead of drawing the box where it was put, so
        // new boxes always go through the overlay path below.
        continue;
      }
      const sanitizedText = sanitizeInlineText(target.text || ' ');
      const movedFromOriginal = hasTextElementMovedFromOriginal(target);
      const targetRect = geometry.toUserRatiosTopDown(resolveTargetRect(target));
      if (!streamState) {
        trueReplaceFallbackReason = 'STREAM_DECODE_FAILED';
        continue;
      }

      const isNonLatin1 = !canEncodeAsLatin1(sanitizedText);
      const patchText = movedFromOriginal || isNonLatin1 ? '' : sanitizedText;
      const requestedSize = resolveRequestedFontSizeFromElement(target, pageHeight);

      const result = tryPatchStreamOperator({
        state: streamState,
        text: patchText,
        targetXRatio: targetRect.x,
        targetYRatio: targetRect.y,
        targetWidthRatio: targetRect.w,
        targetHeightRatio: targetRect.h,
        targetTextAlign: target.textAlign,
        pageWidth: geometry.mediaWidth,
        pageHeight: geometry.mediaHeight,
        persist: !textEditV2,
        requireSimpleFont: true,
        fontSizeOverride: requestedSize.changedFromSource ? requestedSize.fontSize : undefined,
        colorOverride: target.colorUserSet ? target.color : undefined,
        requestedTypographyFor: (sourceBaseFont) => resolveTypographyFromElement(target, sourceBaseFont),
      });
      if (result.sourceFont) {
        sourceFontByElementId.set(target.id, result.sourceFont);
      }
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
          pageWidth: geometry.mediaWidth,
          pageHeight: geometry.mediaHeight,
          rect: targetRect,
          // A rejected patch still knows which run it matched, so the original can be erased
          // rather than left behind as ghost text under the overlay.
          anchorOperator: result.patchedOperator?.operator ?? result.candidate?.operator,
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
    // Prefer the real PostScript name of the run being replaced over the generic family pdf.js
    // reports, so an overlay keeps the document's own typeface.
    const typography = resolveTypographyFromElement(element, sourceFontByElementId.get(element.id)?.baseFont);
    const textPlan = await resolveTextPlan({
      family: typography.fontFamily,
      weight: typography.fontWeight,
      style: typography.fontStyle,
      text: line,
    });
    const textToDraw = textPlan.text || ' ';
    const font = textPlan.runs[0]?.font ?? await getStandardFont(typography.fontFamily, typography.fontWeight, typography.fontStyle);
    const { r, g, b } = hexToRgb(element.color);
    const blockWidth = element.w * pageWidth;
    const blockHeight = element.h * pageHeight;
    const yTop = element.y * pageHeight;

    const requestedFontSize = resolveFontSizeFromElement(element, pageHeight);

    const tracking = element.letterSpacing ?? 0;
    const measurePlanText = (value: string, fontSize: number) => {
      let width = 0;
      let glyphs = 0;
      for (const run of textPlan.planSubstring(value)) {
        // Matches the advance used while drawing run by run. Rasterised runs are measured with an
        // em-per-character estimate because the canvas can only be consulted asynchronously.
        const advance = run.rasterText
          ? (run.rasterText.length * fontSize * 0.95) + (tracking * run.rasterText.length)
          : run.font.widthOfTextAtSize(run.text, fontSize) + (tracking * run.text.length);
        width += advance;
        glyphs += (run.rasterText ?? run.text).length;
      }
      return glyphs > 0 ? width : 0;
    };

    let renderFontSize = requestedFontSize;
    const textWidth = measurePlanText(textToDraw, renderFontSize);
    if (textWidth > blockWidth) {
      renderFontSize = clamp((renderFontSize * blockWidth) / textWidth, 4, renderFontSize);
    }

    const lineHeightFactor = typeof element.lineHeight === 'number' ? element.lineHeight : 1.2;
    const textLayout = layoutTextAtFixedFontSize({
      measure: (value) => measurePlanText(value, renderFontSize),
      text: textToDraw,
      blockWidth,
      fontSize: renderFontSize,
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
    // Baseline measured from the top of the displayed page, i.e. in the same space as the editor.
    let baselineTop: number;
    if (typeof element.baselineRatio === 'number' && Number.isFinite(element.baselineRatio)) {
      // Snapped to a PDF text-layer baseline — use it directly (WYSIWYG after Save).
      baselineTop = clamp(element.baselineRatio, 0, 1) * pageHeight;
    } else {
      // Editor positions the box by CSS top; glyphs sit inside the first line-box
      // (half-leading + em ascent). pdf-lib drawText uses the alphabetic baseline.
      const lineBox = renderFontSize * Math.max(1, lineHeightFactor);
      const halfLeading = isOverlayText ? Math.max(0, (lineBox - renderFontSize) / 2) : 0;
      baselineTop = yTop + halfLeading + ascent;
    }
    const toUserRatioPoint = (displayX: number, displayY: number) => (
      geometry.toUserPoint(displayX / pageWidth, displayY / pageHeight)
    );
    const uprightRotation = geometry.uprightRotationDegrees;

    // Prefer the linked `_bg` rect from the editor; avoid a second oversized whiteout here.
    // Brand-new overlay text (no originalRect) must NOT paint a white field — it covers the page.
    const hasLinkedBackground = elements.some(
      (candidate) => candidate.type === 'rect' && candidate.id === `${element.id}_bg`,
    );
    const isReplacingExistingPdfText = Boolean(element.originalRect || element.sourceFontName);
    if (!hasLinkedBackground && isReplacingExistingPdfText) {
      const whiteoutPadX = Math.min(1.5, blockWidth * 0.006);
      const whiteoutHeight = Math.min(ascent + descent, renderFontSize * 1.12);
      const whiteoutDescent = Math.min(descent, renderFontSize * 0.22);
      const cover = geometry.toUserRect({
        x: (element.x * pageWidth - whiteoutPadX) / pageWidth,
        y: (baselineTop + whiteoutDescent - whiteoutHeight) / pageHeight,
        w: (blockWidth + whiteoutPadX * 2) / pageWidth,
        h: whiteoutHeight / pageHeight,
      });
      page.drawRectangle({
        x: cover.x,
        y: cover.y,
        width: cover.w,
        height: cover.h,
        color: rgb(1, 1, 1),
        opacity: 1,
        borderWidth: 0,
      });
    }

    for (let lineIndex = 0; lineIndex < textLayout.lines.length; lineIndex += 1) {
      const layoutLine = textLayout.lines[lineIndex]!;
      let displayX = element.x * pageWidth;
      if (element.textAlign === 'center') {
        displayX += Math.max(0, (blockWidth - layoutLine.width) / 2);
      }
      if (element.textAlign === 'right') {
        displayX += Math.max(0, blockWidth - layoutLine.width);
      }
      const displayY = baselineTop + (lineIndex * lineHeightPt);
      // One draw call per run: a mixed-script sentence is emitted with the face that covers each part.
      for (const run of textPlan.planSubstring(layoutLine.text)) {
        if (run.rasterText && isRasterTextAvailable()) {
          const raster = await rasterizeTextRun({
            text: run.rasterText,
            fontSizePt: renderFontSize,
            bold: typography.fontWeight === 'bold',
            colorHex: element.color,
          });
          if (raster) {
            const embedded = await embedRasterRun(run.rasterText, raster);
            // Sit the glyph baseline on the text baseline, then advance by the painted width.
            const rasterTop = displayY - raster.baselineOffsetPt;
            const anchor = toUserRatioPoint(displayX, rasterTop + raster.heightPt);
            page.drawImage(embedded, {
              x: anchor.x,
              y: anchor.y,
              width: raster.widthPt,
              height: raster.heightPt,
              opacity: element.opacity,
              ...(uprightRotation ? { rotate: degrees(uprightRotation) } : {}),
            });
            displayX += raster.widthPt + (tracking * run.rasterText.length);
            continue;
          }
        }
        // No canvas in this runtime: degrade only these characters, not the whole sentence.
        const fallbackText = run.rasterText ? (replaceUnsupportedChars(run.rasterText) || '?') : run.text;
        const anchor = toUserRatioPoint(displayX, displayY);
        page.drawText(fallbackText, {
          x: anchor.x,
          y: anchor.y,
          size: renderFontSize,
          font: run.font,
          color: rgb(r, g, b),
          opacity: element.opacity,
          ...(uprightRotation ? { rotate: degrees(uprightRotation) } : {}),
        });
        displayX += run.font.widthOfTextAtSize(fallbackText, renderFontSize) + (tracking * fallbackText.length);
      }
    }
  }

  async function processFormFieldElement(element: WorkerStudioFormFieldEditElement): Promise<void> {
    const form = pdf.getForm();
    // A widget appearance is generated in unrotated user space and the viewer rotates it together
    // with the page, so on `/Rotate 90/180/270` pages the widget has to counter-rotate itself or the
    // value reads sideways. `resolveWidgetPlacement` gives pdf-lib the box that leaves `/Rect` on the
    // rectangle the user drew while `/MK /R` keeps the appearance upright on the displayed page.
    const placement = resolveWidgetPlacement({
      geometry,
      rect: { x: element.x, y: element.y, w: element.w, h: element.h },
      borderWidth: STUDIO_FORM_FIELD_BORDER_WIDTH,
    });
    const sx = placement.x;
    const sy = placement.y;
    const sw = placement.width;
    const sh = placement.height;
    const widgetOptions = {
      x: sx,
      y: sy,
      width: sw,
      height: sh,
      borderWidth: STUDIO_FORM_FIELD_BORDER_WIDTH,
      rotate: degrees(placement.rotate),
    };
    const preferredName = (element.name || element.id).trim().slice(0, 120) || element.id;
    let fieldName = preferredName;
    if (usedFormFieldNames.has(fieldName)) {
      fieldName = `${preferredName}_${element.id.slice(0, 8)}`;
    }
    usedFormFieldNames.add(fieldName);

    try {
      /**
       * The appearance font must encode the field's value. Helvetica (the standard font) is WinAnsi
       * only, so a Cyrillic or Arabic default value made pdf-lib throw while writing the appearance —
       * and that throw used to escape as a failed export. Pick a shipped face that covers the value;
       * the cached font is reused only when it still covers it.
       */
      const ensureFormAppearanceFont = async (value?: string): Promise<PDFFont> => {
        const text = value ?? '';
        if (formAppearanceFont && (text.length === 0 || countMissingGlyphs(formAppearanceFont, text) === 0)) {
          return formAppearanceFont;
        }

        const helvetica = await getStandardFont('sora', 'normal', 'normal');
        if (text.length === 0) {
          formAppearanceFont = helvetica;
          return helvetica;
        }

        const candidates = [
          helvetica,
          fontCache.get('roboto-regular') ?? null,
          fontCache.get('noto-sans-latin-ext-400') ?? null,
          fontCache.get('noto-sans-cyrillic-400') ?? null,
          fontCache.get('noto-sans-greek-400') ?? null,
          fontCache.get('noto-sans-devanagari-400') ?? null,
          fontCache.get('noto-sans-arabic-400') ?? null,
          fontCache.get('noto-sans-hebrew-400') ?? null,
        ].filter((font): font is PDFFont => font !== null);

        formAppearanceFont = pickCoveringFont(candidates, text) ?? helvetica;
        return formAppearanceFont;
      };

      if (element.formType === 'text') {
        const field = form.createTextField(fieldName);
        field.addToPage(page, widgetOptions);
        field.setFontSize(clamp(element.fontSize || 12, 6, 72));
        if (element.defaultValue) {
          field.setText(element.defaultValue);
        }
        // The appearance must be generated *after* the value: `setText` marks the field dirty, and
        // pdf-lib's save-time pass would then rebuild it with Helvetica (WinAnsi only) and throw for
        // anything outside it. Generating here with a covering font leaves the field clean.
        field.defaultUpdateAppearances(await ensureFormAppearanceFont(element.defaultValue));
        if (element.required) field.enableRequired();
      } else if (element.formType === 'multiline') {
        const field = form.createTextField(fieldName);
        field.addToPage(page, { x: sx, y: sy, width: sw, height: sh });
        field.enableMultiline();
        field.setFontSize(clamp(element.fontSize || 12, 6, 72));
        if (element.defaultValue) {
          field.setText(element.defaultValue);
        }
        field.defaultUpdateAppearances(await ensureFormAppearanceFont(element.defaultValue));
        if (element.required) field.enableRequired();
      } else if (element.formType === 'checkbox') {
        const cb = form.createCheckBox(fieldName);
        cb.addToPage(page, widgetOptions);
        if (element.defaultValue && element.defaultValue.toLowerCase() !== 'off') cb.check();
        if (element.required) cb.enableRequired();
      } else if (element.formType === 'radio') {
        try {
          const existing = form.getRadioGroup(fieldName);
          if (existing) {
            existing.addOptionToPage(`Opt_${crypto.randomUUID().slice(0, 4)}`, page, widgetOptions);
          } else {
            const rg = form.createRadioGroup(fieldName);
            rg.addOptionToPage('Choice1', page, widgetOptions);
            if (element.defaultValue && element.defaultValue.toLowerCase() !== 'off') rg.select('Choice1');
            if (element.required) rg.enableRequired();
          }
        } catch {
          const rg = form.createRadioGroup(fieldName);
          rg.addOptionToPage('Choice1', page, widgetOptions);
          if (element.defaultValue && element.defaultValue.toLowerCase() !== 'off') rg.select('Choice1');
          if (element.required) rg.enableRequired();
        }
      } else if (element.formType === 'dropdown') {
        const dropdown = form.createDropdown(fieldName);
        dropdown.addToPage(page, widgetOptions);
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
    // The angle is measured in the editor, i.e. on the displayed page. A page rotation has to be
    // added back so the watermark keeps the angle the user set.
    const pdfAngle = geometry.uprightRotationDegrees - uiAngle;
    const angleRad = (uiAngle * Math.PI) / 180;
    const cos = Math.cos(angleRad);
    const sin = Math.sin(angleRad);
    const textWidthPt = Math.max(1, font.widthOfTextAtSize(textToDraw, element.fontSize));
    const textHeightPt = Math.max(1, element.fontSize * 1.1);
    const centerOffsetX = textWidthPt * 0.5;
    const centerOffsetY = element.fontSize * 0.3;

    // Offsets are computed in display space (y down) and only then mapped into the page.
    const drawCenteredRotatedText = (centerDisplayX: number, centerDisplayY: number) => {
      const offsetX = centerOffsetX * cos + centerOffsetY * sin;
      const offsetY = centerOffsetX * sin - centerOffsetY * cos;
      const anchor = geometry.toUserPoint(
        (centerDisplayX - offsetX) / pageWidth,
        (centerDisplayY - offsetY) / pageHeight,
      );
      page.drawText(textToDraw, {
        x: anchor.x,
        y: anchor.y,
        size: element.fontSize,
        font,
        color: rgb(r, g, b),
        opacity: element.opacity,
        rotate: degrees(pdfAngle),
      });
    };

    if (!element.repeatEnabled) {
      const centerDisplayX = element.x * pageWidth + textWidthPt * 0.5;
      const centerDisplayY = element.y * pageHeight + textHeightPt * 0.5;
      drawCenteredRotatedText(centerDisplayX, centerDisplayY);
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
        const centerDisplayX = (xRatio + textWidthRatio * 0.5) * pageWidth;
        const centerDisplayY = (yRatio + textHeightRatio * 0.5) * pageHeight;
        drawCenteredRotatedText(centerDisplayX, centerDisplayY);
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
        const start = geometry.toUserPoint(path[i]!, path[i + 1]!);
        const end = geometry.toUserPoint(path[i + 2]!, path[i + 3]!);
        const sx = start.x;
        const sy = start.y;
        const ex = end.x;
        const ey = end.y;
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

    // Anchor on the display-space bottom-left corner and rotate with the page so the picture stays
    // upright and inside the box the user drew.
    const anchor = geometry.toUserPoint(element.x, element.y + element.h);
    page.drawImage(embedded, {
      x: anchor.x,
      y: anchor.y,
      width: element.w * pageWidth,
      height: element.h * pageHeight,
      opacity: element.opacity,
      ...(geometry.uprightRotationDegrees ? { rotate: degrees(geometry.uprightRotationDegrees) } : {}),
    });
  }

  async function processRectElement(element: WorkerStudioRectEditElement): Promise<void> {
    // Intentional whiteout = true redaction: remove text operators under the rect, then paint.
    // Companion backgrounds of an edited text box are excluded — the text element itself owns that
    // run and already redacts it.
    if (isCoverRect(element) && !linkedBackgroundByRectId.has(element.id) && streamState) {
      // Content-stream operators live in the unrotated MediaBox, so the drawn box has to be mapped
      // back before anything can be found under it.
      const rect = geometry.toUserRatiosTopDown({ x: element.x, y: element.y, w: element.w, h: element.h });
      // Prefer loose bbox match for paint-redact; baseline-only collector is tuned for text replace.
      let operators = collectOperatorsInRect({
        decodedByStream: streamState.decodedByStream,
        pageWidth: geometry.mediaWidth,
        pageHeight: geometry.mediaHeight,
        rect,
      });
      if (operators.length === 0) {
        operators = collectOperatorsForRedaction({
          decodedByStream: streamState.decodedByStream,
          pageWidth: geometry.mediaWidth,
          pageHeight: geometry.mediaHeight,
          rect,
        });
      }
      if (operators.length > 0) {
        const modifiedStreamIndices = new Set(operators.map((item) => item.streamIndex));
        redactOperatorsInDecodedStreams(streamState.decodedByStream, operators);
        persistDecodedStreamChanges(streamState, modifiedStreamIndices);
      }
    }

    const box = geometry.toUserRect({ x: element.x, y: element.y, w: element.w, h: element.h });
    const sx = box.x;
    const sy = box.y;
    const sw = box.w;
    const sh = box.h;
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
      case 'rect': {
        // Only the companion background of an edited text box may be skipped, and only when that
        // run was patched in place: the replacement text is already in the stream, so painting the
        // background on top of it would hide it. A whiteout the user drew is never dropped.
        const backgroundOwnerId = linkedBackgroundByRectId.get(element.id);
        if (backgroundOwnerId && consumedTextIds.has(backgroundOwnerId)) {
          return;
        }
        await processRectElement(element);
        return;
      }
    }
  }
}
