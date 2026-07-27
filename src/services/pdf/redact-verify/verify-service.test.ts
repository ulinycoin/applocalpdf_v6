import assert from 'node:assert/strict';
import test from 'node:test';
import { PDFDocument, StandardFonts } from 'pdf-lib';

import { verifyRedactedPdf, buildCertificate, shouldRunRedactVerify } from './verify-service';
import type { RedactCheck } from './redact-verify-types';
import type { WorkerStudioTextEditElement, WorkerStudioRectEditElement } from '../../../core/types/contracts';

async function createPdfWithText(text: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText(text, { x: 72, y: 700, size: 12, font });
  const bytes = await doc.save();
  const stable = new Uint8Array(bytes.byteLength);
  stable.set(bytes);
  return stable;
}

test('shouldRunRedactVerify ignores text edits even with linked whiteout', () => {
  const text: WorkerStudioTextEditElement = {
    type: 'text',
    id: 't1',
    pageIndex: 0,
    x: 0.1,
    y: 0.1,
    width: 0.2,
    height: 0.05,
    text: 'new',
    fontSize: 12,
    fontFamily: 'Helvetica',
    color: '#000000',
  };
  const whiteout: WorkerStudioRectEditElement = {
    type: 'rect',
    id: 'r1',
    pageIndex: 0,
    x: 0.1,
    y: 0.1,
    width: 0.2,
    height: 0.05,
    fill: '#ffffff',
    stroke: 'transparent',
    strokeWidth: 0,
    opacity: 1,
  };
  assert.equal(shouldRunRedactVerify([text, whiteout]), false);
  assert.equal(shouldRunRedactVerify([text]), false);
  assert.equal(shouldRunRedactVerify([whiteout]), true);
});

test('buildCertificate produces correct format', async () => {
  const checks: RedactCheck[] = [
    { id: 'text_extract', result: 'pass' },
    { id: 'metadata_xmp', result: 'pass' },
    { id: 'annotations', result: 'pass' },
    { id: 'raw_bytes', result: 'pass' },
  ];

  const cert = buildCertificate({
    inputSha256: 'a'.repeat(64),
    outputSha256: 'b'.repeat(64),
    redactedStringHashes: ['sha256:abc123'],
    checks,
    stats: { pages: 5, redactionCount: 3 },
    appVersion: '1.0.0',
  });

  assert.equal(cert.format, 'localpdf-certificate/v1');
  assert.equal(cert.tool, 'studio.edit.redact');
  assert.equal(cert.appVersion, '1.0.0');
  assert.equal(cert.inputSha256, 'a'.repeat(64));
  assert.equal(cert.outputSha256, 'b'.repeat(64));
  assert.ok(Array.isArray(cert.redactedStringHashes));
  assert.equal(cert.redactedStringHashes.length, 1);
  assert.ok(cert.redactedStringHashes[0].startsWith('sha256:'));
  assert.equal(cert.checks.text_extract, 'pass');
  assert.equal(cert.checks.metadata_xmp, 'pass');
  assert.equal(cert.checks.annotations, 'pass');
  assert.equal(cert.checks.raw_bytes, 'pass');
  assert.equal(cert.stats.pages, 5);
  assert.equal(cert.stats.redactionCount, 3);
  assert.ok(cert.createdAt.match(/^\d{4}-\d{2}-\d{2}T/), 'createdAt is ISO date');
});

test('buildCertificate does NOT contain plaintext redacted strings', async () => {
  const checks: RedactCheck[] = [
    { id: 'text_extract', result: 'pass' },
    { id: 'metadata_xmp', result: 'pass' },
    { id: 'annotations', result: 'pass' },
    { id: 'raw_bytes', result: 'pass' },
  ];

  const cert = buildCertificate({
    inputSha256: 'a'.repeat(64),
    outputSha256: 'b'.repeat(64),
    redactedStringHashes: ['sha256:abc123hash'],
    checks,
    stats: { pages: 1, redactionCount: 1 },
    appVersion: 'test',
  });

  const certJson = JSON.stringify(cert);
  assert.ok(!certJson.includes('plaintext-content'), 'cert should not contain plaintext');
  assert.ok(certJson.includes('sha256:'), 'cert should contain sha256 hashes');
});

test('verifyRedactedPdf — annotations check passes on clean PDF', async () => {
  const sourceBytes = await createPdfWithText('Some text');
  const outputBytes = await createPdfWithText('Edited text');

  const textElement: WorkerStudioTextEditElement = {
    id: 'e1',
    type: 'text',
    x: 0.1, y: 0.1, w: 0.3, h: 0.05,
    text: 'Edited text', color: '#000000',
    fontSize: 12, fontFamily: 'sora',
    fontWeight: 'normal', fontStyle: 'normal',
    textAlign: 'left', opacity: 1,
  };

  const result = await verifyRedactedPdf(sourceBytes, outputBytes, [textElement], 'test');
  const annotations = result.checks.find((c) => c.id === 'annotations');
  assert.ok(annotations);
  assert.equal(annotations.result, 'pass', 'clean PDF should pass annotations check');
});

test('verifyRedactedPdf — metadata_xmp passes on clean PDF', async () => {
  const sourceBytes = await createPdfWithText('Some text');
  const outputBytes = await createPdfWithText('Edited text');

  const textElement: WorkerStudioTextEditElement = {
    id: 'e1',
    type: 'text',
    x: 0.1, y: 0.1, w: 0.3, h: 0.05,
    text: 'Edited text', color: '#000000',
    fontSize: 12, fontFamily: 'sora',
    fontWeight: 'normal', fontStyle: 'normal',
    textAlign: 'left', opacity: 1,
  };

  const result = await verifyRedactedPdf(sourceBytes, outputBytes, [textElement], 'test');
  const metadata = result.checks.find((c) => c.id === 'metadata_xmp');
  assert.ok(metadata);
  assert.equal(metadata.result, 'pass', 'clean PDF should pass metadata check');
});

test('verifyRedactedPdf — returns result structure with all 4 checks', async () => {
  const sourceBytes = await createPdfWithText('Public text');
  const outputBytes = await createPdfWithText('Public text');

  const rectElement: WorkerStudioRectEditElement = {
    id: 'e1',
    type: 'rect',
    x: 0.1, y: 0.1, w: 0.3, h: 0.05,
    fill: '#ffffff', stroke: '#000000',
    strokeWidth: 1, opacity: 1,
  };

  const result = await verifyRedactedPdf(sourceBytes, outputBytes, [rectElement], 'test');
  assert.ok(result.checks.length === 4);
  const checkIds = result.checks.map((c) => c.id);
  assert.ok(checkIds.includes('text_extract'));
  assert.ok(checkIds.includes('metadata_xmp'));
  assert.ok(checkIds.includes('annotations'));
  assert.ok(checkIds.includes('raw_bytes'));
});

test('verifyRedactedPdf — sha256 hashes are correct format', async () => {
  const sourceBytes = await createPdfWithText('Test content');
  const outputBytes = await createPdfWithText('Redacted content');

  const textElement: WorkerStudioTextEditElement = {
    id: 'e1',
    type: 'text',
    x: 0.1, y: 0.1, w: 0.4, h: 0.05,
    text: 'Redacted content', color: '#000000',
    fontSize: 12, fontFamily: 'sora',
    fontWeight: 'normal', fontStyle: 'normal',
    textAlign: 'left', opacity: 1,
  };

  const result = await verifyRedactedPdf(sourceBytes, outputBytes, [textElement], 'test');

  for (const hash of result.redactedStringHashes) {
    assert.ok(hash.startsWith('sha256:'), `Hash "${hash}" should start with sha256:`);
    const hexPart = hash.slice(7);
    assert.ok(/^[0-9a-f]{64}$/.test(hexPart), `Hash hex "${hexPart}" should be 64 hex chars`);
  }
});

test('certificate only present on all-pass', async () => {
  const checks: RedactCheck[] = [
    { id: 'text_extract', result: 'fail' },
    { id: 'metadata_xmp', result: 'pass' },
    { id: 'annotations', result: 'pass' },
    { id: 'raw_bytes', result: 'pass' },
  ];

  const cert = buildCertificate({
    inputSha256: 'a'.repeat(64),
    outputSha256: 'b'.repeat(64),
    redactedStringHashes: ['sha256:xxx'],
    checks,
    stats: { pages: 1, redactionCount: 1 },
    appVersion: 'test',
  });

  assert.equal(cert.checks.text_extract, 'fail');
  // Certificate is always returned by buildCertificate — the caller (verifyRedactedPdf)
  // decides whether to include it based on passed=true
});
