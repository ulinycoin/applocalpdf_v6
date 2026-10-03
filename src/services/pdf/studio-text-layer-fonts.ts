import type { PDFDocument } from 'pdf-lib';
import { PDFName } from 'pdf-lib';
import type { WorkerStudioFontFamilyId } from '../../core/types/contracts';
import { parsePdfTextOperators, type PdfParsedTextOperator } from './pdf-content-stream-parser';
import { decodePageStreamToLatin1 } from './pdf-content-stream-decode';
import { inferTypographyFromBaseFont, resolveSourceFontInfo } from './text-edit/source-font';
import { resolvePageGeometry } from './text-edit/page-rotation';

export interface SpanFontInfo {
  /** Real PostScript name from the content stream, e.g. `Helvetica-Bold`. Absent when the font is anonymous. */
  sourceFontName?: string;
  sourceFontFamily?: WorkerStudioFontFamilyId;
  sourceFontWeight?: 'normal' | 'bold';
  sourceFontStyle?: 'normal' | 'italic';
  /** Non-stroking fill colour of the run, as `#rrggbb`. */
  color?: string;
}

interface SpanBox {
  id: string;
  xRatio: number;
  yRatio: number;
  widthRatio: number;
  heightRatio: number;
}

/**
 * Resolves the font and colour a text layer span was drawn with.
 *
 * pdf.js reports a generic family for most embedded faces (`sans-serif` for a serif Type3 font, an
 * internal `g_d0_f3` as the font name), so the editor used to seed every clicked line as Helvetica
 * regular and silently dropped the document's own face and weight. The content stream itself knows
 * the PostScript name and the fill colour, so those are read from the operators and matched to the
 * span by position.
 *
 * Type3 fonts carry no name and no font program at all — for those nothing can be reported, which is
 * why the caller must treat a missing name as "unknown" rather than as "regular".
 */
export async function resolveSpanFontInfo(params: {
  pdf: PDFDocument;
  pageIndex: number;
  spans: readonly SpanBox[];
}): Promise<Map<string, SpanFontInfo>> {
  const result = new Map<string, SpanFontInfo>();
  if (params.spans.length === 0) {
    return result;
  }

  try {
    const page = params.pdf.getPage(params.pageIndex);
    const contents = params.pdf.context.lookup(page.node.get(PDFName.of('Contents')) as never) as
      | { size?: () => number; get?: (index: number) => unknown }
      | undefined;
    if (!contents) {
      return result;
    }

    const streamRefs: unknown[] = typeof contents.size === 'function' && typeof contents.get === 'function'
      ? Array.from(
        { length: Number(contents.size()) },
        (_, index) => params.pdf.context.lookup(contents.get!(index) as never),
      )
      : [contents];

    const operators: PdfParsedTextOperator[] = [];
    for (const stream of streamRefs) {
      const decoded = await decodePageStreamToLatin1(stream);
      if (!decoded) {
        continue;
      }
      operators.push(...parsePdfTextOperators(decoded));
    }
    if (operators.length === 0) {
      return result;
    }

    const geometry = resolvePageGeometry(page);
    for (const span of params.spans) {
      const box = geometry.toUserRatiosTopDown({
        x: span.xRatio,
        y: span.yRatio,
        w: span.widthRatio,
        h: span.heightRatio,
      });
      const match = findOperatorInBox(operators, box, geometry.mediaWidth, geometry.mediaHeight);
      if (!match) {
        continue;
      }

      const info: SpanFontInfo = {};
      const font = resolveSourceFontInfo({ pdf: params.pdf, page, operator: match });
      const typography = inferTypographyFromBaseFont(font.baseFont);
      if (font.baseFont) {
        info.sourceFontName = font.baseFont;
      }
      if (typography) {
        info.sourceFontFamily = typography.fontFamily;
        info.sourceFontWeight = typography.fontWeight;
        info.sourceFontStyle = typography.fontStyle;
      }
      if (match.fillColor) {
        info.color = match.fillColor;
      }
      if (Object.keys(info).length > 0) {
        result.set(span.id, info);
      }
    }
  } catch {
    // Enrichment is best-effort: a page that cannot be parsed simply keeps the pdf.js hints.
  }

  return result;
}

function findOperatorInBox(
  operators: readonly PdfParsedTextOperator[],
  box: { x: number; y: number; w: number; h: number },
  pageWidth: number,
  pageHeight: number,
): PdfParsedTextOperator | undefined {
  // The run starts on its baseline, which sits just inside the top edge of the glyph box.
  const padding = 0.015;
  const left = (box.x - padding) * pageWidth;
  const right = (box.x + box.w + padding) * pageWidth;
  const top = (box.y - padding) * pageHeight;
  const bottom = (box.y + box.h + padding) * pageHeight;

  let best: PdfParsedTextOperator | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const operator of operators) {
    const x = operator.textMatrixX;
    const y = operator.textMatrixY;
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      continue;
    }
    const topDownY = pageHeight - (y as number);
    if ((x as number) < left || (x as number) > right || topDownY < top || topDownY > bottom) {
      continue;
    }
    const distance = Math.abs(topDownY - (box.y + box.h * 0.5) * pageHeight);
    if (distance < bestDistance) {
      best = operator;
      bestDistance = distance;
    }
  }
  return best;
}
