import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canRedoEditHistory,
  canUndoEditHistory,
  createEditHistory,
  currentEditHistoryEntry,
  pushEditHistory,
  redoEditHistory,
  undoEditHistory,
} from './edit-history-stack';

test('two pushes in one tick keep both entries reachable by undo', () => {
  // The regression: a stale cursor made the second push drop the first entry while the cursor moved
  // twice, so the committed text could never be recovered.
  const initial = createEditHistory<string>('empty');
  const first = pushEditHistory(initial, 'committed-text');
  const second = pushEditHistory(first, 'tool-element');

  assert.deepEqual(second.entries, ['empty', 'committed-text', 'tool-element']);
  assert.equal(second.index, 2);
  assert.equal(currentEditHistoryEntry(second), 'tool-element');

  const afterUndo = undoEditHistory(second);
  assert.equal(currentEditHistoryEntry(afterUndo), 'committed-text');
  assert.equal(canRedoEditHistory(afterUndo), true);
});

test('pushing after an undo drops the redo tail', () => {
  let state = createEditHistory<string>('a');
  state = pushEditHistory(state, 'b');
  state = pushEditHistory(state, 'c');
  state = undoEditHistory(state);
  state = pushEditHistory(state, 'd');

  assert.deepEqual(state.entries, ['a', 'b', 'd']);
  assert.equal(currentEditHistoryEntry(state), 'd');
  assert.equal(canRedoEditHistory(state), false);
});

test('undo and redo stop at the ends without changing the state object', () => {
  const start = createEditHistory<string>('only');
  assert.equal(undoEditHistory(start), start);
  assert.equal(canUndoEditHistory(start), false);
  assert.equal(redoEditHistory(start), start);
  assert.equal(canRedoEditHistory(start), false);

  const pushed = pushEditHistory(start, 'next');
  assert.equal(redoEditHistory(pushed), pushed);
  assert.equal(undoEditHistory(pushed).index, 0);
});
