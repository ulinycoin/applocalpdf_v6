import assert from 'node:assert/strict';
import test from 'node:test';
import { InMemoryFileSystem } from '../../test-utils/in-memory-fs';
import { createValidPdfBlob } from '../../../shared/test/create-valid-pdf';
import { firstHardRedactionFailure, run } from './index';

test('pdf-editor logic applies text edits and reports progress', async () => {
  const fs = new InMemoryFileSystem();
  const sourceBlob = await createValidPdfBlob(1);
  const sourceBytes = new Uint8Array(await sourceBlob.arrayBuffer());
  fs.seed('f1', sourceBlob);

  const progressUpdates: number[] = [];
  const result = await run({
    inputIds: ['f1'],
    fs,
    options: {
      elements: [
        {
          type: 'text',
          pageIndex: 0,
          text: 'HELLO LOCALPDF',
          xRatio: 12,
          yRatio: 18,
          widthRatio: 44,
          heightRatio: 8,
          fontSize: 20,
          fontFamily: 'Roboto',
          color: '#000000',
          bold: false,
          italic: false,
          opacity: 100,
          textAlign: 'left',
          horizontalScaling: 1,
        },
        {
          type: 'whiteout',
          pageIndex: 0,
          xRatio: 10,
          yRatio: 30,
          widthRatio: 40,
          heightRatio: 8,
          color: '#ffffff',
          strokeWidth: 0,
          opacity: 100,
        },
        {
          type: 'circle',
          pageIndex: 0,
          xRatio: 58,
          yRatio: 40,
          widthRatio: 14,
          heightRatio: 10,
          color: '#1d4ed8',
          strokeWidth: 2,
          opacity: 100,
        },
      ],
    },
    emitProgress: (value) => {
      progressUpdates.push(typeof value === 'number' ? value : value.progress);
    },
  });

  assert.equal(result.outputIds.length, 1);
  assert.ok(progressUpdates.length > 0);
  assert.equal(progressUpdates.at(-1), 100);

  const outputEntry = await fs.read(result.outputIds[0]);
  assert.equal(await outputEntry.getType(), 'application/pdf');

  const outputBlob = await outputEntry.getBlob();
  const outputBytes = new Uint8Array(await outputBlob.arrayBuffer());
  assert.notDeepEqual(outputBytes, sourceBytes);
});

test('pdf-editor logic rejects empty input', async () => {
  const fs = new InMemoryFileSystem();
  await assert.rejects(() => run({ inputIds: [], fs }), /at least one input file/);
});

test('pdf-editor logic enforces the shared payload cap instead of trusting its own normalizer', async () => {
  const fs = new InMemoryFileSystem();
  fs.seed('f1', await createValidPdfBlob(1));
  const elements = Array.from({ length: 2001 }, (_, index) => ({
    type: 'text',
    pageIndex: 0,
    text: `LINE ${index}`,
    xRatio: 10,
    yRatio: 10,
    widthRatio: 20,
    heightRatio: 5,
  }));

  await assert.rejects(
    () => run({ inputIds: ['f1'], fs, options: { elements } }),
    (error: Error & { code?: string }) => error.code === 'STUDIO_EDIT_TOO_LARGE',
  );
});

test('a skipped redaction check is not treated as a failure, a failed one is', () => {
  assert.equal(firstHardRedactionFailure([{ id: 'text_extract', result: 'pass' }, { id: 'metadata_xmp', result: 'skip' }]), undefined);
  const failure = firstHardRedactionFailure([{ id: 'text_extract', result: 'fail' }, { id: 'raw_bytes', result: 'pass' }]);
  assert.equal(failure?.id, 'text_extract');
  assert.equal(firstHardRedactionFailure([{ id: 'error', result: 'error' }])?.id, 'error');
});
