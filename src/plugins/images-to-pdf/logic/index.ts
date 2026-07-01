import type { ToolLogicFunction } from '../../../core/types/contracts';
import { buildPdfFromImageBlobs, isSupportedImageMime } from '../../../services/images/build-pdf-from-images';
import { IMAGES_TO_PDF_FREE_LIMIT, IMAGES_TO_PDF_PRO_LIMIT } from '../definition';

const FREE_MAX_IMAGES = IMAGES_TO_PDF_FREE_LIMIT;
const PRO_MAX_IMAGES = IMAGES_TO_PDF_PRO_LIMIT;

function buildOutputFileName(firstName: string, pageCount: number): string {
  const trimmed = firstName.trim();
  const base = trimmed.replace(/\.[^.]+$/u, '') || 'images';
  if (pageCount <= 1) {
    return `${base}.pdf`;
  }
  return `${base}-${pageCount}-pages.pdf`;
}

export const run: ToolLogicFunction = async ({ inputIds, fs, options, emitProgress }) => {
  if (inputIds.length === 0) {
    throw new Error('Images to PDF requires at least one image');
  }

  const maxImages = typeof options?.maxImages === 'number' && options.maxImages > 0
    ? Math.floor(options.maxImages)
    : FREE_MAX_IMAGES;
  if (inputIds.length > maxImages) {
    throw new Error(`This run supports up to ${maxImages} image${maxImages === 1 ? '' : 's'}. Remove extra files or upgrade to Pro.`);
  }

  const order = Array.isArray(options?.order)
    ? options.order.filter((value): value is string => typeof value === 'string')
    : inputIds;
  const orderedIds = order.filter((id) => inputIds.includes(id));
  const finalIds = orderedIds.length > 0 ? orderedIds : inputIds;

  const blobs: Blob[] = [];
  let firstName = 'images';

  for (let i = 0; i < finalIds.length; i += 1) {
    const entry = await fs.read(finalIds[i]);
    const blob = await entry.getBlob();
    if (!blob.type.startsWith('image/') || !isSupportedImageMime(blob.type)) {
      throw new Error(`Unsupported file: ${entry.getName()}. Use JPG, PNG, or WebP images.`);
    }
    if (i === 0) {
      firstName = entry.getName();
    }
    blobs.push(blob);
    emitProgress?.(Math.round(((i + 1) / finalIds.length) * 90));
  }

  const pdfBlob = await buildPdfFromImageBlobs(blobs);
  const outputEntry = await fs.write(new File(
    [pdfBlob],
    buildOutputFileName(firstName, blobs.length),
    { type: 'application/pdf' },
  ));
  emitProgress?.(100);
  return { outputIds: [outputEntry.id] };
};
