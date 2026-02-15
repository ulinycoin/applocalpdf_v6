import assert from 'node:assert/strict';
import test from 'node:test';
import { PDFDocument } from 'pdf-lib';
import { InMemoryFileSystem } from '../../test-utils/in-memory-fs';
import { run } from './index';
import { createValidPdfBlob } from '../../../shared/test/create-valid-pdf';

test('pdf-editor logic writes edited PDF output', async () => {
  const fs = new InMemoryFileSystem();
  const pdf = await createValidPdfBlob(1);
  fs.seed('f1', pdf);

  const result = await run({
    inputIds: ['f1'],
    fs,
    options: {
      edits: [
        {
          pageIndex: 0,
          text: 'Hello',
          xRatio: 0.2,
          yRatio: 0.2,
          widthRatio: 0.4,
          heightRatio: 0.12,
          fontSizeRatio: 0.04,
          color: '#111111',
          backgroundColor: '#ffffff',
        },
      ],
    },
  });

  assert.equal(result.outputIds.length, 1);
  const out = await fs.read(result.outputIds[0]);
  assert.equal(await out.getType(), 'application/pdf');

  const outBytes = new Uint8Array(await (await out.getBlob()).arrayBuffer());
  const parsed = await PDFDocument.load(outBytes);
  assert.equal(parsed.getPageCount(), 1);
});

test('pdf-editor logic rejects empty input', async () => {
  const fs = new InMemoryFileSystem();
  await assert.rejects(() => run({ inputIds: [], fs }), /at least one input file/);
});

test('pdf-editor logic rejects missing edits', async () => {
  const fs = new InMemoryFileSystem();
  const pdf = await createValidPdfBlob(1);
  fs.seed('f1', pdf);

  await assert.rejects(() => run({ inputIds: ['f1'], fs, options: {} }), /at least one text edit/);
});
