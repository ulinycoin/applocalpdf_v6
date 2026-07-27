import assert from 'node:assert/strict';
import test from 'node:test';
import { PDFDocument, StandardFonts } from 'pdf-lib';

import { applyStudioTextEditsToPdfBytes } from '../studio-text-edit-applier';
import { verifyRedactedPdf } from '../redact-verify/verify-service';
import type { WorkerStudioRectEditElement } from '../../../core/types/contracts';

test('whiteout removes underlying text so text_extract can pass', async () => {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText('SECRETWORD', { x: 72, y: 700, size: 14, font });
  page.drawText('Other line stays', { x: 72, y: 650, size: 14, font });
  const sourceBytes = new Uint8Array(await doc.save());

  // SECRETWORD baseline y=700 → studio top-ratio ≈ (792-714)/792 ≈ 0.098
  const whiteout: WorkerStudioRectEditElement = {
    id: 'w1',
    type: 'rect',
    x: 0.10,
    y: 0.08,
    w: 0.30,
    h: 0.05,
    fill: '#ffffff',
    stroke: 'transparent',
    strokeWidth: 0,
    opacity: 1,
  };

  const applied = await applyStudioTextEditsToPdfBytes({
    sourceBytes,
    pageIndex: 0,
    elements: [whiteout],
  });

  const verify = await verifyRedactedPdf(sourceBytes, applied.outputBytes, [whiteout], 'test');
  const textExtract = verify.checks.find((c) => c.id === 'text_extract');
  assert.equal(
    textExtract?.result,
    'pass',
    `expected text_extract pass, got ${textExtract?.result}: ${textExtract?.message}`,
  );
  assert.equal(verify.passed, true);
});
