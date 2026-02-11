import assert from 'node:assert/strict';
import test from 'node:test';
import { InMemoryFileSystem } from '../../test-utils/in-memory-fs';
import { run } from './index';

test('word-to-pdf logic rejects empty input', async () => {
    const fs = new InMemoryFileSystem();
    await assert.rejects(() => run({ inputIds: [], fs }), /at least one input file/);
});

// Full conversion test would need a real .docx buffer, which is hard to mock perfectly.
// We verify that it attempts to use mammoth.
test('word-to-pdf logic throws on invalid docx', async () => {
    const fs = new InMemoryFileSystem();
    fs.seed('f1', new Blob(['not a docx'], { type: 'application/msword' }));

    // Mammoth should fail on random bytes
    await assert.rejects(() => run({ inputIds: ['f1'], fs }));
});
