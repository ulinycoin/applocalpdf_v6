import assert from 'node:assert/strict';
import test from 'node:test';
import { PDFDocument } from 'pdf-lib';
import { applyStudioTextEditsToPdfBytes } from './studio-text-edit-applier';

async function createBlankPdfBytes(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.addPage([612, 792]);
  const bytes = await doc.save();
  const stable = new Uint8Array(bytes.byteLength);
  stable.set(bytes);
  return stable;
}

test('applyStudioTextEditsToPdfBytes supports advanced formatting fields', async () => {
  const sourceBytes = await createBlankPdfBytes();
  const result = await applyStudioTextEditsToPdfBytes({
    sourceBytes,
    pageIndex: 0,
    elements: [{
      id: 'txt-advanced',
      type: 'text',
      x: 0.1,
      y: 0.15,
      w: 0.6,
      h: 0.1,
      text: 'ADVANCED FORMAT',
      color: '#000000',
      fontSize: 20,
      fontFamily: 'sora',
      fontWeight: 'normal',
      fontStyle: 'normal',
      textAlign: 'left',
      lineHeight: 1.7,
      letterSpacing: 1.4,
      opacity: 1,
    }],
  });

  assert.ok(result.outputBytes.byteLength > 0);
  assert.equal(result.overflowDetected, false);
});

test('applyStudioTextEditsToPdfBytes reports overflow for constrained width content', async () => {
  const sourceBytes = await createBlankPdfBytes();
  const result = await applyStudioTextEditsToPdfBytes({
    sourceBytes,
    pageIndex: 0,
    elements: [{
      id: 'txt-overflow',
      type: 'text',
      x: 0.1,
      y: 0.2,
      w: 0.04,
      h: 0.05,
      text: 'THIS TEXT SHOULD OVERFLOW',
      color: '#000000',
      fontSize: 32,
      fontFamily: 'sora',
      fontWeight: 'normal',
      fontStyle: 'normal',
      textAlign: 'left',
      lineHeight: 1.2,
      letterSpacing: 8,
      opacity: 1,
    }],
  });

  assert.equal(result.overflowDetected, true);
});

