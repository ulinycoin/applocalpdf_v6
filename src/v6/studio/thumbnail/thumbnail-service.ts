import type { PDFPageProxy } from 'pdfjs-dist/types/src/display/api';
import { getPdfJs } from '../../services/pdf/pdf-loader';

/**
 * The canvas grid draws a page into a 180x250 box, so the tile bitmap only has to cover that box at
 * the screen's pixel ratio (180 * 2 = 360). Rendering bigger than the box costs memory twice — once
 * for the bitmap and once for its decoded copy — while `page-tile-cache` renders the sharp tier at
 * the size the page is actually displayed at.
 */
export const GRID_THUMBNAIL_WIDTH_PX = 360;
export const THUMBNAIL_JPEG_QUALITY = 0.82;

export class ThumbnailService {
    private static readonly MIN_RENDER_SCALE = 0.2;
    private static readonly MAX_RENDER_SCALE = 4;

    private static createCanvasFactory() {
        return {
            create: (width: number, height: number) => {
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const context = canvas.getContext('2d');
                if (!context) {
                    throw new Error('Canvas factory failed to get 2d context');
                }
                return { canvas, context };
            },
            reset: (target: { canvas: HTMLCanvasElement }, width: number, height: number) => {
                target.canvas.width = width;
                target.canvas.height = height;
            },
            destroy: (target: { canvas: HTMLCanvasElement }) => {
                target.canvas.width = 0;
                target.canvas.height = 0;
            },
        };
    }

    static async generateThumbnail(pdfBuffer: ArrayBuffer, pageIndex: number): Promise<string> {
        // Use a copy to avoid detachment issues if called multiple times, 
        // though calling this in a loop is still inefficient.
        const pdfjs = await getPdfJs();
        const verbosity = (pdfjs as unknown as { VerbosityLevel?: { ERRORS?: number } }).VerbosityLevel?.ERRORS ?? 0;
        const loadingTask = pdfjs.getDocument({ data: new Uint8Array(pdfBuffer.slice(0)), verbosity });
        const pdf = await loadingTask.promise;
        const page = await pdf.getPage(pageIndex + 1);
        const thumb = await this.generateThumbnailFromPage(page);
        await pdf.destroy();
        return thumb;
    }

    /** Returns an object URL for a JPEG tile. The caller owns the URL and has to revoke it. */
    static async generateThumbnailFromPage(
        page: PDFPageProxy,
        targetWidthPx: number = GRID_THUMBNAIL_WIDTH_PX,
    ): Promise<string> {
        const baseViewport = page.getViewport({ scale: 1 });
        const scaleFromWidth = targetWidthPx / Math.max(1, baseViewport.width);
        const renderScale = Math.min(
            ThumbnailService.MAX_RENDER_SCALE,
            Math.max(ThumbnailService.MIN_RENDER_SCALE, scaleFromWidth),
        );
        const viewport = page.getViewport({ scale: renderScale });
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');

        canvas.height = viewport.height;
        canvas.width = viewport.width;

        if (context) {
            context.imageSmoothingEnabled = true;
            context.imageSmoothingQuality = 'high';
            // PDF pages may have transparent areas and JPEG has no alpha channel: paint white first
            // or those areas come out black.
            context.fillStyle = '#ffffff';
            context.fillRect(0, 0, canvas.width, canvas.height);
            await (page as unknown as { render: (params: Record<string, unknown>) => { promise: Promise<void> } }).render({
                canvasContext: context,
                viewport,
                canvas,
                annotationMode: 0,
                canvasFactory: ThumbnailService.createCanvasFactory(),
            }).promise;
            const blob = await new Promise<Blob | null>((resolve) => {
                canvas.toBlob(resolve, 'image/jpeg', THUMBNAIL_JPEG_QUALITY);
            });
            if (!blob) {
                throw new Error('Thumbnail encode failed');
            }
            return URL.createObjectURL(blob);
        }

        throw new Error('Canvas context not available');
    }
}
