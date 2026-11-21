import assert from 'node:assert/strict';
import test from 'node:test';
import { targetBytesFromMb } from './compress-target';

test('an empty field means "no target"', () => {
  assert.equal(targetBytesFromMb(''), undefined);
  assert.equal(targetBytesFromMb('   '), undefined);
});

test('megabytes are parsed, including a comma decimal', () => {
  assert.equal(targetBytesFromMb('10'), 10 * 1024 * 1024);
  assert.equal(targetBytesFromMb('0.5'), 512 * 1024);
  assert.equal(targetBytesFromMb('1,5'), Math.round(1.5 * 1024 * 1024));
});

test('garbage and non-positive values are ignored instead of gating the run', () => {
  assert.equal(targetBytesFromMb('abc'), undefined);
  assert.equal(targetBytesFromMb('0'), undefined);
  assert.equal(targetBytesFromMb('-3'), undefined);
});
