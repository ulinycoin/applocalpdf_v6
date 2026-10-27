import assert from 'node:assert/strict';
import test from 'node:test';
import {
    PAGE_CARD_HEIGHT,
    PAGE_CARD_WIDTH,
    PAGE_GAP_X,
    PAGE_GAP_Y,
    PAGE_INSET,
    PAGE_STEP_X,
    PAGE_STEP_Y,
    pageGridColumns,
    pageRectInDocument,
    rectFromPoints,
    rectanglesIntersect,
} from './page-layout';

test('page slots follow the workspace grid and wrap by the effective column count', () => {
    assert.deepEqual(pageRectInDocument(0, 3), {
        x: PAGE_INSET,
        y: PAGE_INSET,
        width: PAGE_CARD_WIDTH,
        height: PAGE_CARD_HEIGHT,
    });
    assert.deepEqual(pageRectInDocument(2, 3), {
        x: PAGE_INSET + 2 * PAGE_STEP_X,
        y: PAGE_INSET,
        width: PAGE_CARD_WIDTH,
        height: PAGE_CARD_HEIGHT,
    });
    assert.equal(pageRectInDocument(3, 3).x, PAGE_INSET);
    assert.equal(pageRectInDocument(3, 3).y, PAGE_INSET + PAGE_STEP_Y);
    assert.equal(PAGE_STEP_X, PAGE_CARD_WIDTH + PAGE_GAP_X);
    assert.equal(PAGE_STEP_Y, PAGE_CARD_HEIGHT + PAGE_GAP_Y);
});

test('a workspace never reserves columns it has no pages for', () => {
    assert.equal(pageGridColumns(0, 5), 1);
    assert.equal(pageGridColumns(2, 5), 2);
    assert.equal(pageGridColumns(5, 5), 5);
    assert.equal(pageGridColumns(12, 5), 5);
    assert.equal(pageGridColumns(7, 1), 1);
});

test('marquee selection intersects by area, not by touching edges', () => {
    const page = { x: 100, y: 100, width: 200, height: 280 };
    assert.equal(rectanglesIntersect({ x: 50, y: 50, width: 100, height: 100 }, page), true);
    assert.equal(rectanglesIntersect({ x: 0, y: 0, width: 100, height: 100 }, page), false);
    assert.equal(rectanglesIntersect({ x: 0, y: 0, width: 500, height: 500 }, page), true);
    // Marquee dragged up-left: the raw corner order must be normalised first.
    const box = rectFromPoints({ x: 320, y: 400 }, { x: 120, y: 120 });
    assert.deepEqual(box, { x: 120, y: 120, width: 200, height: 280 });
    assert.equal(rectanglesIntersect(box, page), true);
});
