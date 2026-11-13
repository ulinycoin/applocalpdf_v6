import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PASSWORD_PROTECTED_MESSAGE,
  isPasswordProtectedPdfError,
  workspaceQuotaRefusal,
} from './import-guards';

const megabyte = 1024 * 1024;

test('a locked PDF is recognised by the name pdf.js gives it', () => {
  assert.equal(isPasswordProtectedPdfError(Object.assign(new Error('No password given'), { name: 'PasswordException' })), true);
  assert.equal(isPasswordProtectedPdfError(Object.assign(new Error('Incorrect Password'), { name: 'PasswordException' })), true);
});

test('an unrelated import failure is not mistaken for a locked PDF', () => {
  assert.equal(isPasswordProtectedPdfError(new Error('Invalid PDF structure.')), false);
  assert.equal(isPasswordProtectedPdfError(Object.assign(new Error('x'), { name: 'UnknownErrorException', code: 5 })), false);
  assert.equal(isPasswordProtectedPdfError(undefined), false);
});

test('the password message explains what to do instead of naming the library error', () => {
  assert.match(PASSWORD_PROTECTED_MESSAGE, /password-protected/u);
  assert.match(PASSWORD_PROTECTED_MESSAGE, /save a copy without the password/i);
  assert.doesNotMatch(PASSWORD_PROTECTED_MESSAGE, /PasswordException|No password given/u);
});

test('a file that fits the workspace is accepted without a message', () => {
  assert.equal(workspaceQuotaRefusal({ fileSize: 20 * megabyte, usedBytes: 100 * megabyte, limitBytes: 512 * megabyte }), null);
});

test('a file larger than the workspace is named by size, not by "close some documents"', () => {
  const message = workspaceQuotaRefusal({ fileSize: 535 * megabyte, usedBytes: 0, limitBytes: 512 * megabyte });
  assert.ok(message);
  assert.match(message, /535 MB/u);
  assert.match(message, /512 MB/u);
  assert.doesNotMatch(message, /already in use/u);
});

test('an occupied workspace reports both numbers', () => {
  const message = workspaceQuotaRefusal({ fileSize: 300 * megabyte, usedBytes: 250 * megabyte, limitBytes: 512 * megabyte });
  assert.ok(message);
  assert.match(message, /300 MB/u);
  assert.match(message, /250 MB already in use/u);
});

test('without a configured limit nothing is refused', () => {
  assert.equal(workspaceQuotaRefusal({ fileSize: Number.MAX_SAFE_INTEGER, usedBytes: 0 }), null);
});
