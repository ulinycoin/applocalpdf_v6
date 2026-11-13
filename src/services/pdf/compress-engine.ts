import { PDFName, PDFNumber, PDFRawStream, type PDFDict, type PDFDocument, type PDFObject } from 'pdf-lib';

export interface CompressOptions {
    quality: 'low' | 'medium' | 'high';
}

export interface ICompressEngine {
    compress(pdfBlob: Blob, options?: CompressOptions): Promise<Blob>;
}

/**
 * What each level actually does to embedded photos.
 *
 * `light` only re-saves the document (structure streams), which is the honest "no quality loss"
 * setting. The other two downsample JPEG images and re-encode them, because images — not text — are
 * what makes a PDF big: on the shipped corpus a plain re-save saved a median of ~5%, and on scans
 * almost nothing.
 */
interface ImagePreset {
    maxEdgePx: number;
    jpegQuality: number;
}

const IMAGE_PRESETS: Record<CompressOptions['quality'], ImagePreset | null> = {
    low: null,
    medium: { maxEdgePx: 1600, jpegQuality: 0.72 },
    high: { maxEdgePx: 1200, jpegQuality: 0.6 },
};

/** Below this a re-encode cannot pay for itself. */
const MIN_IMAGE_BYTES = 20 * 1024;
/** Keep a replacement only when it beats the original by this much. */
const MIN_GAIN_RATIO = 0.9;

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

function isRecompressibleImage(stream: PDFRawStream): boolean {
    const dict = stream.dict;
    if (nameOf(dict.get(PDFName.of('Subtype'))) !== 'Image') {
        return false;
    }
    if (filterNames(dict).join(',') !== 'DCTDecode') {
        return false;
    }
    // Anything the re-encode would misinterpret is left untouched: an image mask, a soft mask (its
    // dimensions must match the image), a colour key or an inverted decode array.
    for (const key of ['SMask', 'Mask', 'ImageMask', 'Decode']) {
        if (dict.get(PDFName.of(key))) {
            return false;
        }
    }
    const colorSpace = nameOf(dict.get(PDFName.of('ColorSpace')));
    if (colorSpace !== 'DeviceRGB' && colorSpace !== 'DeviceGray') {
        return false;
    }
    return stream.contents.byteLength >= MIN_IMAGE_BYTES;
}

interface ReencodeResult {
    bytes: Uint8Array;
    width: number;
    height: number;
}

async function reencodeJpeg(stream: PDFRawStream, preset: ImagePreset): Promise<ReencodeResult | null> {
    const sourceBytes = stream.contents.slice();
    const bitmap = await createImageBitmap(new Blob([sourceBytes], { type: 'image/jpeg' }));
    try {
        const scale = Math.min(1, preset.maxEdgePx / Math.max(bitmap.width, bitmap.height));
        // Already small enough for the preset: nothing to gain.
        if (scale > 0.98) {
            return null;
        }
        const width = Math.max(1, Math.round(bitmap.width * scale));
        const height = Math.max(1, Math.round(bitmap.height * scale));
        const canvas = new OffscreenCanvas(width, height);
        const context = canvas.getContext('2d');
        if (!context) {
            return null;
        }
        context.drawImage(bitmap, 0, 0, width, height);
        const encoded = await canvas.convertToBlob({ type: 'image/jpeg', quality: preset.jpegQuality });
        const bytes = new Uint8Array(await encoded.arrayBuffer());
        return { bytes, width, height };
    } finally {
        bitmap.close?.();
    }
}

/**
 * Replaces the JPEG images in the document with smaller versions. Every failure keeps the original
 * stream, and the caller compares the final file size, so a document can never become larger.
 */
async function shrinkImages(pdf: PDFDocument, preset: ImagePreset): Promise<number> {
    if (typeof OffscreenCanvas === 'undefined' || typeof createImageBitmap !== 'function') {
        return 0;
    }
    let replaced = 0;
    for (const [ref, object] of pdf.context.enumerateIndirectObjects()) {
        if (!(object instanceof PDFRawStream) || !isRecompressibleImage(object)) {
            continue;
        }
        try {
            const result = await reencodeJpeg(object, preset);
            if (!result || result.bytes.byteLength >= object.contents.byteLength * MIN_GAIN_RATIO) {
                continue;
            }
            const replacement = pdf.context.stream(result.bytes, {});
            for (const [key, value] of object.dict.entries()) {
                replacement.dict.set(key, value);
            }
            replacement.dict.set(PDFName.of('Filter'), PDFName.of('DCTDecode'));
            replacement.dict.set(PDFName.of('Width'), PDFNumber.of(result.width));
            replacement.dict.set(PDFName.of('Height'), PDFNumber.of(result.height));
            replacement.dict.set(PDFName.of('ColorSpace'), PDFName.of('DeviceRGB'));
            replacement.dict.set(PDFName.of('BitsPerComponent'), PDFNumber.of(8));
            replacement.dict.delete(PDFName.of('DecodeParms'));
            pdf.context.assign(ref, replacement);
            replaced += 1;
        } catch {
            // A single image the browser cannot decode must not cost the user the whole compression.
        }
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
        const pdf = await PDFDocument.load(sourceBytes);

        const preset = IMAGE_PRESETS[options.quality] ?? IMAGE_PRESETS.medium;
        if (preset) {
            await shrinkImages(pdf, preset);
        }

        // Field appearances are not edited here; regenerating them can throw on values a standard
        // font cannot encode and would only add bytes.
        const saved = await pdf.save({ useObjectStreams: true, addDefaultPage: false, updateFieldAppearances: false });
        // Be honest: a re-save sometimes grows a file. Hand back the smaller of the two.
        return blobFrom(saved.byteLength < sourceBytes.byteLength ? saved : sourceBytes);
    }
}

export async function createCompressEngine(): Promise<ICompressEngine> {
    return new PdfLibCompressEngine();
}
