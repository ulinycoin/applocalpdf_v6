import { PDFDict, PDFName, PDFNumber, PDFRawStream, type PDFDocument, type PDFObject, type PDFRef } from 'pdf-lib';
import { inflateDeflateBytes } from './inflate-deflate';

export interface CompressProgress {
    /** 1-based pass over the preset ladder (a single pass when no target size is set). */
    pass: number;
    passes: number;
    processedImages: number;
    totalImages: number;
}

export interface CompressOptions {
    quality: 'low' | 'medium' | 'high';
    /** Compress until the file fits this many bytes, going down the preset ladder when needed. */
    targetBytes?: number;
    /** Called as image work progresses inside the current pass. */
    onProgress?: (progress: CompressProgress) => void;
}

export interface ICompressEngine {
    compress(pdfBlob: Blob, options?: CompressOptions): Promise<Blob>;
}

/**
 * What each level actually does to embedded images.
 *
 * `light` only re-saves the document (structure streams), which is the honest "no quality loss"
 * setting. The other two downsample and re-encode images, because images — not text — are what makes
 * a PDF big: on the shipped corpus a plain re-save saved a median of ~5%, and on scans almost nothing.
 *
 * Three image layouts are handled: baseline JPEG (`DCTDecode`), raw Flate samples, and Flate samples
 * with a PNG predictor (`DecodeParms`). 1-bit (bilevel) images are deliberately preserved untouched:
 * JPEG makes them larger, and a browser cannot emit CCITT/JBIG2. Re-encoding is lossy, so every
 * replacement must beat the original by `MIN_GAIN_RATIO` and the final file never grows.
 */
interface ImagePreset {
    maxEdgePx: number;
    jpegQuality: number;
    /** Last-resort lever for a target size: colour scans nearly always fit once reduced to gray. */
    grayscale?: boolean;
}

const IMAGE_PRESETS: Record<CompressOptions['quality'], ImagePreset | null> = {
    low: null,
    medium: { maxEdgePx: 1600, jpegQuality: 0.72 },
    high: { maxEdgePx: 1200, jpegQuality: 0.6 },
};

/** Tried in order when the caller asks for a target size. Each pass re-encodes from the source PDF. */
function targetLadder(quality: CompressOptions['quality']): ImagePreset[] {
    const ladder: ImagePreset[] = quality === 'high'
        ? [{ maxEdgePx: 1200, jpegQuality: 0.6 }]
        : [{ maxEdgePx: 1600, jpegQuality: 0.72 }];
    return [
        ...ladder,
        { maxEdgePx: 1400, jpegQuality: 0.55 },
        { maxEdgePx: 1100, jpegQuality: 0.5 },
        { maxEdgePx: 900, jpegQuality: 0.45 },
        { maxEdgePx: 760, jpegQuality: 0.42, grayscale: true },
        { maxEdgePx: 640, jpegQuality: 0.4, grayscale: true },
    ];
}

/** Below this a re-encode cannot pay for itself. */
const MIN_JPEG_INPUT_BYTES = 20 * 1024;
/** Scanned pages are often 3-6 KB each; 20 KB would skip exactly the files this path exists for. */
const MIN_FLATE_INPUT_BYTES = 2 * 1024;
/** Keep a replacement only when it beats the original by this much. */
const MIN_GAIN_RATIO = 0.9;
/** Above this a single image risks exhausting the tab's memory; it is left untouched. */
const MAX_IMAGE_PIXELS = 40_000_000;

function nameOf(value: PDFObject | undefined): string | undefined {
    if (!value || typeof value !== 'object' || typeof (value as { asString?: unknown }).asString !== 'function') {
        return undefined;
    }
    const name = (value as unknown as { asString: () => string }).asString();
    return name.replace(/^\//u, '');
}

function filterNames(dict: PDFDict): string[] {
    const filter = dict.get(PDFName.of('Filter'));
    if (!filter) {
        return [];
    }
    if (Array.isArray(filter)) {
        return filter.map((item) => nameOf(item) ?? '');
    }
    const single = nameOf(filter);
    return single ? [single] : [];
}

function numberValue(dict: PDFDict, key: string): number | undefined {
    const value = dict.get(PDFName.of(key));
    return value instanceof PDFNumber ? value.asNumber() : undefined;
}

/** Keys that mean the raw samples cannot be reinterpreted without breaking the page. */
function hasReinterpretationHazard(dict: PDFDict): boolean {
    for (const key of ['SMask', 'Mask', 'ImageMask', 'Decode']) {
        if (dict.get(PDFName.of(key))) {
            return true;
        }
    }
    return false;
}

function colorChannels(dict: PDFDict): 1 | 3 | null {
    const colorSpace = nameOf(dict.get(PDFName.of('ColorSpace')));
    if (colorSpace === 'DeviceGray') {
        return 1;
    }
    if (colorSpace === 'DeviceRGB') {
        return 3;
    }
    return null;
}

interface PngPredictorParams {
    predictor: number;
    colors: number;
    columns: number;
}

/**
 * Reads `/DecodeParms` for a Flate image. Predictors 10-15 are the PNG family and are supported;
 * predictor 2 (TIFF) and any mismatched geometry are refused rather than guessed.
 */
function flatePredictorParams(dict: PDFDict, width: number, channels: 1 | 3): PngPredictorParams | 'unsupported' | null {
    const value = dict.get(PDFName.of('DecodeParms'));
    if (!value) {
        return { predictor: 1, colors: channels, columns: width };
    }
    const params = value instanceof PDFDict ? value : null;
    if (!params) {
        return 'unsupported';
    }
    const predictor = numberValue(params, 'Predictor') ?? 1;
    if (predictor === 1) {
        return { predictor, colors: channels, columns: width };
    }
    if (predictor < 10 || predictor > 15) {
        return 'unsupported';
    }
    const colors = numberValue(params, 'Colors') ?? channels;
    const columns = numberValue(params, 'Columns') ?? width;
    const bits = numberValue(params, 'BitsPerComponent') ?? 8;
    if (colors !== channels || columns !== width || bits !== 8) {
        return 'unsupported';
    }
    return { predictor, colors, columns };
}

export type ImageKind = 'jpeg' | 'flate' | 'preserve';

/** Exported for tests: this decides what is safe to re-encode without corrupting the page. */
export function classifyImage(stream: PDFRawStream): ImageKind | null {
    const dict = stream.dict;
    if (nameOf(dict.get(PDFName.of('Subtype'))) !== 'Image') {
        return null;
    }
    if (hasReinterpretationHazard(dict)) {
        return null;
    }
    const width = numberValue(dict, 'Width');
    const height = numberValue(dict, 'Height');
    if (!width || !height || width * height > MAX_IMAGE_PIXELS) {
        return null;
    }
    const filter = filterNames(dict).join(',');
    // Colour spaces expressed as arrays (ICCBased/Indexed) are skipped on purpose: reinterpreting them
    // without a profile is how a compression feature quietly shifts colours.
    const channels = colorChannels(dict);
    if (!channels) {
        return null;
    }
    if (filter === 'DCTDecode') {
        return stream.contents.byteLength >= MIN_JPEG_INPUT_BYTES ? 'jpeg' : null;
    }
    if (filter !== 'FlateDecode') {
        return null;
    }
    const bits = numberValue(dict, 'BitsPerComponent');
    // Bilevel pages are recognised so tests and callers can tell "kept on purpose" from "unknown".
    if (bits === 1) {
        return 'preserve';
    }
    if (bits !== 8) {
        return null;
    }
    if (flatePredictorParams(dict, width, channels) === 'unsupported') {
        return null;
    }
    return stream.contents.byteLength >= MIN_FLATE_INPUT_BYTES ? 'flate' : null;
}

interface ReencodeResult {
    bytes: Uint8Array;
    width: number;
    height: number;
}

interface RasterSamples {
    width: number;
    height: number;
    channels: 1 | 3;
    samples: Uint8Array;
}

function paeth(left: number, up: number, upLeft: number): number {
    const estimate = left + up - upLeft;
    const toLeft = Math.abs(estimate - left);
    const toUp = Math.abs(estimate - up);
    const toUpLeft = Math.abs(estimate - upLeft);
    if (toLeft <= toUp && toLeft <= toUpLeft) {
        return left;
    }
    return toUp <= toUpLeft ? up : upLeft;
}

/** Reverses the PNG row filters (types 0-4) that `/Predictor 10-15` applies to the samples. */
export function unfilterPngRows(encoded: Uint8Array, rows: number, rowBytes: number): Uint8Array | null {
    const expected = rows * (rowBytes + 1);
    if (encoded.byteLength < expected) {
        return null;
    }
    const out = new Uint8Array(rows * rowBytes);
    for (let row = 0; row < rows; row += 1) {
        const filter = encoded[row * (rowBytes + 1)];
        const source = row * (rowBytes + 1) + 1;
        const target = row * rowBytes;
        const previous = (row - 1) * rowBytes;
        for (let i = 0; i < rowBytes; i += 1) {
            const raw = encoded[source + i];
            const left = i > 0 ? out[target + i - 1] : 0;
            const up = row > 0 ? out[previous + i] : 0;
            const upLeft = row > 0 && i > 0 ? out[previous + i - 1] : 0;
            let value: number;
            switch (filter) {
                case 0:
                    value = raw;
                    break;
                case 1:
                    value = raw + left;
                    break;
                case 2:
                    value = raw + up;
                    break;
                case 3:
                    value = raw + Math.floor((left + up) / 2);
                    break;
                case 4:
                    value = raw + paeth(left, up, upLeft);
                    break;
                default:
                    return null;
            }
            out[target + i] = value & 0xff;
        }
    }
    return out;
}

/**
 * Inflates the raw samples of a Flate image, applying the PNG predictor when the dictionary declares
 * one. Exported for tests: this is the only piece of the Flate path that can be checked without a
 * canvas, and getting the layout wrong corrupts the image.
 */
export async function decodeFlateImageSamples(stream: PDFRawStream): Promise<RasterSamples | null> {
    const dict = stream.dict;
    const width = numberValue(dict, 'Width');
    const height = numberValue(dict, 'Height');
    const channels = colorChannels(dict);
    if (!width || !height || !channels || width * height > MAX_IMAGE_PIXELS) {
        return null;
    }
    if (numberValue(dict, 'BitsPerComponent') !== 8) {
        return null;
    }
    const predictor = flatePredictorParams(dict, width, channels);
    if (!predictor || predictor === 'unsupported') {
        return null;
    }
    const inflated = await inflateDeflateBytes(stream.contents.slice());
    if (!inflated) {
        return null;
    }
    const rowBytes = width * channels;
    if (predictor.predictor === 1) {
        if (inflated.byteLength < rowBytes * height) {
            return null;
        }
        return { width, height, channels, samples: inflated.subarray(0, rowBytes * height) };
    }
    const samples = unfilterPngRows(inflated, height, rowBytes);
    if (!samples) {
        return null;
    }
    return { width, height, channels, samples };
}

function toRgba(samples: RasterSamples, grayscale: boolean): Uint8ClampedArray<ArrayBuffer> {
    const { width, height, channels, samples: src } = samples;
    // Explicit ArrayBuffer: ImageData rejects a view typed over SharedArrayBuffer.
    const rgba = new Uint8ClampedArray(new ArrayBuffer(width * height * 4));
    if (channels === 3 && !grayscale) {
        for (let i = 0, j = 0; i < src.length; i += 3, j += 4) {
            rgba[j] = src[i];
            rgba[j + 1] = src[i + 1];
            rgba[j + 2] = src[i + 2];
            rgba[j + 3] = 255;
        }
        return rgba;
    }
    const step = channels === 3 ? 3 : 1;
    for (let i = 0, j = 0; i < src.length; i += step, j += 4) {
        // Luma rather than a channel dump: a gray conversion that ignored colour would look like a bug.
        const gray = channels === 1 ? src[i] : Math.round(0.299 * src[i] + 0.587 * src[i + 1] + 0.114 * src[i + 2]);
        rgba[j] = gray;
        rgba[j + 1] = gray;
        rgba[j + 2] = gray;
        rgba[j + 3] = 255;
    }
    return rgba;
}

async function encodeJpeg(canvas: OffscreenCanvas, quality: number): Promise<ReencodeResult> {
    const encoded = await canvas.convertToBlob({ type: 'image/jpeg', quality });
    return {
        bytes: new Uint8Array(await encoded.arrayBuffer()),
        width: canvas.width,
        height: canvas.height,
    };
}

async function reencodeJpeg(stream: PDFRawStream, preset: ImagePreset): Promise<ReencodeResult | null> {
    const sourceBytes = stream.contents.slice();
    const bitmap = await createImageBitmap(new Blob([sourceBytes], { type: 'image/jpeg' }));
    try {
        const scale = Math.min(1, preset.maxEdgePx / Math.max(bitmap.width, bitmap.height));
        const width = Math.max(1, Math.round(bitmap.width * scale));
        const height = Math.max(1, Math.round(bitmap.height * scale));
        const canvas = new OffscreenCanvas(width, height);
        const context = canvas.getContext('2d');
        if (!context) {
            return null;
        }
        context.drawImage(bitmap, 0, 0, width, height);
        // No downscale needed, but the image can still be a bloated high-quality JPEG: re-encoding it at
        // the preset quality is exactly what "Balanced" promises, and the generic gain guard rejects it
        // when the result would not be at least 10% smaller.
        return await encodeJpeg(canvas, preset.jpegQuality);
    } finally {
        bitmap.close?.();
    }
}

/**
 * Re-encodes inflated samples as JPEG. Unlike the JPEG path this does not require downsampling: Flate
 * stores raw pixels, so even an image that already fits the preset is much smaller as a photo JPEG.
 */
async function reencodeRaster(samples: RasterSamples, preset: ImagePreset): Promise<ReencodeResult | null> {
    const { width: sourceWidth, height: sourceHeight } = samples;
    const scale = Math.min(1, preset.maxEdgePx / Math.max(sourceWidth, sourceHeight));
    const width = Math.max(1, Math.round(sourceWidth * scale));
    const height = Math.max(1, Math.round(sourceHeight * scale));

    const source = new OffscreenCanvas(sourceWidth, sourceHeight);
    const sourceContext = source.getContext('2d');
    if (!sourceContext) {
        return null;
    }
    sourceContext.putImageData(new ImageData(toRgba(samples, !!preset.grayscale), sourceWidth, sourceHeight), 0, 0);

    const canvas = scale > 0.98 ? source : new OffscreenCanvas(width, height);
    if (canvas !== source) {
        const context = canvas.getContext('2d');
        if (!context) {
            return null;
        }
        context.drawImage(source, 0, 0, width, height);
    }
    return await encodeJpeg(canvas, preset.jpegQuality);
}

function replaceImage(pdf: PDFDocument, ref: PDFRef, original: PDFRawStream, result: ReencodeResult): void {
    const replacement = pdf.context.stream(result.bytes, {});
    for (const [key, value] of original.dict.entries()) {
        replacement.dict.set(key, value);
    }
    replacement.dict.set(PDFName.of('Filter'), PDFName.of('DCTDecode'));
    replacement.dict.set(PDFName.of('Width'), PDFNumber.of(result.width));
    replacement.dict.set(PDFName.of('Height'), PDFNumber.of(result.height));
    replacement.dict.set(PDFName.of('ColorSpace'), PDFName.of('DeviceRGB'));
    replacement.dict.set(PDFName.of('BitsPerComponent'), PDFNumber.of(8));
    replacement.dict.delete(PDFName.of('DecodeParms'));
    pdf.context.assign(ref, replacement);
}

interface ImageTarget {
    ref: PDFRef;
    object: PDFRawStream;
    kind: 'jpeg' | 'flate';
}

/**
 * Replaces JPEG and Flate images with smaller JPEG versions. Every failure keeps the original stream,
 * and the caller compares the final file size, so a document can never become larger.
 */
async function shrinkImages(
    pdf: PDFDocument,
    preset: ImagePreset,
    onImages?: (processed: number, total: number) => void,
): Promise<number> {
    // Classification first: the caller gets an honest total before the expensive work starts.
    const targets: ImageTarget[] = [];
    for (const [ref, object] of pdf.context.enumerateIndirectObjects()) {
        if (!(object instanceof PDFRawStream)) {
            continue;
        }
        const kind = classifyImage(object);
        if (kind === 'jpeg' || kind === 'flate') {
            targets.push({ ref, object, kind });
        }
    }
    if (typeof OffscreenCanvas === 'undefined' || typeof createImageBitmap !== 'function') {
        // No canvas in this runtime (Node tests): report an empty, finished pass so a target ladder still
        // advances its progress instead of looking stuck.
        onImages?.(0, 0);
        return 0;
    }
    onImages?.(0, targets.length);

    let replaced = 0;
    let processed = 0;
    for (const { ref, object, kind } of targets) {
        try {
            const result = kind === 'jpeg'
                ? await reencodeJpeg(object, preset)
                : await (async () => {
                    if (typeof ImageData === 'undefined') {
                        return null;
                    }
                    const samples = await decodeFlateImageSamples(object);
                    return samples ? reencodeRaster(samples, preset) : null;
                })();
            if (result && result.bytes.byteLength < object.contents.byteLength * MIN_GAIN_RATIO) {
                replaceImage(pdf, ref, object, result);
                replaced += 1;
            }
        } catch {
            // A single image the browser cannot decode must not cost the user the whole compression.
        }
        processed += 1;
        onImages?.(processed, targets.length);
    }
    return replaced;
}

function blobFrom(bytes: Uint8Array): Blob {
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    return new Blob([copy as unknown as BlobPart], { type: 'application/pdf' });
}

export class PdfLibCompressEngine implements ICompressEngine {
    async compress(source: Blob, options: CompressOptions = { quality: 'medium' }): Promise<Blob> {
        const { PDFDocument } = await import('pdf-lib');
        const sourceBytes = new Uint8Array(await source.arrayBuffer());
        const basePreset = IMAGE_PRESETS[options.quality] ?? IMAGE_PRESETS.medium;
        const target = options.targetBytes && options.targetBytes > 0 ? options.targetBytes : undefined;
        const ladder = target
            ? targetLadder(options.quality)
            : (basePreset ? [basePreset] : []);

        let best: Uint8Array | null = null;
        for (let pass = 0; pass < ladder.length; pass += 1) {
            const pdf = await PDFDocument.load(sourceBytes);
            await shrinkImages(pdf, ladder[pass], (processed, total) => {
                options.onProgress?.({
                    pass: pass + 1,
                    passes: ladder.length,
                    processedImages: processed,
                    totalImages: total,
                });
            });
            // Field appearances are not edited here; regenerating them can throw on values a standard
            // font cannot encode and would only add bytes.
            const saved = await pdf.save({ useObjectStreams: true, addDefaultPage: false, updateFieldAppearances: false });
            if (!best || saved.byteLength < best.byteLength) {
                best = saved;
            }
            if (!target || (best && best.byteLength <= target)) {
                break;
            }
        }

        const candidate = best && best.byteLength < sourceBytes.byteLength ? best : sourceBytes;
        // Be honest: a re-save sometimes grows a file. Hand back the smaller of the two.
        return blobFrom(candidate);
    }
}

export async function createCompressEngine(): Promise<ICompressEngine> {
    return new PdfLibCompressEngine();
}
