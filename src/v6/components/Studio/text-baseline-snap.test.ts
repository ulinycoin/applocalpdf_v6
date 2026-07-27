import assert from 'node:assert/strict';
import test from 'node:test';
import {
  estimateBaselineOffsetRatio,
  snapOverlayTextToBaselines,
  spanBaselineRatio,
} from './text-baseline-snap';

test('spanBaselineRatio uses ascent when present', () => {
  assert.equal(spanBaselineRatio({ yRatio: 0.2, heightRatio: 0.03, ascentRatio: 0.024 }), 0.224);
});

test('snapOverlayTextToBaselines locks to nearby PDF baseline', () => {
  const spans = [
    { yRatio: 0.2, heightRatio: 0.03, ascentRatio: 0.024, pageHeightPt: 842 },
  ];
  const offset = estimateBaselineOffsetRatio(13, 1.2, 842);
  const nearY = 0.224 - offset + 0.004;
  const snapped = snapOverlayTextToBaselines({
    y: nearY,
    fontSize: 13,
    lineHeight: 1.2,
    pageHeightPt: 842,
    spans,
  });
  assert.equal(snapped.snapped, true);
  assert.ok(snapped.baselineRatio !== undefined);
  assert.ok(Math.abs((snapped.baselineRatio ?? 0) - 0.224) < 0.0001);
  assert.ok(Math.abs(snapped.y - (0.224 - offset)) < 0.0001);
});

test('snapOverlayTextToBaselines does not snap when far from guides', () => {
  const snapped = snapOverlayTextToBaselines({
    y: 0.5,
    fontSize: 13,
    lineHeight: 1.2,
    pageHeightPt: 842,
    spans: [{ yRatio: 0.1, heightRatio: 0.02, ascentRatio: 0.016 }],
  });
  assert.equal(snapped.snapped, false);
  assert.equal(snapped.baselineRatio, undefined);
});
