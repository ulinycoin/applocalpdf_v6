import assert from 'node:assert/strict';
import test from 'node:test';
import type { RunnerTelemetryEvent } from '../../core/types/contracts';
import { FREE_DAILY_FILE_LIMIT, getDailyFileUsage, resetDailyFileQuota } from './daily-file-quota';
import {
  clearDownloadAllowance,
  downloadErrorCode,
  recordDownloadOutcome,
  refundDownloadAllowance,
  type DownloadExitContext,
} from './download-exit';

function installStorageStub(): void {
  const store = new Map<string, string>();
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, value); },
    removeItem: (key: string) => { store.delete(key); },
    clear: () => { store.clear(); },
    key: () => null,
    length: 0,
  } as unknown as Storage;
  (globalThis as unknown as { sessionStorage: Storage }).sessionStorage = {
    getItem: (key: string) => store.get(`session:${key}`) ?? null,
    setItem: (key: string, value: string) => { store.set(`session:${key}`, value); },
    removeItem: (key: string) => { store.delete(`session:${key}`); },
    clear: () => { store.clear(); },
    key: () => null,
    length: 0,
  } as unknown as Storage;
}

function context(surface: 'wizard' | 'studio', plan = 'basic'): { ctx: DownloadExitContext; events: RunnerTelemetryEvent[] } {
  const events: RunnerTelemetryEvent[] = [];
  return {
    events,
    ctx: {
      telemetry: { track: (event: RunnerTelemetryEvent) => { events.push(event); } },
      plan,
      surface,
      toolId: 'merge-pdf',
      runId: 'run-1',
    },
  };
}

function downloads(events: RunnerTelemetryEvent[]) {
  return events.filter((event): event is Extract<RunnerTelemetryEvent, { type: 'OUTPUT_DOWNLOADED' }> => event.type === 'OUTPUT_DOWNLOADED');
}

test('a free wizard download consumes the daily allowance and reports success', () => {
  installStorageStub();
  resetDailyFileQuota();
  const { ctx, events } = context('wizard');

  assert.equal(clearDownloadAllowance(ctx, 1), true);
  recordDownloadOutcome(ctx, 'success', 1, 1);

  assert.equal(getDailyFileUsage(), 1);
  assert.deepEqual(
    downloads(events).map((event) => ({ outcome: event.outcome, surface: event.surface, toolId: event.toolId, outputCount: event.outputCount, requested: event.requested })),
    [{ outcome: 'success', surface: 'wizard', toolId: 'merge-pdf', outputCount: 1, requested: 1 }],
  );
});

test('a refused attempt reports the denial with the remaining allowance and delivers nothing', () => {
  installStorageStub();
  resetDailyFileQuota();
  const { ctx, events } = context('studio');

  for (let i = 0; i < FREE_DAILY_FILE_LIMIT; i += 1) {
    assert.equal(clearDownloadAllowance(ctx, 1), true);
    recordDownloadOutcome(ctx, 'success', 1, 1);
  }

  const denied = clearDownloadAllowance(ctx, 1);

  assert.equal(denied, false);
  const reported = downloads(events);
  assert.equal(reported.length, FREE_DAILY_FILE_LIMIT + 1);
  assert.deepEqual(reported.at(-1), {
    type: 'OUTPUT_DOWNLOADED',
    flowId: reported.at(-1)?.flowId,
    runId: 'run-1',
    toolId: 'merge-pdf',
    surface: 'studio',
    outcome: 'denied',
    requested: 1,
    reason: 'daily_download_limit',
    remaining: 0,
  });
  // The denied attempt must not consume anything: the fourth call is the one that was refused.
  assert.equal(getDailyFileUsage(), FREE_DAILY_FILE_LIMIT);
  assert.equal(checkRemaining(), 0);
});

function checkRemaining(): number {
  return FREE_DAILY_FILE_LIMIT - getDailyFileUsage();
}

test('a batch larger than the remaining allowance is refused before anything is delivered', () => {
  installStorageStub();
  resetDailyFileQuota();
  const { ctx, events } = context('wizard');
  clearDownloadAllowance(ctx, 2);
  recordDownloadOutcome(ctx, 'success', 2, 2);

  const allowed = clearDownloadAllowance(ctx, 3);

  assert.equal(allowed, false);
  assert.equal(getDailyFileUsage(), 2);
  assert.equal(downloads(events).at(-1)?.outcome, 'denied');
  assert.equal(downloads(events).at(-1)?.requested, 3);
  assert.equal(downloads(events).at(-1)?.remaining, 1);
});

test('pro users skip the quota but still report the exit', () => {
  installStorageStub();
  resetDailyFileQuota();
  const { ctx, events } = context('studio', 'pro');

  assert.equal(clearDownloadAllowance(ctx, 4), true);
  recordDownloadOutcome(ctx, 'success', 4, 4);

  assert.equal(getDailyFileUsage(), 0);
  assert.equal(downloads(events).length, 1);
  assert.equal(downloads(events)[0].outputCount, 4);
});

test('a failed export reports the failure and gives the allowance back', () => {
  installStorageStub();
  resetDailyFileQuota();
  const { ctx, events } = context('wizard');

  assert.equal(clearDownloadAllowance(ctx, 1), true);
  assert.equal(getDailyFileUsage(), 1);

  recordDownloadOutcome(ctx, 'failure', 1, 0, 'blob_write_failed');
  refundDownloadAllowance(1, 0);

  assert.equal(getDailyFileUsage(), 0);
  assert.deepEqual(
    downloads(events).map((event) => ({ outcome: event.outcome, outputCount: event.outputCount, errorCode: event.errorCode })),
    [{ outcome: 'failure', outputCount: 0, errorCode: 'blob_write_failed' }],
  );
});

test('a partial delivery refunds only the files that did not leave', () => {
  installStorageStub();
  resetDailyFileQuota();
  const { ctx } = context('wizard');

  clearDownloadAllowance(ctx, 2);
  recordDownloadOutcome(ctx, 'success', 2, 1);
  refundDownloadAllowance(2, 1);

  assert.equal(getDailyFileUsage(), 1);
});

test('the denial runs the caller hook so it can react (paywall, message) exactly once', () => {
  installStorageStub();
  resetDailyFileQuota();
  const { ctx } = context('studio');
  for (let i = 0; i < FREE_DAILY_FILE_LIMIT; i += 1) {
    clearDownloadAllowance(ctx, 1);
  }

  let calls = 0;
  const allowed = clearDownloadAllowance(ctx, 1, () => { calls += 1; });

  assert.equal(allowed, false);
  assert.equal(calls, 1);
});

test('the failure code is the error class, never its message', () => {
  class QuotaStorageError extends Error {
    constructor() {
      super('localStorage quota exceeded for key localpdf_daily_files');
      this.name = 'QuotaStorageError';
    }
  }

  assert.equal(downloadErrorCode(new QuotaStorageError()), 'QuotaStorageError');
  assert.equal(downloadErrorCode(new Error('boom')), 'Error');
  assert.equal(downloadErrorCode('boom'), 'download_failed');
  assert.equal(downloadErrorCode(undefined), 'download_failed');
});
