import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MAX_TILE_PIXEL_WIDTH, MIN_TILE_PIXEL_WIDTH, quantizeTileWidth } from './page-tile-cache';

test('a page tile is never rendered smaller than the grid thumbnail box', () => {
  assert.equal(quantizeTileWidth(0), MIN_TILE_PIXEL_WIDTH);
  assert.equal(quantizeTileWidth(175), MIN_TILE_PIXEL_WIDTH);
});

test('a page tile is capped so a zoomed-in page cannot allocate an unbounded bitmap', () => {
  assert.equal(quantizeTileWidth(100000), MAX_TILE_PIXEL_WIDTH);
});

test('tile widths snap to a coarse ladder instead of following every zoom step', () => {
  // 400 vs 500 device pixels is below the difference anyone can see, but re-rendering there costs a
  // full page rasterisation per visible page.
  assert.equal(quantizeTileWidth(400), quantizeTileWidth(500));
  assert.ok(quantizeTileWidth(1200) > quantizeTileWidth(400));
  assert.ok(quantizeTileWidth(1200) <= 1200 * 1.5 + 1);
});
