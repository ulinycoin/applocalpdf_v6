import assert from 'node:assert/strict';
import test from 'node:test';
import { PDFDocument, StandardFonts, degrees, type PDFPage } from 'pdf-lib';
import { normalizeRotation, resolvePageGeometry } from './page-rotation';

async function rotatedPage(rotation: number): Promise<PDFPage> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  page.setRotation(degrees(rotation));
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText('ANCHOR', { x: 100, y: 700, size: 20, font });
  return page;
}

test('normalizeRotation snaps to the four supported angles', () => {
  assert.equal(normalizeRotation(0), 0);
  assert.equal(normalizeRotation(90), 90);
  assert.equal(normalizeRotation(450), 90);
  assert.equal(normalizeRotation(-90), 270);
  assert.equal(normalizeRotation(undefined), 0);
  assert.equal(normalizeRotation(37), 0);
});

test('display size follows the page rotation', async () => {
  const upright = resolvePageGeometry(await rotatedPage(0));
  assert.equal(upright.displayWidth, 612);
  assert.equal(upright.displayHeight, 792);
  assert.equal(upright.mediaWidth, 612);
  assert.equal(upright.mediaHeight, 792);

  const quarter = resolvePageGeometry(await rotatedPage(90));
  assert.equal(quarter.displayWidth, 792);
  assert.equal(quarter.displayHeight, 612);
  assert.equal(quarter.mediaWidth, 612);
  assert.equal(quarter.mediaHeight, 792);
});

test('toUserPoint inverts the pdf.js viewport mapping of a rotated page', async () => {
  // Measured with pdf.js: the text drawn at user (100, 700) sits at display ratios
  // x = 0.884, y = 0.163 on a /Rotate 90 page and x = 0.116, y = 0.837 on /Rotate 270.
  const quarter = resolvePageGeometry(await rotatedPage(90));
  const point = quarter.toUserPoint(700 / 792, 100 / 612);
  assert.ok(Math.abs(point.x - 100) < 0.01, `x=${point.x}`);
  assert.ok(Math.abs(point.y - 700) < 0.01, `y=${point.y}`);

  const threeQuarters = resolvePageGeometry(await rotatedPage(270));
  const back = threeQuarters.toUserPoint(92 / 792, 512 / 612);
  assert.ok(Math.abs(back.x - 100) < 0.01, `x=${back.x}`);
  assert.ok(Math.abs(back.y - 700) < 0.01, `y=${back.y}`);

  const half = resolvePageGeometry(await rotatedPage(180));
  const flipped = half.toUserPoint(512 / 612, 700 / 792);
  assert.ok(Math.abs(flipped.x - 100) < 0.01, `x=${flipped.x}`);
  assert.ok(Math.abs(flipped.y - 700) < 0.01, `y=${flipped.y}`);

  const upright = resolvePageGeometry(await rotatedPage(0));
  const same = upright.toUserPoint(100 / 612, 92 / 792);
  assert.ok(Math.abs(same.x - 100) < 0.01);
  assert.ok(Math.abs(same.y - 700) < 0.01);
});

test('toUserRect keeps an axis-aligned display rect axis-aligned', async () => {
  const quarter = resolvePageGeometry(await rotatedPage(90));
  const rect = quarter.toUserRect({ x: 0.1, y: 0.2, w: 0.3, h: 0.05 });
  // display x = 0.1 * 792 = 79.2, width = 237.6; display y = 0.2 * 612 = 122.4, height = 30.6
  assert.ok(Math.abs(rect.x - 122.4) < 0.01, `x=${rect.x}`);
  assert.ok(Math.abs(rect.y - 79.2) < 0.01, `y=${rect.y}`);
  assert.ok(Math.abs(rect.w - 30.6) < 0.01, `w=${rect.w}`);
  assert.ok(Math.abs(rect.h - 237.6) < 0.01, `h=${rect.h}`);
});

test('toUserRatiosTopDown returns a top-down ratio rect in user space', async () => {
  const quarter = resolvePageGeometry(await rotatedPage(90));
  const ratios = quarter.toUserRatiosTopDown({ x: 0.1, y: 0.2, w: 0.3, h: 0.05 });
  // user rect x=122.4 w=30.6 on a 612-wide box; y (bottom-up) 79.2 h=237.6 on a 792-high box.
  assert.ok(Math.abs(ratios.x - 122.4 / 612) < 0.001, `x=${ratios.x}`);
  assert.ok(Math.abs(ratios.w - 30.6 / 612) < 0.001, `w=${ratios.w}`);
  assert.ok(Math.abs(ratios.y - (1 - (79.2 + 237.6) / 792)) < 0.001, `y=${ratios.y}`);
  assert.ok(Math.abs(ratios.h - 237.6 / 792) < 0.001, `h=${ratios.h}`);
});
