import assert from 'node:assert/strict';
import test from 'node:test';
import { InMemoryFileSystem } from '../../test-utils/in-memory-fs';
import { run } from './index';

test('pdf-editor logic is intentionally disabled', async () => {
  const fs = new InMemoryFileSystem();
  await assert.rejects(
    () => run({ inputIds: ['f1'], fs, options: {} }),
    /PDF Editor logic disabled\. Rebuild required\./,
  );
});
