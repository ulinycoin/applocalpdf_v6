import type {
  ToolLogicFunction,
  WorkerStudioEditElement,
} from '../../../core/types/contracts';
import { getPdfPageCountFromBytes } from '../../../core/pdf/page-count';
import { applyStudioTextEditsToPdfBytes } from '../../../services/pdf/studio-text-edit-applier';
import {
  clamp,
  toFiniteNumber,
  sanitizeText,
  normalizeColor,
  normalizeTextAlign,
  normalizeOpacity,
  normalizeFontFamilyFromString as normalizeFontFamily,
} from '../../../services/pdf/studio-text-edit-utils';

// Bridges UI EditorElement (0-100 ratios, bold/italic booleans)
// to WorkerStudioEditElement (0-1 ratios, fontWeight/fontStyle strings).
// All fields are optional with loose types — they're validated at runtime
// by normalizer functions below.
interface PdfEditorTextEdit {
  type?: 'text';
  pageIndex?: number;
  text?: string;
  xRatio?: number;
  yRatio?: number;
  widthRatio?: number;
  heightRatio?: number;
  fontSize?: number;
  fontFamily?: string;
  color?: string;
  bold?: boolean;
  italic?: boolean;
  opacity?: number;
  textAlign?: string;
  horizontalScaling?: number;
  ascentRatio?: number;
  descentRatio?: number;
  sourceFontSizeRatio?: number;
  originalRect?: { x: number; y: number; w: number; h: number };
}

interface PdfEditorShapeEdit {
  type?: 'rect' | 'whiteout' | 'circle';
  pageIndex?: number;
  xRatio?: number;
  yRatio?: number;
  widthRatio?: number;
  heightRatio?: number;
  color?: string;
  strokeWidth?: number;
  opacity?: number;
}

interface PdfEditorLineEdit {
  type?: 'line';
  pageIndex?: number;
  x1Ratio?: number;
  y1Ratio?: number;
  x2Ratio?: number;
  y2Ratio?: number;
  color?: string;
  strokeWidth?: number;
  opacity?: number;
}

type PdfEditorRawEdit = PdfEditorTextEdit | PdfEditorShapeEdit | PdfEditorLineEdit;

interface PreparedPageEdits {
  pageIndex: number;
  elements: WorkerStudioEditElement[];
}

function normalizeHorizontalScaling(value: unknown): number {
  return clamp(toFiniteNumber(value, 1), 0.5, 3);
}

function normalizeOriginalRect(value: unknown): { x: number; y: number; w: number; h: number } | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }
  const raw = value as Record<string, unknown>;
  const x = clamp(toFiniteNumber(raw.x, Number.NaN) / 100, 0, 1);
  const y = clamp(toFiniteNumber(raw.y, Number.NaN) / 100, 0, 1);
  const w = clamp(toFiniteNumber(raw.w, Number.NaN) / 100, 0.001, 1);
  const h = clamp(toFiniteNumber(raw.h, Number.NaN) / 100, 0.001, 1);
  if (![x, y, w, h].every(Number.isFinite)) {
    return undefined;
  }
  return { x, y, w, h };
}

function buildCircleStrokePoints(x: number, y: number, w: number, h: number): number[] {
  const cx = x + (w / 2);
  const cy = y + (h / 2);
  const rx = w / 2;
  const ry = h / 2;
  const segments = 32;
  const points: number[] = [];
  for (let step = 0; step <= segments; step += 1) {
    const angle = (step / segments) * Math.PI * 2;
    points.push(
      clamp(cx + (Math.cos(angle) * rx), 0, 1),
      clamp(cy + (Math.sin(angle) * ry), 0, 1),
    );
  }
  return points;
}

function collectPreparedEdits(options?: Record<string, unknown>): PreparedPageEdits[] {
  const edits = Array.isArray(options?.elements)
    ? options.elements
    : Array.isArray(options?.edits)
      ? options.edits
      : [];
  const grouped = new Map<number, WorkerStudioEditElement[]>();

  for (let index = 0; index < edits.length; index += 1) {
    const candidate = edits[index];
    if (!candidate || typeof candidate !== 'object') {
      continue;
    }
    const raw = candidate as PdfEditorRawEdit;
    const pageIndex = Math.max(0, Math.floor(toFiniteNumber(raw.pageIndex, 0)));
    const type = raw.type === 'line' || raw.type === 'rect' || raw.type === 'whiteout' || raw.type === 'circle' || raw.type === 'text'
      ? raw.type
      : 'text';
    const current = grouped.get(pageIndex) ?? [];

    if (type === 'line') {
      const line = raw as PdfEditorLineEdit;
      current.push({
        id: `pdf-editor-${pageIndex}-${index}`,
        type: 'stroke',
        points: [
          clamp(toFiniteNumber(line.x1Ratio, 10) / 100, 0, 1),
          clamp(toFiniteNumber(line.y1Ratio, 10) / 100, 0, 1),
          clamp(toFiniteNumber(line.x2Ratio, 30) / 100, 0, 1),
          clamp(toFiniteNumber(line.y2Ratio, 30) / 100, 0, 1),
        ],
        color: normalizeColor(line.color),
        width: clamp(toFiniteNumber(line.strokeWidth, 2), 0.1, 32),
        opacity: normalizeOpacity(line.opacity),
      });
      grouped.set(pageIndex, current);
      continue;
    }

    if (type === 'rect' || type === 'whiteout' || type === 'circle') {
      const shape = raw as PdfEditorShapeEdit;
      const x = clamp(toFiniteNumber(shape.xRatio, 10) / 100, 0, 1);
      const y = clamp(toFiniteNumber(shape.yRatio, 10) / 100, 0, 1);
      const w = clamp(toFiniteNumber(shape.widthRatio, 20) / 100, 0.001, 1);
      const h = clamp(toFiniteNumber(shape.heightRatio, 10) / 100, 0.001, 1);
      const strokeColor = type === 'whiteout' ? '#ffffff' : normalizeColor(shape.color);
      const rawStrokeWidth = clamp(toFiniteNumber(shape.strokeWidth, 2), 0, 32);
      const strokeWidth = type === 'whiteout' ? 0 : rawStrokeWidth;

      if (type === 'circle') {
        current.push({
          id: `pdf-editor-${pageIndex}-${index}`,
          type: 'stroke',
          points: buildCircleStrokePoints(x, y, w, h),
          color: strokeColor,
          width: Math.max(0.1, strokeWidth),
          opacity: normalizeOpacity(shape.opacity),
        });
        grouped.set(pageIndex, current);
        continue;
      }

      current.push({
        id: `pdf-editor-${pageIndex}-${index}`,
        type: 'rect',
        x,
        y,
        w,
        h,
        fill: type === 'whiteout' ? '#ffffff' : 'transparent',
        stroke: strokeColor,
        strokeWidth: type === 'whiteout' ? 0 : strokeWidth,
        opacity: normalizeOpacity(shape.opacity),
      });
      grouped.set(pageIndex, current);
      continue;
    }

    const textElement = raw as PdfEditorTextEdit;
    const text = sanitizeText(textElement.text);
    if (!text) {
      continue;
    }
    const horizontalScaling = normalizeHorizontalScaling(textElement.horizontalScaling);
    const rawAscentRatio = typeof textElement.ascentRatio === 'number' && Number.isFinite(textElement.ascentRatio) ? textElement.ascentRatio : undefined;
    const rawDescentRatio = typeof textElement.descentRatio === 'number' && Number.isFinite(textElement.descentRatio) ? textElement.descentRatio : undefined;
    const rawSourceFontSizeRatio = typeof textElement.sourceFontSizeRatio === 'number' && Number.isFinite(textElement.sourceFontSizeRatio) ? textElement.sourceFontSizeRatio : undefined;
    const originalRect = normalizeOriginalRect(textElement.originalRect);
    current.push({
      id: `pdf-editor-${pageIndex}-${index}`,
      type: 'text',
      x: clamp(toFiniteNumber(textElement.xRatio, 10) / 100, 0, 1),
      y: clamp(toFiniteNumber(textElement.yRatio, 10) / 100, 0, 1),
      w: clamp(toFiniteNumber(textElement.widthRatio, 30) / 100, 0.001, 1),
      h: clamp(toFiniteNumber(textElement.heightRatio, 8) / 100, 0.001, 1),
      text: text,
      color: normalizeColor(textElement.color),
      fontSize: clamp(toFiniteNumber(textElement.fontSize, 16), 4, 144),
      fontFamily: normalizeFontFamily(textElement.fontFamily),
      fontWeight: textElement.bold === true ? 'bold' : 'normal',
      fontStyle: textElement.italic === true ? 'italic' : 'normal',
      textAlign: normalizeTextAlign(textElement.textAlign),
      lineHeight: 1.2,
      letterSpacing: clamp((horizontalScaling - 1) * 3, -2, 20),
      opacity: normalizeOpacity(textElement.opacity),
      ...(rawAscentRatio !== undefined ? { ascentRatio: rawAscentRatio } : {}),
      ...(rawDescentRatio !== undefined ? { descentRatio: rawDescentRatio } : {}),
      ...(rawSourceFontSizeRatio !== undefined ? { sourceFontSizeRatio: rawSourceFontSizeRatio } : {}),
      ...(originalRect ? { originalRect } : {}),
    });
    grouped.set(pageIndex, current);
  }

  return Array.from(grouped.entries())
    .sort((left, right) => left[0] - right[0])
    .map(([pageIndex, elements]) => ({ pageIndex, elements }));
}

type ExtendedRunParams = Parameters<ToolLogicFunction>[0] & { signal?: AbortSignal };

export const run: ToolLogicFunction = async (rawParams) => {
  const { inputIds, fs, options, emitProgress } = rawParams;
  const signal = (rawParams as ExtendedRunParams).signal;
  if (inputIds.length === 0) {
    throw new Error('PDF Editor requires at least one input file');
  }

  const pageEdits = collectPreparedEdits(options);
  const outputIds: string[] = [];

  for (let inputIndex = 0; inputIndex < inputIds.length; inputIndex += 1) {
    const entry = await fs.read(inputIds[inputIndex]);
    const sourceBlob = await entry.getBlob();
    let outputBytes: Uint8Array = new Uint8Array(await sourceBlob.arrayBuffer());

    if (pageEdits.length > 0) {
      const pageCount = await getPdfPageCountFromBytes(outputBytes, 'application/pdf');
      const applicableEdits = pageEdits.filter((pageEdit) => pageEdit.pageIndex < pageCount);

      if (applicableEdits.length > 0) {
        for (let pageEditIndex = 0; pageEditIndex < applicableEdits.length; pageEditIndex += 1) {
          signal?.throwIfAborted();
          const pageEdit = applicableEdits[pageEditIndex];
          const applied = await applyStudioTextEditsToPdfBytes({
            sourceBytes: outputBytes,
            pageIndex: pageEdit.pageIndex,
            elements: pageEdit.elements,
            signal,
          });
          outputBytes = applied.outputBytes;

          const localProgress = (pageEditIndex + 1) / applicableEdits.length;
          const overallProgress = ((inputIndex + localProgress) / inputIds.length) * 100;
          emitProgress?.(Math.round(clamp(overallProgress, 0, 100)));
        }
      }
    }

    const stableBytes = new Uint8Array(outputBytes.byteLength);
    stableBytes.set(outputBytes);
    const outputEntry = await fs.write(new Blob([stableBytes], { type: 'application/pdf' }));
    outputIds.push(outputEntry.id);

    const progress = Math.round(((inputIndex + 1) / inputIds.length) * 100);
    emitProgress?.(progress);
  }

  return { outputIds };
};
