import assert from 'node:assert/strict';
import test from 'node:test';
import { InMemoryFileSystem } from '../../test-utils/in-memory-fs';
import { run } from './index';
import { IMAGES_TO_PDF_FREE_LIMIT } from '../definition';
import { buildPdfFromImageBlobs } from '../../../services/images/build-pdf-from-images';

const PNG_1X1_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function createPngFile(name: string): File {
  const bytes = Buffer.from(PNG_1X1_BASE64, 'base64');
  return new File([bytes], name, { type: 'image/png' });
}

test('buildPdfFromImageBlobs creates a PDF with one page per image', async () => {
  const pdf = await buildPdfFromImageBlobs([
    createPngFile('a.png'),
    createPngFile('b.png'),
  ]);
  assert.equal(pdf.type, 'application/pdf');
  assert.ok(pdf.size > 100);
});

test('images-to-pdf logic merges ordered images into one PDF', async () => {
  const fs = new InMemoryFileSystem();
  fs.seed('img-a', createPngFile('scan-a.png'));
  fs.seed('img-b', createPngFile('scan-b.png'));

  const result = await run({
    inputIds: ['img-a', 'img-b'],
    fs,
    options: { order: ['img-b', 'img-a'], maxImages: IMAGES_TO_PDF_FREE_LIMIT },
  });

  assert.equal(result.outputIds.length, 1);
  const out = await fs.read(result.outputIds[0]);
  assert.equal(await out.getType(), 'application/pdf');
  assert.match(out.getName(), /2-pages\.pdf$/u);
});

test('images-to-pdf logic rejects empty input', async () => {
  const fs = new InMemoryFileSystem();
  await assert.rejects(() => run({ inputIds: [], fs }), /at least one image/i);
});
