import assert from 'node:assert/strict';
import test from 'node:test';
import { isRasterTextAvailable, rasterizeTextRun } from './text-raster';

/** 1x1 transparent PNG — enough for pdf-lib to embed. */
const TINY_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==';

class FakeOffscreenCanvas {
  static instances: FakeOffscreenCanvas[] = [];
  width: number;
  height: number;
  drawn: Array<{ text: string; x: number; y: number; color: string }> = [];
  private fontValue = '';

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    FakeOffscreenCanvas.instances.push(this);
  }

  getContext(): unknown {
    const canvas = this;
    return {
      set font(value: string) { canvas.fontValue = value; },
      get font() { return canvas.fontValue; },
      fillStyle: '#000000',
      textBaseline: 'top',
      clearRect: () => undefined,
      // 0.5em per character, so the expectation tracks the font size the module asks for.
      measureText: (text: string) => {
        const px = Number(/([\d.]+)px/u.exec(canvas.fontValue)?.[1] ?? '0');
        return { width: text.length * px * 0.5 };
      },
      fillText(this: { fillStyle: string }, text: string, x: number, y: number) {
        canvas.drawn.push({ text, x, y, color: this.fillStyle });
      },
    };
  }

  async convertToBlob(): Promise<Blob> {
    return new Blob([Buffer.from(TINY_PNG_BASE64, 'base64')], { type: 'image/png' });
  }
}

test('rasterizeTextRun paints the run and reports its size in points', async () => {
  const globalWithCanvas = globalThis as unknown as { OffscreenCanvas?: unknown };
  const original = globalWithCanvas.OffscreenCanvas;
  globalWithCanvas.OffscreenCanvas = FakeOffscreenCanvas;
  FakeOffscreenCanvas.instances = [];

  try {
    const result = await rasterizeTextRun({
      text: '日本語',
      fontSizePt: 12,
      bold: false,
      colorHex: '#ff0000',
    });

    assert.ok(result, 'expected a raster result');
    assert.ok(result.bytes.byteLength > 0);
    // 3 characters at 0.5em of 48px = 72px, plus 6px padding on both sides → 21pt at scale 4.
    assert.ok(result.widthPt > 18 && result.widthPt < 25, `widthPt=${result.widthPt}`);
    assert.ok(result.heightPt > 12 && result.heightPt < 20, `heightPt=${result.heightPt}`);

    const painted = FakeOffscreenCanvas.instances.flatMap((canvas) => canvas.drawn);
    assert.equal(painted.length, 1);
    assert.equal(painted[0]?.text, '日本語');
    assert.equal(painted[0]?.color, '#ff0000');
  } finally {
    globalWithCanvas.OffscreenCanvas = original;
  }
});

test('rasterizeTextRun reports nothing without a canvas instead of throwing', async () => {
  const globalWithCanvas = globalThis as unknown as { OffscreenCanvas?: unknown; document?: unknown };
  const originalCanvas = globalWithCanvas.OffscreenCanvas;
  const originalDocument = globalWithCanvas.document;
  delete globalWithCanvas.OffscreenCanvas;
  delete globalWithCanvas.document;

  try {
    assert.equal(isRasterTextAvailable(), false);
    assert.equal(await rasterizeTextRun({ text: '日本語', fontSizePt: 12, bold: false, colorHex: '#000000' }), null);
    assert.equal(await rasterizeTextRun({ text: '   ', fontSizePt: 12, bold: false, colorHex: '#000000' }), null);
  } finally {
    globalWithCanvas.OffscreenCanvas = originalCanvas;
    globalWithCanvas.document = originalDocument;
  }
});
