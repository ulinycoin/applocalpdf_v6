import assert from 'node:assert/strict';
import test from 'node:test';
import { measureSegments, planTextSegments } from './segmented-text';

/** Font whose coverage is exactly the characters it was given. */
function fontCovering(name: string, covered: string): { name: string; covered: string } {
  return { name, covered };
}
const canRender = (font: { covered: string }, text: string) => (
  Array.from(text).every((char) => font.covered.includes(char))
);

const cyrillic = fontCovering('cyrillic', 'Итого ');
const latin = fontCovering('latin', 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 ');

test('planTextSegments splits a sentence across the fonts that cover it', () => {
  const runs = planTextSegments({
    text: 'Итого 100 USD',
    fonts: [cyrillic, latin],
    canRender,
  });
  assert.deepEqual(
    runs.map((run) => [run.text, run.font?.name ?? null]),
    // The real Cyrillic subset contains the space but no digits, so the split lands after it.
    [['Итого ', 'cyrillic'], ['100 USD', 'latin']],
  );
});

test('planTextSegments does not switch font when the current one still covers', () => {
  // Both fonts cover the space, so switching back for it would split the tail into three runs.
  const runs = planTextSegments({
    text: 'Итого 100 USD',
    fonts: [cyrillic, latin],
    canRender,
  });
  assert.equal(runs.length, 2);
  assert.equal(runs[1]?.text, '100 USD');
});

test('planTextSegments merges adjacent graphemes of the same font', () => {
  const runs = planTextSegments({ text: 'Итого', fonts: [cyrillic], canRender });
  assert.equal(runs.length, 1);
  assert.equal(runs[0]?.text, 'Итого');
});

test('planTextSegments reports characters no font can render', () => {
  const runs = planTextSegments({ text: 'Итого日', fonts: [cyrillic, latin], canRender });
  assert.deepEqual(
    runs.map((run) => [run.text, run.font?.name ?? null]),
    [['Итого', 'cyrillic'], ['日', null]],
  );
});

test('planTextSegments keeps grapheme clusters together', () => {
  const devanagari = fontCovering('devanagari', 'हिन्दी');
  const runs = planTextSegments({ text: 'हिन्दी', fonts: [devanagari], canRender });
  assert.equal(runs.length, 1);
  assert.equal(runs[0]?.text, 'हिन्दी');
});

test('planTextSegments prefers the first font that covers a grapheme', () => {
  const preferred = fontCovering('preferred', 'abc');
  const fallback = fontCovering('fallback', 'abc');
  const runs = planTextSegments({ text: 'abc', fonts: [preferred, fallback], canRender });
  assert.equal(runs.length, 1);
  assert.equal(runs[0]?.font?.name, 'preferred');
});

test('measureSegments sums per-run widths and uses the fallback for uncovered runs', () => {
  const font = (name: string, width: number) => ({ name, width });
  const wide = font('wide', 10);
  const narrow = font('narrow', 2);
  const runs = [
    { text: 'ab', font: wide },
    { text: 'cd', font: null },
  ];
  assert.equal(measureSegments(runs, (f, text) => f.width * text.length, narrow), 24);
});
