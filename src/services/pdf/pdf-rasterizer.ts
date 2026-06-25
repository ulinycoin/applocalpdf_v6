export interface PdfRasterizeOptions {
  scale?: number;
  imageFormat?: 'image/png' | 'image/jpeg';
  jpegQuality?: number;
}

export interface PdfRasterizedPageInfo {
  pageIndex: number;
  pageCount: number;
  blob: Blob;
}

export interface PdfRasterizer {
  rasterize(pdfBlob: Blob, options?: PdfRasterizeOptions): Promise<Blob[]>;
  forEachPage(
    pdfBlob: Blob,
    options: PdfRasterizeOptions | undefined,
    handler: (info: PdfRasterizedPageInfo) => void | Promise<void>,
  ): Promise<number>;
}

const DEFAULT_RASTER_SCALE = 2.0;
const DEFAULT_IMAGE_FORMAT: NonNullable<PdfRasterizeOptions['imageFormat']> = 'image/png';
const DEFAULT_JPEG_QUALITY = 0.85;

interface PdfPageLike {
  getViewport(params: { scale: number }): { width: number; height: number };
  render(params: {
    canvasContext: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
    viewport: { width: number; height: number };
    annotationMode?: number;
    canvasFactory?: {
      create: (width: number, height: number) => { canvas: OffscreenCanvas | HTMLCanvasElement; context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D };
      reset: (target: { canvas: OffscreenCanvas | HTMLCanvasElement; context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D }, width: number, height: number) => void;
      destroy: (target: { canvas: OffscreenCanvas | HTMLCanvasElement; context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D }) => void;
    };
    isOffscreenCanvasSupported?: boolean;
    enableHWA?: boolean;
  }): { promise: Promise<void> };
}

interface PdfDocumentLike {
  numPages: number;
  getPage(page: number): Promise<PdfPageLike>;
}

interface PdfJsLike {
  getDocument(params: {
    data: ArrayBuffer;
    disableWorker: boolean;
    verbosity?: number;
    enableXfa?: boolean;
    useSystemFonts?: boolean;
    isOffscreenCanvasSupported?: boolean;
    disableFontFace?: boolean;
    ownerDocument?: any;
  }): { promise: Promise<PdfDocumentLike> };
  GlobalWorkerOptions?: { workerSrc?: string };
  VerbosityLevel?: { ERRORS?: number };
}

const DOM_ERROR_PATTERNS = [
  "createElement",
  "_document",
  "HTMLCanvasElement",
  "Node is not defined",
  "document is not defined",
];

function isDomRelatedError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const msg = error.message.toLowerCase();
  return DOM_ERROR_PATTERNS.some((p) => msg.includes(p.toLowerCase()));
}

class PdfJsRasterizer implements PdfRasterizer {
  constructor(private pdfjs: PdfJsLike) { }

  private createCanvasFactory() {
    return {
      create: (width: number, height: number) => {
        const canvas =
          typeof OffscreenCanvas !== 'undefined'
            ? new OffscreenCanvas(width, height)
            : typeof document?.createElement === 'function'
              ? document.createElement('canvas')
              : null;
        if (!canvas) {
          throw new Error('PDF canvas factory not available in this runtime. OffscreenCanvas is required.');
        }
        if (typeof HTMLCanvasElement !== 'undefined' && canvas instanceof HTMLCanvasElement) {
          canvas.width = width;
          canvas.height = height;
        }
        const context = canvas.getContext('2d');
        if (!context) {
          throw new Error('PDF canvas factory failed to get 2d context');
        }
        return { canvas, context };
      },
      reset: (target: { canvas: OffscreenCanvas | HTMLCanvasElement }, width: number, height: number) => {
        target.canvas.width = width;
        target.canvas.height = height;
      },
      destroy: (target: { canvas: OffscreenCanvas | HTMLCanvasElement }) => {
        target.canvas.width = 0;
        target.canvas.height = 0;
      },
    };
  }

  /**
   * Render a PDF page to an OffscreenCanvas (worker-safe).
   * Falls back via multiple strategies if pdfjs internally throws DOM errors.
   */
  private async renderPageToCanvas(
    page: PdfPageLike,
    viewport: { width: number; height: number },
  ): Promise<OffscreenCanvas> {
    // Always use OffscreenCanvas in workers — never fall back to document.createElement
    if (typeof OffscreenCanvas === 'undefined') {
      throw new Error(
        'PDF rendering requires OffscreenCanvas, which is not available in this browser. ' +
        'Please use a modern browser (Chrome 69+, Edge 79+, Firefox 105+, Safari 16.4+).',
      );
    }

    const canvas = new OffscreenCanvas(viewport.width, viewport.height);
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('PDF rendering failed to get 2d context from OffscreenCanvas');
    }

    // Strategy 1: render with canvasFactory + annotationMode=0 + OffscreenCanvas hint
    try {
      await page.render({
        canvasContext: context,
        viewport,
        annotationMode: 0,
        canvasFactory: this.createCanvasFactory(),
        isOffscreenCanvasSupported: true,
        enableHWA: false,
      }).promise;
      return canvas;
    } catch (err) {
      if (!isDomRelatedError(err)) {
        // Non-DOM error — rethrow immediately
        throw err;
      }
      // DOM error — try Strategy 2: render without canvasFactory (pdfjs internal)
    }

    // Strategy 2: render without custom canvasFactory (let pdfjs use its own)
    try {
      await page.render({
        canvasContext: context,
        viewport,
        annotationMode: 0,
        isOffscreenCanvasSupported: true,
        enableHWA: false,
      }).promise;
      return canvas;
    } catch (err) {
      if (!isDomRelatedError(err)) {
        throw err;
      }
      // Still a DOM error — try Strategy 3: with internal renderer if available
    }

    // Strategy 3: final attempt — minimal render options
    try {
      await page.render({
        canvasContext: context,
        viewport,
        annotationMode: 0,
        isOffscreenCanvasSupported: true,
      }).promise;
      return canvas;
    } catch (err) {
      if (!isDomRelatedError(err)) {
        throw err;
      }
      throw new Error(
        'This browser does not support PDF page rendering inside the editor worker. ' +
        'The PDF library (pdfjs-dist) requires DOM APIs that are not available in Worker context. ' +
        'Please try uploading smaller files or use a browser with full OffscreenCanvas support (Chrome 105+, Firefox 105+, Safari 16.4+).',
      );
    }
  }

  private async openPdf(pdfBlob: Blob): Promise<PdfDocumentLike> {
    const arrayBuffer = await pdfBlob.arrayBuffer();
    const errorOnlyVerbosity = this.pdfjs.VerbosityLevel?.ERRORS ?? 0;

    const mockDocument = typeof document === 'undefined' ? {
      fonts: (self as any).fonts,
      createElement: (name: string) => {
        if (name === 'canvas') {
          return typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(1, 1) : null;
        }
        return null;
      },
    } : undefined;

    const loadingTask = this.pdfjs.getDocument({
      data: arrayBuffer,
      disableWorker: true,
      verbosity: errorOnlyVerbosity,
      enableXfa: false,
      useSystemFonts: false,
      isOffscreenCanvasSupported: true,
      disableFontFace: true,
      ownerDocument: mockDocument,
    });
    return loadingTask.promise;
  }

  private async renderPageBlob(
    page: PdfPageLike,
    options: PdfRasterizeOptions,
    pageNumber: number,
  ): Promise<Blob> {
    const scale = options.scale ?? DEFAULT_RASTER_SCALE;
    const imageFormat = options.imageFormat ?? DEFAULT_IMAGE_FORMAT;
    const jpegQuality = options.jpegQuality ?? DEFAULT_JPEG_QUALITY;
    const viewport = page.getViewport({ scale });
    const canvas = await this.renderPageToCanvas(page, viewport);

    const blob = await new Promise<Blob | null>((resolve) => {
      if (typeof OffscreenCanvas !== 'undefined') {
        canvas.convertToBlob({
          type: imageFormat,
          ...(imageFormat === 'image/jpeg' ? { quality: jpegQuality } : {}),
        }).then(resolve);
      } else {
        resolve(null);
      }
    });

    if (!blob) {
      throw new Error(`Failed to create image blob for page ${pageNumber}`);
    }
    return blob;
  }

  async forEachPage(
    pdfBlob: Blob,
    options: PdfRasterizeOptions | undefined,
    handler: (info: PdfRasterizedPageInfo) => void | Promise<void>,
  ): Promise<number> {
    const pdf = await this.openPdf(pdfBlob);
    const resolvedOptions = options ?? {};
    for (let i = 1; i <= pdf.numPages; i += 1) {
      const page = await pdf.getPage(i);
      const blob = await this.renderPageBlob(page, resolvedOptions, i);
      await handler({ pageIndex: i - 1, pageCount: pdf.numPages, blob });
    }
    return pdf.numPages;
  }

  async rasterize(pdfBlob: Blob, options: PdfRasterizeOptions = {}): Promise<Blob[]> {
    const blobs: Blob[] = [];
    await this.forEachPage(pdfBlob, options, (info) => {
      blobs.push(info.blob);
    });
    return blobs;
  }
}

export async function createPdfRasterizer(): Promise<PdfRasterizer | null> {
  // In worker context: OffscreenCanvas is required
  // On main thread: either OffscreenCanvas or document.createElement works
  const canRasterize =
    typeof OffscreenCanvas !== 'undefined' ||
    typeof document !== 'undefined';

  if (!canRasterize) {
    return null;
  }

  try {
    const pdfjs = (await import('pdfjs-dist/legacy/build/pdf.mjs')) as unknown as PdfJsLike;
    if (pdfjs.GlobalWorkerOptions && !pdfjs.GlobalWorkerOptions.workerSrc) {
      const workerLoaders: Array<() => Promise<{ default?: string }>> = [
        () => import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'),
        () => import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
      ];
      for (const loadWorkerSrc of workerLoaders) {
        try {
          const workerSrcMod = await loadWorkerSrc();
          if (workerSrcMod.default) {
            pdfjs.GlobalWorkerOptions.workerSrc = workerSrcMod.default;
            break;
          }
        } catch {
          // Try next worker bundle candidate.
        }
      }
    }
    return new PdfJsRasterizer(pdfjs);
  } catch {
    return null;
  }
}
