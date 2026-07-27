import assert from 'node:assert/strict';
import test from 'node:test';
import {
  mergeRedactVerifyStates,
  parseWorkerRedactVerify,
} from './redact-verify-ui';

test('parseWorkerRedactVerify maps check strings and labels', () => {
  const state = parseWorkerRedactVerify({
    passed: true,
    checks: ['text_extract:pass', 'metadata_xmp:pass', 'annotations:skip', 'raw_bytes:pass'],
    certificateJson: '{"format":"localpdf-certificate/v1"}',
  }, 'run-1');

  assert.equal(state.runId, 'run-1');
  assert.equal(state.passed, true);
  assert.equal(state.checks.length, 4);
  assert.equal(state.checks[0]?.label, 'Text extract');
  assert.equal(state.checks[2]?.result, 'skip');
  assert.ok(state.certificateJson?.includes('localpdf-certificate'));
});

test('parseWorkerRedactVerify keeps failed status from worker payload', () => {
  const state = parseWorkerRedactVerify({
    passed: false,
    checks: ['error:verify_crashed'],
  }, 'run-2');

  assert.equal(state.passed, false);
  assert.equal(state.checks[0]?.id, 'error');
  assert.equal(state.checks[0]?.result, 'error');
});

test('mergeRedactVerifyStates prefers failed over passed', () => {
  const passed = parseWorkerRedactVerify({
    passed: true,
    checks: ['text_extract:pass'],
  }, 'a');
  const failed = parseWorkerRedactVerify({
    passed: false,
    checks: ['raw_bytes:fail'],
  }, 'b');

  assert.equal(mergeRedactVerifyStates(passed, failed).passed, false);
  assert.equal(mergeRedactVerifyStates(failed, passed).passed, false);
});
