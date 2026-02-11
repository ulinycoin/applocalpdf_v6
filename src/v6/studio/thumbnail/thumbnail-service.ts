import * as pdfjs from 'pdfjs-dist';

// Point to the worker source from the package
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url
).toString();

export class ThumbnailService {
    static async generateThumbnail(pdfBuffer: ArrayBuffer, pageIndex: number): Promise<string> {
        // Use a copy to avoid detachment issues if called multiple times, 
        // though calling this in a loop is still inefficient.
        const loadingTask = pdfjs.getDocument({ data: new Uint8Array(pdfBuffer.slice(0)) });
        const pdf = await loadingTask.promise;
        const page = await pdf.getPage(pageIndex + 1);
        const thumb = await this.generateThumbnailFromPage(page);
        await pdf.destroy();
        return thumb;
    }

    static async generateThumbnailFromPage(page: any): Promise<string> {
        const viewport = page.getViewport({ scale: 0.5 });
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');

        canvas.height = viewport.height;
        canvas.width = viewport.width;

        if (context) {
            await page.render({ canvasContext: context, viewport, canvas }).promise;
            return canvas.toDataURL('image/png');
        }

        throw new Error('Canvas context not available');
    }
}
