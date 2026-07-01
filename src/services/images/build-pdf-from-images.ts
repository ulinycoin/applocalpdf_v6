const SUPPORTED_MIME = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);

export function isSupportedImageMime(mime: string): boolean {
  const normalized = mime.toLowerCase();
  return SUPPORTED_MIME.has(normalized);
}

async function normalizeImageBlob(blob: Blob): Promise<Blob> {
  if (!blob.type.startsWith('image/')) {
    return blob;
  }

  const preferredMime = blob.type === 'image/png' ? 'image/png' : 'image/jpeg';
  if (blob.type === 'image/png' || blob.type === 'image/jpeg' || blob.type === 'image/jpg') {
    return blob;
  }

  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') {
    return blob;
  }

  try {
    const bitmap = await createImageBitmap(blob);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        return blob;
      }
      ctx.drawImage(bitmap, 0, 0);
      const normalized = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(resolve, preferredMime, 0.92);
      });
      return normalized ?? blob;
    } finally {
      bitmap.close();
    }
  } catch {
    return blob;
  }
}

export async function buildPdfFromImageBlobs(images: Blob[]): Promise<Blob> {
  if (images.length === 0) {
    throw new Error('At least one image is required');
  }

  const { PDFDocument } = await import('pdf-lib');
  const pdfDoc = await PDFDocument.create();

  for (const source of images) {
    const image = await normalizeImageBlob(source);
    const mime = (image.type || '').toLowerCase();
    if (!isSupportedImageMime(mime)) {
      throw new Error(`Unsupported image type: ${mime || 'unknown'}. Use JPG, PNG, or WebP.`);
    }

    const bytes = new Uint8Array(await image.arrayBuffer());
    const embedded = mime === 'image/png'
      ? await pdfDoc.embedPng(bytes)
      : await pdfDoc.embedJpg(bytes);
    const { width, height } = embedded.scale(1);
    const page = pdfDoc.addPage([width, height]);
    page.drawImage(embedded, { x: 0, y: 0, width, height });
  }

  const output = await pdfDoc.save();
  const normalized = new Uint8Array(output.byteLength);
  normalized.set(output);
  return new Blob([normalized], { type: 'application/pdf' });
}
