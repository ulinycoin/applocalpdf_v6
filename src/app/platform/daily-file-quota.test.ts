import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FREE_DAILY_FILE_LIMIT,
  checkDailyFileQuota,
  consumeDailyFileQuota,
  dailyFileQuotaMessage,
  getDailyFileUsage,
  resetDailyFileQuota,
  subscribeDailyFileQuota,
} from './daily-file-quota';

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

test('daily download quota allows the free allowance and blocks the next download', () => {
  installStorageStub();
  resetDailyFileQuota();

  assert.equal(FREE_DAILY_FILE_LIMIT, 3);
  assert.equal(getDailyFileUsage(), 0);
  assert.equal(checkDailyFileQuota(3).allowed, true);

  consumeDailyFileQuota(3);
  assert.equal(getDailyFileUsage(), 3);
  assert.equal(checkDailyFileQuota(1).allowed, false);
  assert.equal(checkDailyFileQuota(1).remaining, 0);
});

test('a batch larger than the remaining allowance is refused as a whole', () => {
  installStorageStub();
  resetDailyFileQuota();

  consumeDailyFileQuota(2);
  const check = checkDailyFileQuota(2);
  assert.equal(check.allowed, false);
  assert.equal(check.remaining, 1);
  assert.match(dailyFileQuotaMessage(2), /1 download left today/);
});

test('legacy upload counters do not consume the download allowance', () => {
  installStorageStub();
  const today = new Date().toISOString().slice(0, 10);
  localStorage.setItem('localpdf_daily_files', JSON.stringify({ date: today, processed: 3, downloaded: 0 }));

  assert.equal(getDailyFileUsage(), 0);
  assert.equal(checkDailyFileQuota(3).allowed, true);

  consumeDailyFileQuota(1);
  const record = JSON.parse(localStorage.getItem('localpdf_daily_files') ?? '{}') as Record<string, unknown>;
  assert.equal(record.downloaded, 1);
});

test('yesterday counters do not leak into today', () => {
  installStorageStub();
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  localStorage.setItem('localpdf_daily_files', JSON.stringify({ date: yesterday, processed: 3, downloaded: 3 }));

  assert.equal(getDailyFileUsage(), 0);
  assert.equal(checkDailyFileQuota(3).allowed, true);
});

test('a missing localStorage never throws and never blocks', () => {
  const globalWithStorage = globalThis as unknown as { localStorage?: Storage };
  const previous = globalWithStorage.localStorage;
  delete globalWithStorage.localStorage;

  try {
    assert.equal(getDailyFileUsage(), 0);
    assert.doesNotThrow(() => consumeDailyFileQuota(5));
    assert.equal(checkDailyFileQuota(3).allowed, true);
  } finally {
    if (previous) {
      globalWithStorage.localStorage = previous;
    }
  }
});

test('the download counter is notified whenever the quota is consumed or reset', () => {
  // The pill in the chrome reads the quota once and then relies on this signal; without it the
  // number would keep saying "3 left" after a download.
  installStorageStub();
  resetDailyFileQuota();

  let notifications = 0;
  const unsubscribe = subscribeDailyFileQuota(() => { notifications += 1; });

  consumeDailyFileQuota(1);
  assert.equal(notifications, 1);
  assert.equal(checkDailyFileQuota().remaining, 2);

  consumeDailyFileQuota(0);
  assert.equal(notifications, 1, 'a no-op consume must not repaint the counter');

  resetDailyFileQuota();
  assert.equal(notifications, 2);

  unsubscribe();
  consumeDailyFileQuota(1);
  assert.equal(notifications, 2, 'unsubscribed listeners must stop hearing about the quota');
});
