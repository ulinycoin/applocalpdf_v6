import assert from 'node:assert/strict';
import test from 'node:test';
import { pickCoverColor } from './text-cover-color';

test('the majority colour around the run wins', () => {
  assert.equal(pickCoverColor(['#0d2e47', '#0d2e47', '#ffffff', null]), '#0d2e47');
});

test('a tie has no majority and falls back to null', () => {
  assert.equal(pickCoverColor(['#123456', '#654321']), null);
});

test('no usable sample falls back to null', () => {
  assert.equal(pickCoverColor([null, undefined, '']), null);
  assert.equal(pickCoverColor([]), null);
});

test('a split ring keeps the white fallback instead of painting text colour', () => {
  // Dense cell: half the samples land on glyphs, half on the page. A black cover would be worse
  // than the previous white one, so no colour is chosen.
  assert.equal(pickCoverColor(['#000000', '#ffffff', '#000000', '#ffffff']), null);
});
