import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CHUNK_RELOAD_COOLDOWN_MS,
  CHUNK_RELOAD_STORAGE_KEY,
  installChunkReload,
} from './chunk-reload';

class FakeTarget {
  private readonly events = new EventTarget();
  reloads = 0;

  addEventListener(type: string, listener: (event: Event) => void): void {
    this.events.addEventListener(type, listener as EventListener);
  }

  removeEventListener(type: string, listener: (event: Event) => void): void {
    this.events.removeEventListener(type, listener as EventListener);
  }

  location = { reload: () => { this.reloads += 1; } };

  firePreloadError(): { defaultPrevented: boolean } {
    const event = new Event('vite:preloadError', { cancelable: true });
    this.events.dispatchEvent(event);
    return { defaultPrevented: event.defaultPrevented };
  }
}

function memoryStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => { map.set(key, value); },
    raw: map,
  };
}

test('a failed lazy chunk reloads the tab once and marks the failure handled', () => {
  const target = new FakeTarget();
  const storage = memoryStorage();
  installChunkReload({ target, storage, now: () => 1_000 });

  const { defaultPrevented } = target.firePreloadError();

  assert.equal(target.reloads, 1);
  assert.equal(defaultPrevented, true, 'Vite must not rethrow a failure we are handling');
  assert.equal(storage.raw.get(CHUNK_RELOAD_STORAGE_KEY), '1000');
});

test('a second failure in the same page does not reload again', () => {
  const target = new FakeTarget();
  installChunkReload({ target, storage: memoryStorage(), now: () => 1_000 });

  target.firePreloadError();
  const second = target.firePreloadError();

  assert.equal(target.reloads, 1);
  assert.equal(second.defaultPrevented, false, 'the second failure has to stay visible');
});

test('a fresh page inside the cooldown does not reload', () => {
  const target = new FakeTarget();
  const storage = memoryStorage({ [CHUNK_RELOAD_STORAGE_KEY]: '1000' });
  installChunkReload({ target, storage, now: () => 1_000 + CHUNK_RELOAD_COOLDOWN_MS - 1 });

  const { defaultPrevented } = target.firePreloadError();

  assert.equal(target.reloads, 0);
  assert.equal(defaultPrevented, false);
});

test('a fresh page after the cooldown reloads again', () => {
  const target = new FakeTarget();
  const storage = memoryStorage({ [CHUNK_RELOAD_STORAGE_KEY]: '1000' });
  installChunkReload({ target, storage, now: () => 1_000 + CHUNK_RELOAD_COOLDOWN_MS });

  target.firePreloadError();

  assert.equal(target.reloads, 1);
});

test('unreadable storage cannot block the reload', () => {
  const target = new FakeTarget();
  const storage = {
    getItem: () => { throw new Error('blocked'); },
    setItem: () => { throw new Error('blocked'); },
  };
  installChunkReload({ target, storage, now: () => 1_000 });

  target.firePreloadError();

  assert.equal(target.reloads, 1);
});

test('without storage the reload still happens exactly once', () => {
  const target = new FakeTarget();
  installChunkReload({ target, storage: null, now: () => 1_000 });

  target.firePreloadError();
  target.firePreloadError();

  assert.equal(target.reloads, 1);
});

test('the uninstaller detaches the handler', () => {
  const target = new FakeTarget();
  const uninstall = installChunkReload({ target, storage: memoryStorage(), now: () => 1_000 });
  uninstall();

  target.firePreloadError();

  assert.equal(target.reloads, 0);
});
