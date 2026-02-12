import assert from 'node:assert/strict';
import test from 'node:test';
import { InMemoryFileSystem } from '../../test-utils/in-memory-fs';
import { run } from './index';

test('excel-to-pdf logic rejects empty input', async () => {
    const fs = new InMemoryFileSystem();
    await assert.rejects(() => run({ inputIds: [], fs }), /at least one input file/);
});

test('excel-to-pdf logic throws on invalid excel', async () => {
    const fs = new InMemoryFileSystem();
    fs.seed('f1', new Blob(['not an excel'], { type: 'application/vnd.ms-excel' }));

    // Excel parser should fail on random bytes
    await assert.rejects(() => run({ inputIds: ['f1'], fs }));
});
