import { test, describe, mock, beforeEach } from 'node:test';
import * as assert from 'node:assert';
import { getTrialState, startTrial, markTrialTracked, onTrialExpiry, rescheduleTrialExpiryWatch } from './trial-manager';

describe('trial-manager', () => {
  beforeEach(() => {
    mock.restoreAll();
    const storageStore = new Map<string, string>();
    global.localStorage = {
      getItem: mock.fn((key) => storageStore.get(key) || null),
      setItem: mock.fn((key, value) => { storageStore.set(key, value); }),
      removeItem: mock.fn((key) => { storageStore.delete(key); }),
      clear: mock.fn(() => { storageStore.clear(); }),
      length: 0,
      key: mock.fn(),
    };
    (global as typeof globalThis & { window: Record<string, never> }).window = {};
  });

  test('initializes with trialAvailable: true when no trial has been started', () => {
    const state = getTrialState();
    assert.strictEqual(state.isActive, false);
    assert.strictEqual(state.trialAvailable, true);
  });

  test('starts trial, making isActive true and trialAvailable false', () => {
    const state = startTrial();
    assert.strictEqual(state.isActive, true);
    assert.strictEqual(state.trialAvailable, false);
    assert.ok(state.startedAt && state.startedAt > 0);
  });

  test('markTrialTracked makes trial unavailable and inactive', () => {
    startTrial();
    markTrialTracked();
    const state = getTrialState();
    assert.strictEqual(state.isActive, false);
    assert.strictEqual(state.trialAvailable, false);
  });

  test('cannot restart a trial if it has already been used', () => {
    startTrial();
    markTrialTracked();
    const stateBefore = getTrialState();
    assert.strictEqual(stateBefore.trialAvailable, false);

    // Attempt to start again
    const stateAfter = startTrial();
    assert.strictEqual(stateAfter.isActive, false);
    assert.strictEqual(stateAfter.trialAvailable, false);
  });

  test('fires trial expiry handler when trial end time passes', () => {
    const originalNow = Date.now;
    const startedAt = 1_000_000;
    let now = startedAt;
    Date.now = () => now;

    const expiredCalls: string[] = [];
    onTrialExpiry(() => {
      expiredCalls.push('expired');
    });

    try {
      localStorage.setItem('localpdf_trial_start', String(startedAt));
      rescheduleTrialExpiryWatch();

      now = startedAt + 3 * 24 * 60 * 60 * 1000 + 1;
      rescheduleTrialExpiryWatch();

      assert.deepStrictEqual(expiredCalls, ['expired']);
      assert.strictEqual(getTrialState().isExpiredButNotTracked, true);
    } finally {
      Date.now = originalNow;
    }
  });
});
