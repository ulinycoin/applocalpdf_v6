import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { extractEmbeddedPdfText, looksMisDecodedText } from './pdf-text-extractor';

const FIXTURES = join(process.cwd(), 'test', 'fixtures', 'pdfs');

function fixture(relativePath: string): Blob {
  return new Blob([readFileSync(join(FIXTURES, relativePath))], { type: 'application/pdf' });
}

test('a text layer is read as characters, not as shifted bytes', async () => {
  // Regression: this Chrome-printed file has subset fonts without a usable encoding, and the byte-level
  // fallback turned every character into a constant-offset shift (`LocalPDF` -> `/ R F D O 3 ' )`).
  const result = await extractEmbeddedPdfText(fixture('documents/localpdf-demo-short.pdf'));

  assert.ok(result, 'expected embedded text');
  assert.match(result.text, /LocalPDF is a browser extension/u);
  assert.match(result.text, /files? never leave your device|les never leave your device/u);
  // The subset font has no mapping for the "fi" ligature, so those two glyphs come out as NUL — a
  // handful of characters, not the whole document, and not the shifted text the fallback produced.
  const controls = (result.text.match(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/gu) ?? []).length;
  assert.ok(controls / result.text.length < 0.05, `control characters: ${controls}`);
});

test('mis-decoded text is recognised so it is never handed to the user', () => {
  const shifted = "/ R F D O 3 ' ) \u0003 L V \u0003 D \u0003 E U R Z V H U \u0003 H [ W H Q V L R Q \u0003 I R U \u0003 "
    + 'V H F X U H \u0003 3 \' ) \u0003 S U R F H V V L Q J \u0011';
  assert.equal(looksMisDecodedText(shifted), true);
});

test('ordinary text is left alone, including text with a couple of odd glyphs', () => {
  const letter = 'LocalPDF is a browser extension for secure PDF processing. All operations happen locally - your files never leave your device.';
  assert.equal(looksMisDecodedText(letter), false);

  const withLigature = 'LocalPDF is a browser extension for secure PDF processing. All operations happen locally - your \u0000 les never leave your device.';
  assert.equal(looksMisDecodedText(withLigature), false);
});

test('a short fragment is not judged on spacing alone', () => {
  assert.equal(looksMisDecodedText('a b c d'), false);
});
