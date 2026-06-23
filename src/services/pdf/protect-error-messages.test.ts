import assert from 'node:assert/strict';
import test from 'node:test';
import { QpdfPipelineError } from './qpdf-errors';
import { PROTECT_ALREADY_ENCRYPTED_MESSAGE, toProtectInputError } from './protect-error-messages';

test('toProtectInputError maps encrypted pdf-lib message', () => {
  const error = toProtectInputError(new Error('Input document to PDFDocument.load is encrypted'));
  assert.ok(error instanceof QpdfPipelineError);
  assert.equal(error.code, 'PROTECT_INPUT_ALREADY_ENCRYPTED');
  assert.equal(error.message, PROTECT_ALREADY_ENCRYPTED_MESSAGE);
});

test('toProtectInputError preserves existing QpdfPipelineError', () => {
  const original = new QpdfPipelineError('PROTECT_INVALID_OPTIONS', 'bad options');
  assert.equal(toProtectInputError(original), original);
});
