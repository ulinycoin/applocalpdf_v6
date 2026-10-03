/**
 * Undo stack for the Studio canvas.
 *
 * Entries and cursor are one value so a push is atomic. They used to be two `useState` values, and
 * two pushes in a single tick (committing the in-place text editor and then a tool dropping its own
 * element) both sliced from the same stale cursor: the first entry was dropped while the cursor
 * advanced twice, leaving it off the end of the stack — the committed text could not be reached by
 * undo and redo was blocked.
 */
export interface EditHistoryState<T> {
  entries: T[];
  index: number;
}

export function createEditHistory<T>(initial: T): EditHistoryState<T> {
  return { entries: [initial], index: 0 };
}

export function pushEditHistory<T>(state: EditHistoryState<T>, entry: T): EditHistoryState<T> {
  const entries = [...state.entries.slice(0, state.index + 1), entry];
  return { entries, index: entries.length - 1 };
}

export function currentEditHistoryEntry<T>(state: EditHistoryState<T>): T | undefined {
  return state.entries[state.index];
}

export function undoEditHistory<T>(state: EditHistoryState<T>): EditHistoryState<T> {
  return state.index <= 0 ? state : { ...state, index: state.index - 1 };
}

export function redoEditHistory<T>(state: EditHistoryState<T>): EditHistoryState<T> {
  return state.index >= state.entries.length - 1 ? state : { ...state, index: state.index + 1 };
}

export function canUndoEditHistory<T>(state: EditHistoryState<T>): boolean {
  return state.index > 0;
}

export function canRedoEditHistory<T>(state: EditHistoryState<T>): boolean {
  return state.index < state.entries.length - 1;
}
