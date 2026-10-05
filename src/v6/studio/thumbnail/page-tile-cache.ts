import type { PlatformRuntime } from '../../../app/platform/create-platform';
import { getPdfJs } from '../../services/pdf/pdf-loader';
import { onMemoryPressure } from '../../utils/memory-pressure';

/**
 * Sharp tier of a page, rendered at the size the page is actually shown at instead of a fixed
 * absolute scale. The bitmap is shared by the canvas tile and by the edit surface, so both pay for
 * one render.
 */
export const MIN_TILE_PIXEL_WIDTH = 256;
export const MAX_TILE_PIXEL_WIDTH = 1944;

const TILE_TIER_STEP = 1.5;
const TILE_CACHE_ENTRIES = 30;
/** ~192 MB of RGBA: the entry count alone would allow half a gigabyte at the top tiers. */
const TILE_CACHE_PIXEL_BUDGET = 48 * 1024 * 1024;
const PDF_DOCUMENT_CACHE_LIMIT = 5;

const tileCache = new Map<string, HTMLCanvasElement>();

/**
 * Importing a file commits pages to the canvas continuously; rasterising the sharp tier at the same
 * time competes with the import for the main thread, so tile rendering waits for the import to end.
 */
let tileGate: Promise<void> = Promise.resolve();
let releaseTileGate: (() => void) | null = null;

export function pauseTileRendering(): void {
    if (!releaseTileGate) {
        tileGate = new Promise<void>((resolve) => {
            releaseTileGate = resolve;
        });
    }
}

export function resumeTileRendering(): void {
    const release = releaseTileGate;
    releaseTileGate = null;
    tileGate = Promise.resolve();
    release?.();
}

/** Snaps the requested width onto a coarse ladder so zooming does not re-render on every step. */
export function quantizeTileWidth(targetWidthPx: number): number {
    const requested = Math.min(MAX_TILE_PIXEL_WIDTH, Math.max(MIN_TILE_PIXEL_WIDTH, Math.round(targetWidthPx)));
    let tier = MIN_TILE_PIXEL_WIDTH;
    while (tier < requested && tier < MAX_TILE_PIXEL_WIDTH) {
        tier = Math.min(MAX_TILE_PIXEL_WIDTH, Math.round(tier * TILE_TIER_STEP));
    }
    return tier;
}

function cachedPixels(): number {
    let pixels = 0;
    for (const canvas of tileCache.values()) {
        pixels += canvas.width * canvas.height;
    }
    return pixels;
}

/**
 * Drops the oldest tiles. The canvas of an evicted entry is deliberately NOT recycled: a tile that
 * is still on screen must keep its pixels, and shrinking or clearing it would blank the page until
 * the next render. Letting it go unreferenced hands the memory back to the GC instead.
 */
function evictTiles(targetEntries: number, pixelBudget: number): void {
    while (tileCache.size > 0 && (tileCache.size > targetEntries || (cachedPixels() > pixelBudget && tileCache.size > 1))) {
        const oldestKey = tileCache.keys().next().value;
        if (!oldestKey) {
            break;
        }
        tileCache.delete(oldestKey);
    }
}

// --- LRU cache for loaded PDFJS document proxies ---
const pdfDocumentCache = new Map<string, Promise<any>>();

async function getCachedPdfDocument(fileId: string, runtime: PlatformRuntime): Promise<any> {
    const cachedPromise = pdfDocumentCache.get(fileId);
    if (cachedPromise) {
        // Refresh position in Map for LRU eviction
        pdfDocumentCache.delete(fileId);
        pdfDocumentCache.set(fileId, cachedPromise);
        return cachedPromise;
    }

    const pdfPromise = (async () => {
        try {
            const pdfjs = await getPdfJs();
            const entry = await runtime.vfs.read(fileId);
            const blob = await entry.getBlob();
            const buffer = await blob.arrayBuffer();
            const loadingTask = pdfjs.getDocument({ data: new Uint8Array(buffer) });
            return await loadingTask.promise;
        } catch (error) {
            // Remove broken promise from cache so next try can start fresh
            pdfDocumentCache.delete(fileId);
            throw error;
        }
    })();

    if (pdfDocumentCache.size >= PDF_DOCUMENT_CACHE_LIMIT) {
        const oldestKey = pdfDocumentCache.keys().next().value;
        if (oldestKey) {
            const oldestPromise = pdfDocumentCache.get(oldestKey);
            pdfDocumentCache.delete(oldestKey);
            if (oldestPromise) {
                try {
                    const pdf = await oldestPromise;
                    await pdf.destroy();
                } catch (error) {
                    console.error('Failed to destroy cached pdf document:', error);
                }
            }
        }
    }

    pdfDocumentCache.set(fileId, pdfPromise);
    return pdfPromise;
}

async function clearPdfDocumentCache(): Promise<void> {
    const promises = Array.from(pdfDocumentCache.values());
    pdfDocumentCache.clear();
    for (const promise of promises) {
        try {
            const pdf = await promise;
            await pdf.destroy();
        } catch {
            // Silence destruction errors
        }
    }
}

let memoryPressureCleanup: (() => void) | null = null;

function ensureMemoryPressureListener(): void {
    if (memoryPressureCleanup) {
        return;
    }
    memoryPressureCleanup = onMemoryPressure(() => {
        evictTiles(10, TILE_CACHE_PIXEL_BUDGET / 4);
        void clearPdfDocumentCache();
    });
}

/**
 * Returns a cached canvas holding the page rendered at (at least) `targetWidthPx` device pixels.
 * The canvas belongs to the cache — draw it, never mutate it.
 */
export async function acquirePageTile(
    runtime: PlatformRuntime,
    fileId: string,
    pageIndex: number,
    targetWidthPx: number,
): Promise<HTMLCanvasElement> {
    ensureMemoryPressureListener();
    await tileGate;

    const tier = quantizeTileWidth(targetWidthPx);
    const cacheKey = `${fileId}_${pageIndex}_${tier}`;
    const cached = tileCache.get(cacheKey);
    if (cached) {
        tileCache.delete(cacheKey);
        tileCache.set(cacheKey, cached);
        return cached;
    }

    const pdf = await getCachedPdfDocument(fileId, runtime);
    const pdfPage = await pdf.getPage(pageIndex + 1);
    const baseViewport = pdfPage.getViewport({ scale: 1 });
    const viewport = pdfPage.getViewport({ scale: tier / Math.max(1, baseViewport.width) });
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(viewport.width));
    canvas.height = Math.max(1, Math.round(viewport.height));
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        throw new Error('Page tile context not available');
    }

    await pdfPage.render({
        canvasContext: ctx,
        viewport,
        canvas,
    }).promise;

    tileCache.set(cacheKey, canvas);
    evictTiles(TILE_CACHE_ENTRIES, TILE_CACHE_PIXEL_BUDGET);
    return canvas;
}

/** Encodes a cached tile into an object URL. The caller owns the URL and has to revoke it. */
export async function renderPageTileUrl(
    runtime: PlatformRuntime,
    fileId: string,
    pageIndex: number,
    targetWidthPx: number,
    quality = 0.92,
): Promise<string> {
    const canvas = await acquirePageTile(runtime, fileId, pageIndex, targetWidthPx);
    const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(resolve, 'image/jpeg', quality);
    });
    if (!blob) {
        throw new Error('Page tile encode failed');
    }
    return URL.createObjectURL(blob);
}
