import assert from 'node:assert/strict';
import test from 'node:test';
import type { RunnerTelemetryEvent } from '../../core/types/contracts';
import { checkDailyFileQuota, resetDailyFileQuota } from '../platform/daily-file-quota';
import { requestDailyDownloadAllowance } from './studio-paywall';

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
}

function collectingSink(): { events: RunnerTelemetryEvent[]; track: (event: RunnerTelemetryEvent) => void } {
  const events: RunnerTelemetryEvent[] = [];
  return { events, track: (event) => { events.push(event); } };
}

test('the free plan may download three files a day, and the fourth download hits the paywall', () => {
  installStorageStub();
  resetDailyFileQuota();
  const sink = collectingSink();

  assert.equal(requestDailyDownloadAllowance(sink as never, 'basic', 1), true);
  assert.equal(requestDailyDownloadAllowance(sink as never, 'basic', 1), true);
  assert.equal(requestDailyDownloadAllowance(sink as never, 'basic', 1), true);
  assert.equal(checkDailyFileQuota().used, 3);

  const denied = requestDailyDownloadAllowance(sink as never, 'basic', 1);
  assert.equal(denied, false, 'the fourth download must be refused');
  assert.equal(checkDailyFileQuota().used, 3, 'a refused download must not consume the allowance');
  assert.ok(
    sink.events.some((event) => event.type === 'UI_UPSELL_SHOWN'),
    'the refusal must raise the upsell',
  );
});

test('a batch larger than the remaining allowance is refused without spending it', () => {
  installStorageStub();
  resetDailyFileQuota();
  const sink = collectingSink();

  assert.equal(requestDailyDownloadAllowance(sink as never, 'basic', 2), true);
  assert.equal(requestDailyDownloadAllowance(sink as never, 'basic', 2), false);
  assert.equal(checkDailyFileQuota().used, 2);
});

test('Pro downloads are never counted', () => {
  installStorageStub();
  resetDailyFileQuota();
  const sink = collectingSink();

  for (let i = 0; i < 10; i += 1) {
    assert.equal(requestDailyDownloadAllowance(sink as never, 'pro', 5), true);
  }
  assert.equal(checkDailyFileQuota().used, 0);
  assert.deepEqual(sink.events, []);
});
