import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { PDFDocument } from 'pdf-lib';
import { resolveSpanFontInfo } from './studio-text-layer-fonts';
import { extractTextLayerForPreview } from './pdf-text-layer-extractor';

async function loadFixture(...segments: string[]): Promise<Uint8Array> {
  return new Uint8Array(await readFile(join(process.cwd(), 'test', 'fixtures', 'pdfs', ...segments)));
}

test('span font info recovers the real name, weight and colour from the content stream', async () => {
  const bytes = await loadFixture('documents', 'multi-line-paragraph.pdf');
  const layer = await extractTextLayerForPreview(bytes, 1, 2);
  const pdf = await PDFDocument.load(bytes);
  const info = await resolveSpanFontInfo({ pdf, pageIndex: 0, spans: layer.spans });

  const heading = layer.spans.find((span) => span.text.includes('Multi-line'));
  const body = layer.spans.find((span) => span.text.includes('This paragraph'));
  assert.ok(heading && body, 'expected both runs');

  const headingInfo = info.get(heading.id);
  assert.equal(headingInfo?.sourceFontName, 'Helvetica-Bold');
  assert.equal(headingInfo?.sourceFontWeight, 'bold');
  assert.equal(headingInfo?.sourceFontFamily, 'sora');
  assert.equal(headingInfo?.color, '#1a1a1a');

  const bodyInfo = info.get(body.id);
  assert.equal(bodyInfo?.sourceFontName, 'Helvetica');
  assert.equal(bodyInfo?.sourceFontWeight, 'normal');
});

test('an anonymous Type3 font reports only what is knowable', async () => {
  const bytes = await loadFixture('documents', 'studio-reedit-demo.pdf');
  const layer = await extractTextLayerForPreview(bytes, 1, 2);
  const pdf = await PDFDocument.load(bytes);
  const info = await resolveSpanFontInfo({ pdf, pageIndex: 0, spans: layer.spans });

  assert.ok(layer.spans.length > 0);
  assert.ok(info.size > 0, 'colour is still recoverable');
  for (const entry of info.values()) {
    // Nothing may claim a font name or a weight for a font that has neither.
    assert.equal(entry.sourceFontName, undefined);
    assert.equal(entry.sourceFontFamily, undefined);
    assert.equal(entry.sourceFontWeight, undefined);
  }
  assert.equal([...info.values()][0]?.color, '#000000');
});

test('span font info is empty when the page has no text operators', async () => {
  const bytes = await loadFixture('scanned', 'image-only.pdf');
  const layer = await extractTextLayerForPreview(bytes, 1, 2);
  const pdf = await PDFDocument.load(bytes);
  const info = await resolveSpanFontInfo({ pdf, pageIndex: 0, spans: layer.spans });
  assert.equal(info.size, 0);
  assert.equal((await resolveSpanFontInfo({ pdf, pageIndex: 0, spans: [] })).size, 0);
});
