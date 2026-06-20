import assert from 'node:assert/strict';
import test from 'node:test';
import { moveTextWithBackground, resizeTextWithBackground } from './text-element-layout';
import type { EditElement } from './editor-types';

const baseElements: EditElement[] = [
  {
    id: 'text-1_bg',
    type: 'rect',
    x: 0.096,
    y: 0.199,
    w: 0.208,
    h: 0.044,
    fill: '#ffffff',
    stroke: 'transparent',
    strokeWidth: 0,
    opacity: 1,
  },
  {
    id: 'text-1',
    type: 'text',
    x: 0.1,
    y: 0.2,
    w: 0.2,
    h: 0.04,
    text: 'Hello',
    color: '#000000',
    fontSize: 18,
    fontFamily: 'sora',
    fontWeight: 'normal',
    fontStyle: 'normal',
    textAlign: 'left',
    lineHeight: 1.2,
    letterSpacing: 0,
    opacity: 1,
  },
];

test('moveTextWithBackground moves linked whiteout rect', () => {
  const next = moveTextWithBackground(baseElements, 'text-1', 0.3, 0.35);
  const text = next.find((item) => item.id === 'text-1');
  const bg = next.find((item) => item.id === 'text-1_bg');
  assert.equal(text?.type === 'text' ? text.x : null, 0.3);
  assert.equal(text?.type === 'text' ? text.y : null, 0.35);
  assert.equal(bg?.type === 'rect' ? bg.x : null, 0.296);
  assert.equal(bg?.type === 'rect' ? bg.y : null, 0.349);
});

test('resizeTextWithBackground scales linked whiteout rect', () => {
  const next = resizeTextWithBackground(baseElements, 'text-1', { w: 0.3, h: 0.06, fontSize: 24 });
  const text = next.find((item) => item.id === 'text-1');
  const bg = next.find((item) => item.id === 'text-1_bg');
  assert.equal(text?.type === 'text' ? text.w : null, 0.3);
  assert.ok(Math.abs((bg?.type === 'rect' ? bg.w : 0) - 0.308) < 0.001);
  assert.ok(Math.abs((bg?.type === 'rect' ? bg.h : 0) - 0.064) < 0.001);
});
