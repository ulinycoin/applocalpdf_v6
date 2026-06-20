interface PdfJsLike {
  getDocument(params: { data: Uint8Array; disableWorker: boolean; verbosity?: number }): { promise: Promise<any> };
  GlobalWorkerOptions?: { workerSrc?: string };
  VerbosityLevel?: { ERRORS?: number };
}

export interface PdfTextLayerSpan {
  id: string;
  text: string;
  xRatio: number;
  yRatio: number;
  widthRatio: number;
  heightRatio: number;
  fontSizeRatio: number;
  fontName?: string;
  fontFamilyHint?: string;
  pageHeightPt?: number;
  ascentRatio?: number;
  descentRatio?: number;
  transform?: number[];
}

export interface PdfTextLayerResult {
  spans: PdfTextLayerSpan[];
  pageCount: number;
  width: number;
  height: number;
}

let pdfJsPromise: Promise<PdfJsLike | null> | null = null;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

function readFontSizePt(transform: number[]): number {
  if (!Array.isArray(transform) || transform.length < 4) {
    return 8;
  }
  return Math.hypot(transform[2] ?? 0, transform[3] ?? 0)
    || Math.hypot(transform[0] ?? 0, transform[1] ?? 0)
    || 8;
}

function multiplyTransform(m1: number[], m2: number[]): number[] {
  const [a1, b1, c1, d1, e1, f1] = m1;
  const [a2, b2, c2, d2, e2, f2] = m2;
  return [
    a1 * a2 + c1 * b2,
    b1 * a2 + d1 * b2,
    a1 * c2 + c1 * d2,
    b1 * c2 + d1 * d2,
    a1 * e2 + c1 * f2 + e1,
    b1 * e2 + d1 * f2 + f1,
  ];
}

async function loadPdfJs(): Promise<PdfJsLike | null> {
  if (!pdfJsPromise) {
    pdfJsPromise = (async () => {
      const loaders: Array<() => Promise<unknown>> = [
        () => import('pdfjs-dist/legacy/build/pdf.mjs'),
        () => import('pdfjs-dist/build/pdf.mjs'),
        () => import('pdfjs-dist'),
      ];
      for (const load of loaders) {
        try {
          const mod = (await load()) as PdfJsLike;
          if (mod && typeof mod.getDocument === 'function') {
            if (mod.GlobalWorkerOptions && !mod.GlobalWorkerOptions.workerSrc) {
              const workerLoaders: Array<() => Promise<{ default?: string }>> = [
                () => import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'),
                () => import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
              ];
              for (const loadWorkerSrc of workerLoaders) {
                try {
                  const workerSrcMod = await loadWorkerSrc();
                  if (workerSrcMod.default) {
                    mod.GlobalWorkerOptions.workerSrc = workerSrcMod.default;
                    break;
                  }
                } catch {
                  // Try next worker bundle candidate.
                }
              }
            }
            return mod;
          }
        } catch {
          // Try next candidate.
        }
      }
      return null;
    })();
  }
  return pdfJsPromise;
}

export async function extractPdfTextLayerSpans(
  pdfBytes: Uint8Array,
  pageNumber: number,
  scale = 2.0,
): Promise<PdfTextLayerSpan[]> {
  const pdfjs = await loadPdfJs();
  if (!pdfjs) {
    return [];
  }

  const safeBytes = new Uint8Array(pdfBytes);
  const loadingTask = pdfjs.getDocument({
    data: safeBytes,
    disableWorker: true,
    verbosity: pdfjs.VerbosityLevel?.ERRORS ?? 0,
  });
  const pdf = await loadingTask.promise;
  const page = await pdf.getPage(pageNumber);
  const pageViewport = page.getViewport({ scale: 1.0 });
  const viewport = page.getViewport({ scale });
  const textContent = await page.getTextContent();
  const textStyles = textContent.styles as Record<string, { ascent?: number; descent?: number; fontFamily?: string }>;

  const spans: PdfTextLayerSpan[] = [];
  for (let i = 0; i < textContent.items.length; i += 1) {
    const item = textContent.items[i] as any;
    if (!item || typeof item.str !== 'string' || item.str.trim().length === 0 || !Array.isArray(item.transform)) {
      continue;
    }

    const tx = multiplyTransform(viewport.transform as number[], item.transform as number[]);
    const x = tx[4];
    const y = tx[5];
    const fontSizePt = readFontSizePt(item.transform as number[]);
    const fontHeight = Math.hypot(tx[2], tx[3]) || (Number(item.height) * scale) || fontSizePt * scale;
    const style = textStyles[item.fontName];
    let fontAscent = fontHeight;
    if (style?.ascent) {
      fontAscent = style.ascent * fontHeight;
    } else if (style?.descent) {
      fontAscent = (1 + style.descent) * fontHeight;
    }

    let fontDescent = fontHeight * 0.18;
    if (style?.descent) {
      fontDescent = Math.abs(style.descent) * fontHeight;
    }

    const estimatedWidth = fontHeight * item.str.length * 0.46;
    const width = Math.max(1, (Number(item.width) * scale || estimatedWidth));
    const height = Math.max(1, (Number(item.height) * scale || fontHeight * 1.1));
    const top = y - fontAscent;

    spans.push({
      id: `span-${i}-${item.str.length}`,
      text: item.str,
      xRatio: clamp01(x / viewport.width),
      yRatio: clamp01(top / viewport.height),
      widthRatio: clamp(width / viewport.width, 0.001, 1),
      heightRatio: clamp(height / viewport.height, 0.001, 1),
      fontSizeRatio: clamp(fontSizePt / pageViewport.height, 0.004, 0.25),
      fontName: item.fontName,
      fontFamilyHint: style?.fontFamily,
      pageHeightPt: pageViewport.height,
      ascentRatio: clamp01(fontAscent / viewport.height),
      descentRatio: clamp01(fontDescent / viewport.height),
      transform: item.transform as number[],
    });
  }

  return spans;
}

export async function extractTextLayerForPreview(
  pdfBytes: Uint8Array,
  pageNumber: number,
  scale = 2.0,
): Promise<PdfTextLayerResult> {
  const pdfjs = await loadPdfJs();
  if (!pdfjs) {
    return { spans: [], pageCount: 1, width: 595, height: 842 };
  }

  const safeBytes = new Uint8Array(pdfBytes);
  const loadingTask = pdfjs.getDocument({
    data: safeBytes,
    disableWorker: true,
    verbosity: pdfjs.VerbosityLevel?.ERRORS ?? 0,
  });
  const pdf = await loadingTask.promise;
  const page = await pdf.getPage(pageNumber);
  const pageViewport = page.getViewport({ scale: 1.0 });
  const viewport = page.getViewport({ scale });
  const textContent = await page.getTextContent();
  const textStyles = textContent.styles as Record<string, { ascent?: number; descent?: number; fontFamily?: string }>;

  const spans: PdfTextLayerSpan[] = [];
  for (let i = 0; i < textContent.items.length; i += 1) {
    const item = textContent.items[i] as any;
    if (!item || typeof item.str !== 'string' || item.str.trim().length === 0 || !Array.isArray(item.transform)) {
      continue;
    }

    const tx = multiplyTransform(viewport.transform as number[], item.transform as number[]);
    const x = tx[4];
    const y = tx[5];
    const fontSizePt = readFontSizePt(item.transform as number[]);
    const fontHeight = Math.hypot(tx[2], tx[3]) || (Number(item.height) * scale) || fontSizePt * scale;
    const style = textStyles[item.fontName];
    let fontAscent = fontHeight;
    if (style?.ascent) {
      fontAscent = style.ascent * fontHeight;
    } else if (style?.descent) {
      fontAscent = (1 + style.descent) * fontHeight;
    }

    let fontDescent = fontHeight * 0.18;
    if (style?.descent) {
      fontDescent = Math.abs(style.descent) * fontHeight;
    }

    const estimatedWidth = fontHeight * item.str.length * 0.46;
    const width = Math.max(1, (Number(item.width) * scale || estimatedWidth));
    const height = Math.max(1, (Number(item.height) * scale || fontHeight * 1.1));
    const top = y - fontAscent;

    spans.push({
      id: `span-${pageNumber}-${i}`,
      text: item.str,
      xRatio: clamp01(x / viewport.width),
      yRatio: clamp01(top / viewport.height),
      widthRatio: clamp(width / viewport.width, 0.001, 1),
      heightRatio: clamp(height / viewport.height, 0.001, 1),
      fontSizeRatio: clamp(fontSizePt / pageViewport.height, 0.004, 0.25),
      ascentRatio: clamp01(fontAscent / viewport.height),
      descentRatio: clamp01(fontDescent / viewport.height),
      fontName: item.fontName,
      fontFamilyHint: style?.fontFamily,
      pageHeightPt: pageViewport.height,
      transform: item.transform as number[],
    });
  }

  return { spans, pageCount: pdf.numPages, width: viewport.width, height: viewport.height };
}
