import assert from 'node:assert/strict';
import test from 'node:test';
import { compressProgressPercent } from './progress';

const images = (pass: number, passes: number, processed: number, total: number) =>
  ({ pass, passes, processedImages: processed, totalImages: total });

test('image progress is spread across the file and capped below the final 100', () => {
  assert.equal(compressProgressPercent(0, 1, images(1, 2, 5, 10)), 25);
  assert.equal(compressProgressPercent(0, 1, images(2, 2, 10, 10)), 99);
});

test('a second file starts where the first one ended', () => {
  assert.equal(compressProgressPercent(1, 2, images(1, 1, 0, 10)), 50);
  assert.equal(compressProgressPercent(1, 2, images(1, 2, 10, 10)), 75);
});

test('a pass without images still advances and never exceeds the cap', () => {
  assert.equal(compressProgressPercent(0, 1, images(3, 6, 0, 0)), 33);
  assert.equal(compressProgressPercent(0, 0, images(1, 1, 1, 1)), 0);
});
