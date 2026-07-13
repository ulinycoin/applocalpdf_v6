import assert from 'node:assert/strict';
import test from 'node:test';
import { InMemoryFileSystem } from '../../test-utils/in-memory-fs';
import { createValidPdfBlob } from '../../../shared/test/create-valid-pdf';
import { run } from './index';

test('pdf-info logic writes a JSON analysis report', async () => {
  const fs = new InMemoryFileSystem();
  const pdf = new File([await createValidPdfBlob(2)], 'sample.pdf', { type: 'application/pdf' });
  fs.seed('f1', pdf);

  const result = await run({
    inputIds: ['f1'],
    fs,
  });

  assert.equal(result.outputIds.length, 1);
  const out = await fs.read(result.outputIds[0]!);
  const report = JSON.parse(await out.getText()) as { pageCount: number; fileName: string };
  assert.equal(report.fileName, 'sample.pdf');
  assert.equal(report.pageCount, 2);
});

test('pdf-info logic rejects empty input', async () => {
  const fs = new InMemoryFileSystem();
  await assert.rejects(() => run({ inputIds: [], fs }), /at least one input file/);
});
