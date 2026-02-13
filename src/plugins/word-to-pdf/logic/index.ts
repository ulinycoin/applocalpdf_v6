import type { ToolLogicFunction } from '../../../core/types/contracts';
import { createQpdfEngine, type QpdfEngine } from '../../../services/pdf/qpdf-engine';
import { QpdfPipelineError } from '../../../services/pdf/qpdf-errors';
import fontkit from '@pdf-lib/fontkit';

type QualityPreset = 'standard' | 'high' | 'min';
type BlockKind = 'heading1' | 'heading2' | 'heading3' | 'paragraph' | 'list' | 'table' | 'image' | 'blank';

interface RenderBlock {
  kind: BlockKind;
  text: string;
  imageDataUrl?: string;
}

interface ConversionOptions {
  quality: QualityPreset;
  pdfA: boolean;
  protectWithPassword: boolean;
  password: string;
  searchablePdf: boolean;
}

interface QualityProfile {
  defaultFontSize: number;
  lineHeight: number;
  paragraphGap: number;
  leftRightMargin: number;
  topBottomMargin: number;
  compressStreams: boolean;
}

const ZIP_SIGNATURE = [0x50, 0x4b];
const CFB_SIGNATURE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

function isZipContainer(bytes: Uint8Array): boolean {
  return bytes.length >= 2 && bytes[0] === ZIP_SIGNATURE[0] && bytes[1] === ZIP_SIGNATURE[1];
}

function isLegacyDocContainer(bytes: Uint8Array): boolean {
  if (bytes.length < CFB_SIGNATURE.length) {
    return false;
  }
  for (let i = 0; i < CFB_SIGNATURE.length; i += 1) {
    if (bytes[i] !== CFB_SIGNATURE[i]) {
      return false;
    }
  }
  return true;
}

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function normalizeWhitespace(input: string): string {
  return input
    .replace(/\r/g, '')
    .replace(/\t/g, ' ')
    .replace(/[ ]+/g, ' ')
    .trim();
}

function stripHtmlTags(input: string): string {
  const stripped = decodeHtmlEntities(input.replace(/<[^>]+>/g, ' '));
  return normalizeWhitespace(
    stripped
      .replace(/\breturn\s+true\s*;\s*}/gi, ' ')
      .replace(/\bfunction\s+\w+\s*\([^)]*\)\s*{/gi, ' '),
  );
}

function extractAttributeValue(tag: string, attribute: string): string {
  const escaped = attribute.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`${escaped}\\s*=\\s*["']([^"']+)["']`, 'i');
  const match = regex.exec(tag);
  return match?.[1] ?? '';
}

function extractTableRows(html: string): string[] {
  const rows: string[] = [];
  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch = rowRegex.exec(html);
  while (rowMatch) {
    const rowHtml = rowMatch[1];
    const cellRegex = /<(?:td|th)[^>]*>([\s\S]*?)<\/(?:td|th)>/gi;
    const cells: string[] = [];
    let cellMatch = cellRegex.exec(rowHtml);
    while (cellMatch) {
      const cellText = stripHtmlTags(cellMatch[1]);
      if (cellText.length > 0) {
        cells.push(cellText);
      }
      cellMatch = cellRegex.exec(rowHtml);
    }
    if (cells.length > 0) {
      rows.push(cells.join(' | '));
    }
    rowMatch = rowRegex.exec(html);
  }
  return rows;
}

function extractBlocksFromHtml(htmlRaw: string): RenderBlock[] {
  const html = htmlRaw
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/\n/g, ' ');
  const blocks: RenderBlock[] = [];
  const tokenRegex = /<(h1|h2|h3|p|li|table)\b[^>]*>[\s\S]*?<\/\1>|<img\b[^>]*>/gi;
  let match = tokenRegex.exec(html);

  while (match) {
    const token = match[0];
    const imageTagMatch = /^<img\b/i.exec(token);
    if (imageTagMatch) {
      const src = extractAttributeValue(token, 'src');
      if (src.startsWith('data:image/')) {
        blocks.push({ kind: 'image', text: '[Image]', imageDataUrl: src });
      } else {
        blocks.push({ kind: 'image', text: '[Image omitted in local mode]' });
      }
      match = tokenRegex.exec(html);
      continue;
    }

    const tagMatch = /^<(h1|h2|h3|p|li|table)\b[^>]*>([\s\S]*?)<\/\1>$/i.exec(token);
    if (!tagMatch) {
      match = tokenRegex.exec(html);
      continue;
    }

    const tag = tagMatch[1].toLowerCase();
    const body = tagMatch[2];

    if (tag === 'table') {
      const rows = extractTableRows(body);
      if (rows.length > 0) {
        blocks.push({ kind: 'table', text: rows.join('\n') });
      }
      match = tokenRegex.exec(html);
      continue;
    }

    const text = stripHtmlTags(body);
    if (text.length === 0) {
      match = tokenRegex.exec(html);
      continue;
    }

    if (tag === 'h1') {
      blocks.push({ kind: 'heading1', text });
    } else if (tag === 'h2') {
      blocks.push({ kind: 'heading2', text });
    } else if (tag === 'h3') {
      blocks.push({ kind: 'heading3', text });
    } else if (tag === 'li') {
      blocks.push({ kind: 'list', text: `• ${text}` });
    } else {
      blocks.push({ kind: 'paragraph', text });
    }

    match = tokenRegex.exec(html);
  }

  if (blocks.length > 0) {
    return blocks;
  }

  const plain = stripHtmlTags(html);
  if (plain.length === 0) {
    return [{ kind: 'blank', text: '' }];
  }
  return plain
    .split('\n')
    .map((line) => normalizeWhitespace(line))
    .filter((line) => line.length > 0)
    .map((line) => ({ kind: 'paragraph', text: line }));
}

function getQualityProfile(quality: QualityPreset, pdfA: boolean): QualityProfile {
  if (quality === 'high') {
    return {
      defaultFontSize: 12,
      lineHeight: 1.45,
      paragraphGap: 6,
      leftRightMargin: 48,
      topBottomMargin: 52,
      compressStreams: !pdfA,
    };
  }
  if (quality === 'min') {
    return {
      defaultFontSize: 10,
      lineHeight: 1.25,
      paragraphGap: 4,
      leftRightMargin: 36,
      topBottomMargin: 42,
      compressStreams: !pdfA,
    };
  }
  return {
    defaultFontSize: 11,
    lineHeight: 1.35,
    paragraphGap: 5,
    leftRightMargin: 42,
    topBottomMargin: 48,
    compressStreams: !pdfA,
  };
}

function parseOptions(options: Record<string, unknown> | undefined): ConversionOptions {
  const qualityRaw = options?.quality;
  const quality: QualityPreset = qualityRaw === 'high' || qualityRaw === 'min' ? qualityRaw : 'standard';
  const pdfA = options?.pdfA === true;
  const protectWithPassword = options?.protectWithPassword === true;
  const password = typeof options?.password === 'string' ? options.password.trim() : '';
  const searchablePdf = options?.searchablePdf !== false;
  return { quality, pdfA, protectWithPassword, password, searchablePdf };
}

function scaleProfile(profile: QualityProfile, scale: number): QualityProfile {
  const safeScale = Math.max(0.65, Math.min(1, scale));
  return {
    defaultFontSize: Math.max(8.5, profile.defaultFontSize * safeScale),
    lineHeight: Math.max(1.08, profile.lineHeight * (0.95 + safeScale * 0.05)),
    paragraphGap: Math.max(2, Math.round(profile.paragraphGap * safeScale)),
    leftRightMargin: Math.max(18, Math.round(profile.leftRightMargin * safeScale)),
    topBottomMargin: Math.max(20, Math.round(profile.topBottomMargin * safeScale)),
    compressStreams: profile.compressStreams,
  };
}

function estimateDocumentHeight(
  blocks: RenderBlock[],
  profile: QualityProfile,
  pageWidth: number,
  selectFont: (text: string) => { widthOfTextAtSize: (text: string, size: number) => number },
): number {
  let total = 0;
  const maxLineLength = Math.max(120, pageWidth - profile.leftRightMargin * 2);

  for (const block of blocks) {
    const blockSize = getFontSizeByBlock(block.kind, profile.defaultFontSize);
    const lineHeight = Math.max(9, Math.round(blockSize * profile.lineHeight));

    if (block.kind === 'blank') {
      total += getParagraphGap(block.kind, profile);
      continue;
    }

    if (block.kind === 'image') {
      const imageHeightBase = profile.defaultFontSize >= 12 ? 180 : (profile.defaultFontSize <= 10 ? 100 : 140);
      const imageHeight = Math.max(68, Math.round(imageHeightBase * (profile.defaultFontSize / 11)));
      total += imageHeight + getParagraphGap(block.kind, profile);
      continue;
    }

    const lines = needsRasterFallback(block.text)
      ? wrapTextByCanvas(block.text, maxLineLength, blockSize)
      : wrapText(block.text, selectFont(block.text), blockSize, maxLineLength);
    total += lines.length * lineHeight + getParagraphGap(block.kind, profile);
  }

  return total;
}

function getFontSizeByBlock(kind: BlockKind, baseSize: number): number {
  if (kind === 'heading1') {
    return Math.round(baseSize * 1.7);
  }
  if (kind === 'heading2') {
    return Math.round(baseSize * 1.45);
  }
  if (kind === 'heading3') {
    return Math.round(baseSize * 1.25);
  }
  if (kind === 'table') {
    return Math.max(9, Math.round(baseSize * 0.95));
  }
  if (kind === 'image') {
    return baseSize;
  }
  if (kind === 'list') {
    return baseSize;
  }
  if (kind === 'blank') {
    return baseSize;
  }
  return baseSize;
}

function getParagraphGap(kind: BlockKind, profile: QualityProfile): number {
  if (kind === 'heading1') {
    return profile.paragraphGap + 4;
  }
  if (kind === 'heading2') {
    return profile.paragraphGap + 3;
  }
  if (kind === 'heading3') {
    return profile.paragraphGap + 2;
  }
  if (kind === 'table') {
    return profile.paragraphGap + 2;
  }
  if (kind === 'blank') {
    return profile.paragraphGap + 4;
  }
  return profile.paragraphGap;
}

function ensurePageCapacity(
  yTop: number,
  topMargin: number,
  bottomMargin: number,
  requiredHeight: number,
  addPage: () => void,
  resetYTop: () => number,
): number {
  const remainingHeight = yTop - bottomMargin;
  if (remainingHeight >= requiredHeight) {
    return yTop;
  }
  addPage();
  return resetYTop() - topMargin;
}

function base64ToUint8Array(base64: string): Uint8Array {
  if (typeof atob === 'function') {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
  throw new Error('Base64 decoding is unavailable in this runtime');
}

function parseDataUrl(dataUrl: string): { mimeType: string; bytes: Uint8Array } | null {
  const match = /^data:([^;]+);base64,(.+)$/i.exec(dataUrl.trim());
  if (!match) {
    return null;
  }
  const mimeType = match[1].toLowerCase();
  const base64 = match[2];
  return { mimeType, bytes: base64ToUint8Array(base64) };
}

async function loadFontBytes(url: string): Promise<Uint8Array> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load font: ${url}`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

async function resolveNotoFontUrls(): Promise<{ latinUrl: string; cyrillicUrl: string }> {
  const [latinMod, cyrillicMod] = await Promise.all([
    import('@fontsource/noto-sans/files/noto-sans-latin-400-normal.woff?url') as Promise<{ default: string }>,
    import('@fontsource/noto-sans/files/noto-sans-cyrillic-ext-400-normal.woff?url') as Promise<{ default: string }>,
  ]);
  return { latinUrl: latinMod.default, cyrillicUrl: cyrillicMod.default };
}

function hasCyrillic(text: string): boolean {
  return /\p{Script=Cyrillic}/u.test(text);
}

function hasCjk(text: string): boolean {
  return /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(text);
}

function hasDevanagari(text: string): boolean {
  return /\p{Script=Devanagari}/u.test(text);
}

function needsRasterFallback(text: string): boolean {
  return hasCyrillic(text) || hasCjk(text) || hasDevanagari(text);
}

function shouldUseRasterFallback(text: string, searchablePdf: boolean): boolean {
  return !searchablePdf && needsRasterFallback(text);
}

function create2dCanvas(
  width: number,
  height: number,
): { canvas: OffscreenCanvas | HTMLCanvasElement; context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D } | null {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));

  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(w, h);
    const context = canvas.getContext('2d');
    if (context) {
      return { canvas, context };
    }
    return null;
  }

  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const context = canvas.getContext('2d');
    if (context) {
      return { canvas, context };
    }
  }

  return null;
}

async function rasterizeTextLine(
  text: string,
  maxWidth: number,
  lineHeight: number,
  fontSize: number,
  bold: boolean,
): Promise<{ bytes: Uint8Array; width: number; height: number } | null> {
  const probe = create2dCanvas(Math.max(16, maxWidth), Math.max(16, lineHeight + 10));
  if (!probe) {
    return null;
  }
  const probeContext = probe.context;
  const fontWeight = bold ? '700' : '400';
  probeContext.font = `${fontWeight} ${fontSize}px "Noto Sans","Noto Sans CJK SC","Noto Sans CJK JP","Noto Sans Devanagari","PingFang SC","Hiragino Sans","Yu Gothic","Microsoft YaHei","Mangal","Kohinoor Devanagari","Arial Unicode MS",sans-serif`;
  const measured = probeContext.measureText(text);
  const naturalWidth = Math.max(8, Math.ceil(measured.width) + 6);
  const imageWidth = Math.min(Math.max(8, maxWidth), naturalWidth);
  const imageHeight = Math.max(lineHeight + 8, Math.ceil(fontSize * 1.5));

  const canvasNode = create2dCanvas(imageWidth, imageHeight);
  if (!canvasNode) {
    return null;
  }

  const { canvas, context } = canvasNode;
  context.clearRect(0, 0, imageWidth, imageHeight);
  context.fillStyle = '#111';
  context.textBaseline = 'top';
  context.font = `${fontWeight} ${fontSize}px "Noto Sans","Noto Sans CJK SC","Noto Sans CJK JP","Noto Sans Devanagari","PingFang SC","Hiragino Sans","Yu Gothic","Microsoft YaHei","Mangal","Kohinoor Devanagari","Arial Unicode MS",sans-serif`;
  context.fillText(text, 0, 1, imageWidth);

  let blob: Blob | null = null;
  if (typeof OffscreenCanvas !== 'undefined' && canvas instanceof OffscreenCanvas) {
    blob = await canvas.convertToBlob({ type: 'image/png' });
  } else if (typeof HTMLCanvasElement !== 'undefined' && canvas instanceof HTMLCanvasElement) {
    blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  }

  if (!blob) {
    return null;
  }

  const bytes = new Uint8Array(await blob.arrayBuffer());
  return {
    bytes,
    width: imageWidth,
    height: imageHeight,
  };
}

function wrapText(
  text: string,
  font: { widthOfTextAtSize: (text: string, size: number) => number },
  fontSize: number,
  maxWidth: number,
): string[] {
  const rawParagraphs = text.split('\n');
  const lines: string[] = [];

  for (const paragraph of rawParagraphs) {
    const clean = paragraph.trim();
    if (clean.length === 0) {
      continue;
    }

    const words = clean.split(/\s+/);
    let current = '';
    for (const word of words) {
      const candidate = current.length > 0 ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, fontSize) <= maxWidth) {
        current = candidate;
        continue;
      }

      if (current.length > 0) {
        lines.push(current);
      }

      if (font.widthOfTextAtSize(word, fontSize) <= maxWidth) {
        current = word;
        continue;
      }

      let chunk = '';
      for (const ch of Array.from(word)) {
        const nextChunk = `${chunk}${ch}`;
        if (font.widthOfTextAtSize(nextChunk, fontSize) <= maxWidth) {
          chunk = nextChunk;
        } else {
          if (chunk.length > 0) {
            lines.push(chunk);
          }
          chunk = ch;
        }
      }
      current = chunk;
    }

    if (current.length > 0) {
      lines.push(current);
    }
  }

  return lines.length > 0 ? lines : [''];
}

function wrapTextByCanvas(text: string, maxWidth: number, fontSize: number): string[] {
  const canvasNode = create2dCanvas(Math.max(16, maxWidth), Math.max(16, Math.ceil(fontSize * 1.6)));
  if (!canvasNode) {
    return text
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  }

  const context = canvasNode.context;
  context.font = `${fontSize}px "Noto Sans","Noto Sans CJK SC","Noto Sans CJK JP","Noto Sans Devanagari","PingFang SC","Hiragino Sans","Yu Gothic","Microsoft YaHei","Mangal","Kohinoor Devanagari","Arial Unicode MS",sans-serif`;

  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    const clean = paragraph.trim();
    if (clean.length === 0) {
      continue;
    }

    let current = '';
    for (const ch of Array.from(clean)) {
      const candidate = `${current}${ch}`;
      if (context.measureText(candidate).width <= maxWidth) {
        current = candidate;
      } else {
        if (current.length > 0) {
          lines.push(current);
        }
        current = ch;
      }
    }
    if (current.length > 0) {
      lines.push(current);
    }
  }

  return lines.length > 0 ? lines : [''];
}

function getCodePoints(text: string): number[] {
  return Array.from(text).map((ch) => ch.codePointAt(0) ?? 0).filter((code) => code > 0);
}

function countRenderableCodePoints(
  font: { getCharacterSet?: () => number[] },
  text: string,
): number {
  if (typeof font.getCharacterSet !== 'function') {
    return 0;
  }
  const charset = new Set<number>(font.getCharacterSet());
  let ok = 0;
  for (const code of getCodePoints(text)) {
    if (charset.has(code)) {
      ok += 1;
    }
  }
  return ok;
}

function canFontRenderText(
  font: { getCharacterSet?: () => number[] },
  text: string,
): boolean {
  const codes = getCodePoints(text);
  if (codes.length === 0) {
    return true;
  }
  if (typeof font.getCharacterSet !== 'function') {
    return true;
  }
  const charset = new Set<number>(font.getCharacterSet());
  for (const code of codes) {
    if (!charset.has(code)) {
      return false;
    }
  }
  return true;
}

async function protectPdfIfRequested(
  blob: Blob,
  options: ConversionOptions,
  engineFactory: () => Promise<QpdfEngine>,
): Promise<Blob> {
  if (!options.protectWithPassword) {
    return blob;
  }
  if (!options.password) {
    throw new QpdfPipelineError('PROTECT_INVALID_OPTIONS', 'Password is required when protection is enabled.');
  }

  const engine = await engineFactory();
  return engine.encrypt(blob, {
    userPassword: options.password,
    ownerPassword: options.password,
    keyLength: 256,
  });
}

export async function runWordToPdf(
  { inputIds, fs, options, emitProgress }: Parameters<ToolLogicFunction>[0],
  engineFactory: () => Promise<QpdfEngine>,
): Promise<{ outputIds: string[] }> {
  if (inputIds.length === 0) {
    throw new Error('Word to PDF requires at least one input file');
  }

  const parsedOptions = parseOptions(options);

  const mammoth = await import('mammoth');
  const { PDFDocument, StandardFonts } = await import('pdf-lib');

  const outputIds: string[] = [];

  for (let i = 0; i < inputIds.length; i += 1) {
    const entry = await fs.read(inputIds[i]);
    const blob = await entry.getBlob();
    const arrayBuffer = await blob.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);

    if (isLegacyDocContainer(bytes)) {
      throw new Error('Legacy .doc is not supported in secure local mode. Save as .docx and retry.');
    }
    if (!isZipContainer(bytes)) {
      throw new Error(`Unsupported Word file format for ${inputIds[i]}. Please upload a .docx file.`);
    }

    const [htmlResult, textResult] = await Promise.all([
      mammoth.convertToHtml({ arrayBuffer }),
      mammoth.extractRawText({ arrayBuffer }),
    ]);

    const blocks = extractBlocksFromHtml(htmlResult.value);
    if (blocks.length === 1 && blocks[0].kind === 'blank') {
      const fallbackText = normalizeWhitespace(textResult.value);
      if (fallbackText.length > 0) {
        blocks[0] = { kind: 'paragraph', text: fallbackText };
      }
    }

    const baseProfile = getQualityProfile(parsedOptions.quality, parsedOptions.pdfA);
    const pageSize: [number, number] = [595.28, 841.89];
    const fitScaleCandidates = [1];

    const renderAttempt = async (profile: QualityProfile): Promise<{ blob: Blob; pageCount: number }> => {
      const doc = await PDFDocument.create();
      doc.setTitle(`${entry.getName().replace(/\.[^.]+$/, '') || 'Document'} (Converted)`);
      doc.setCreator('LocalPDF V6');
      doc.setSubject(parsedOptions.pdfA ? 'Archive conversion profile (best-effort)' : 'Word to PDF conversion');
      doc.setKeywords(parsedOptions.pdfA ? ['word', 'pdf', 'pdfa', 'best-effort'] : ['word', 'pdf', 'conversion']);

      let latinFont = await doc.embedFont(StandardFonts.Helvetica);
      let cyrillicFont = latinFont;

      try {
        doc.registerFontkit(fontkit);
        const { latinUrl, cyrillicUrl } = await resolveNotoFontUrls();
        const [latinBytes, cyrillicBytes] = await Promise.all([
          loadFontBytes(latinUrl),
          loadFontBytes(cyrillicUrl),
        ]);
        latinFont = await doc.embedFont(latinBytes, { subset: true });
        cyrillicFont = await doc.embedFont(cyrillicBytes, { subset: true });
      } catch {
        // Keep Helvetica fallback for environments where custom font loading is unavailable.
      }

      const selectFont = (text: string): typeof latinFont => {
        if (canFontRenderText(latinFont, text)) {
          return latinFont;
        }
        if (canFontRenderText(cyrillicFont, text)) {
          return cyrillicFont;
        }
        const latinScore = countRenderableCodePoints(latinFont, text);
        const cyrScore = countRenderableCodePoints(cyrillicFont, text);
        return cyrScore > latinScore ? cyrillicFont : latinFont;
      };

      let page = doc.addPage(pageSize);
      let pageIndex = 0;
      const pagesWithContent = new Set<number>();
      const livePageWidth = page.getWidth();
      const livePageHeight = page.getHeight();
      let yTop = livePageHeight - profile.topBottomMargin;
      const addPage = (): void => {
        if (pageIndex >= 0 && !pagesWithContent.has(pageIndex)) {
          const remainingHeight = yTop - profile.topBottomMargin;
          if (remainingHeight > livePageHeight * 0.85) {
            return;
          }
        }
        page = doc.addPage(pageSize);
        pageIndex += 1;
        yTop = page.getHeight() - profile.topBottomMargin;
      };
      const resetYTop = (): number => page.getHeight();

      for (const block of blocks) {
        const blockSize = getFontSizeByBlock(block.kind, profile.defaultFontSize);
        const lineHeight = Math.max(10, Math.round(blockSize * profile.lineHeight));
        const maxLineLength = livePageWidth - profile.leftRightMargin * 2;

        if (block.kind === 'blank') {
          yTop -= getParagraphGap(block.kind, profile);
          continue;
        }

        if (block.kind === 'image') {
          const imageWidth = maxLineLength;
          const imageHeightBase = parsedOptions.quality === 'high' ? 180 : (parsedOptions.quality === 'min' ? 100 : 140);
          const imageHeight = Math.max(68, Math.round(imageHeightBase * (profile.defaultFontSize / baseProfile.defaultFontSize)));
          yTop = ensurePageCapacity(
            yTop,
            profile.topBottomMargin,
            profile.topBottomMargin,
            imageHeight + getParagraphGap(block.kind, profile),
            addPage,
            resetYTop,
          );
          if (block.imageDataUrl?.startsWith('data:image/')) {
            try {
              const parsedImage = parseDataUrl(block.imageDataUrl);
              if (!parsedImage) {
                throw new Error('Invalid image payload');
              }
              const image = parsedImage.mimeType === 'image/png'
                ? await doc.embedPng(parsedImage.bytes)
                : await doc.embedJpg(parsedImage.bytes);
              page.drawImage(image, {
                x: profile.leftRightMargin,
                y: yTop - imageHeight,
                width: imageWidth,
                height: imageHeight,
              });
              pagesWithContent.add(pageIndex);
            } catch {
              const font = selectFont(block.text);
              page.drawText('[Image]', {
                x: profile.leftRightMargin,
                y: yTop - lineHeight,
                size: blockSize,
                font,
              });
              pagesWithContent.add(pageIndex);
            }
          } else {
            const font = selectFont(block.text);
            page.drawText(block.text, {
              x: profile.leftRightMargin,
              y: yTop - lineHeight,
              size: blockSize,
              font,
            });
            pagesWithContent.add(pageIndex);
          }
          yTop -= imageHeight + getParagraphGap(block.kind, profile);
          continue;
        }

        const lines = shouldUseRasterFallback(block.text, parsedOptions.searchablePdf)
          ? wrapTextByCanvas(block.text, maxLineLength, blockSize)
          : wrapText(block.text, selectFont(block.text), blockSize, maxLineLength);
        for (const line of lines) {
          let lineAdvance = lineHeight;
          let rasterLine: { bytes: Uint8Array; width: number; height: number } | null = null;
          const cleanLine = line.length > 0 ? line : ' ';

          if (shouldUseRasterFallback(cleanLine, parsedOptions.searchablePdf)) {
            rasterLine = await rasterizeTextLine(
              cleanLine,
              Math.round(maxLineLength),
              Math.round(lineHeight),
              Math.round(blockSize),
              block.kind.startsWith('heading'),
            );
            if (rasterLine) {
              lineAdvance = Math.max(lineHeight, rasterLine.height);
            }
          }

          yTop = ensurePageCapacity(
            yTop,
            profile.topBottomMargin,
            profile.topBottomMargin,
            lineAdvance,
            addPage,
            resetYTop,
          );

          if (rasterLine) {
            const image = await doc.embedPng(rasterLine.bytes);
            page.drawImage(image, {
              x: profile.leftRightMargin,
              y: yTop - rasterLine.height,
              width: rasterLine.width,
              height: rasterLine.height,
            });
            pagesWithContent.add(pageIndex);
          } else {
            const lineFont = selectFont(cleanLine);
            try {
              if (!canFontRenderText(lineFont, cleanLine)) {
                throw new Error('Missing glyphs in selected font');
              }
              page.drawText(cleanLine, {
                x: profile.leftRightMargin,
                y: yTop - lineHeight,
                size: blockSize,
                font: lineFont,
              });
            } catch {
              const fallbackRaster = await rasterizeTextLine(
                cleanLine,
                Math.round(maxLineLength),
                Math.round(lineHeight),
                Math.round(blockSize),
                block.kind.startsWith('heading'),
              );
              if (fallbackRaster) {
                const fallbackImage = await doc.embedPng(fallbackRaster.bytes);
                page.drawImage(fallbackImage, {
                  x: profile.leftRightMargin,
                  y: yTop - fallbackRaster.height,
                  width: fallbackRaster.width,
                  height: fallbackRaster.height,
                });
                lineAdvance = Math.max(lineAdvance, fallbackRaster.height);
              }
            }
            pagesWithContent.add(pageIndex);
          }

          yTop -= lineAdvance;
        }
        yTop -= getParagraphGap(block.kind, profile);
      }

      if (!pagesWithContent.has(pageIndex) && doc.getPageCount() > 1) {
        doc.removePage(pageIndex);
      }

      const pdfBytes = await doc.save({ useObjectStreams: false });
      const normalized = new Uint8Array(pdfBytes.byteLength);
      normalized.set(pdfBytes);
      return {
        blob: new Blob([normalized], { type: 'application/pdf' }),
        pageCount: doc.getPageCount(),
      };
    };

    let rawPdfBlob: Blob | null = null;
    for (const scale of fitScaleCandidates) {
      const profile = scaleProfile(baseProfile, scale);
      const result = await renderAttempt(profile);
      rawPdfBlob = result.blob;
      if (result.pageCount >= 1) {
        break;
      }
    }

    if (!rawPdfBlob) {
      throw new Error('Failed to render output PDF');
    }

    const finalPdfBlob = await protectPdfIfRequested(rawPdfBlob, parsedOptions, engineFactory);
    const outEntry = await fs.write(finalPdfBlob);
    outputIds.push(outEntry.id);

    const progress = Math.round(((i + 1) / inputIds.length) * 100);
    emitProgress?.(progress);
  }

  return { outputIds };
};

export const run: ToolLogicFunction = async (params) => runWordToPdf(params, createQpdfEngine);
