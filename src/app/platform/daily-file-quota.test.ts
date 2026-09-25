import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FREE_DAILY_FILE_LIMIT,
  checkDailyFileQuota,
  consumeDailyFileQuota,
  dailyFileQuotaMessage,
  getDailyFileUsage,
  resetDailyFileQuota,
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

test('daily file quota allows the free allowance and blocks the next file', () => {
  installStorageStub();
  resetDailyFileQuota();

  assert.equal(FREE_DAILY_FILE_LIMIT, 3);
  assert.equal(getDailyFileUsage('processed'), 0);
  assert.equal(checkDailyFileQuota('processed', 3).allowed, true);

  consumeDailyFileQuota('processed', 3);
  assert.equal(getDailyFileUsage('processed'), 3);
  assert.equal(checkDailyFileQuota('processed', 1).allowed, false);
  assert.equal(checkDailyFileQuota('processed', 1).remaining, 0);
});

test('processed and downloaded allowances are counted separately', () => {
  installStorageStub();
  resetDailyFileQuota();

  consumeDailyFileQuota('processed', 3);
  assert.equal(getDailyFileUsage('processed'), 3);
  assert.equal(getDailyFileUsage('downloaded'), 0);
  assert.equal(checkDailyFileQuota('downloaded', 3).allowed, true);

  consumeDailyFileQuota('downloaded', 1);
  assert.equal(getDailyFileUsage('downloaded'), 1);
});

test('a batch larger than the remaining allowance is refused as a whole', () => {
  installStorageStub();
  resetDailyFileQuota();

  consumeDailyFileQuota('processed', 2);
  const check = checkDailyFileQuota('processed', 2);
  assert.equal(check.allowed, false);
  assert.equal(check.remaining, 1);
  assert.match(dailyFileQuotaMessage('processed', 2), /1 file left today/);
});

test('yesterday counters do not leak into today', () => {
  installStorageStub();
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  localStorage.setItem('localpdf_daily_files', JSON.stringify({ date: yesterday, processed: 3, downloaded: 3 }));

  assert.equal(getDailyFileUsage('processed'), 0);
  assert.equal(checkDailyFileQuota('downloaded', 3).allowed, true);
});

test('a missing localStorage never throws and never blocks', () => {
  const globalWithStorage = globalThis as unknown as { localStorage?: Storage };
  const previous = globalWithStorage.localStorage;
  delete globalWithStorage.localStorage;

  try {
    assert.equal(getDailyFileUsage('processed'), 0);
    assert.doesNotThrow(() => consumeDailyFileQuota('processed', 5));
    assert.equal(checkDailyFileQuota('processed', 3).allowed, true);
  } finally {
    if (previous) {
      globalWithStorage.localStorage = previous;
    }
  }
});
