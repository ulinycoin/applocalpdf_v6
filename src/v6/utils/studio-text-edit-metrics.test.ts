import assert from 'node:assert/strict';
import test from 'node:test';
import { buildTextEditCommitMetrics, resolveTextEditMode } from './studio-text-edit-metrics';

test('buildTextEditCommitMetrics reports a change without leaking the text', () => {
  const metrics = buildTextEditCommitMetrics({ initialValue: 'Invoice 42', value: 'Invoice 43' });
  assert.deepEqual(metrics, {
    changed: true,
    charsBefore: 10,
    charsAfter: 10,
    charsDelta: 0,
    lines: 1,
    multiline: false,
  });
  assert.equal('initialValue' in metrics, false);
  assert.equal('value' in metrics, false);
});

test('buildTextEditCommitMetrics reports an untouched session', () => {
  const metrics = buildTextEditCommitMetrics({ initialValue: 'Same', value: 'Same' });
  assert.equal(metrics.changed, false);
  assert.equal(metrics.charsDelta, 0);
});

test('buildTextEditCommitMetrics counts lines and multiline boxes', () => {
  const metrics = buildTextEditCommitMetrics({ initialValue: '', value: 'one\ntwo\r\nthree' });
  assert.equal(metrics.lines, 3);
  assert.equal(metrics.multiline, true);
  assert.equal(buildTextEditCommitMetrics({ initialValue: 'a', value: '' }).lines, 0);
});

test('resolveTextEditMode separates editing the PDF from adding content', () => {
  assert.equal(resolveTextEditMode({ originalRect: { x: 0, y: 0, w: 1, h: 1 } }), 'existing-line');
  assert.equal(resolveTextEditMode({ sourceFontName: 'Helvetica' }), 'existing-line');
  assert.equal(resolveTextEditMode({}), 'new-box');
  assert.equal(resolveTextEditMode(undefined), 'new-box');
});
