import assert from 'node:assert/strict';
import test from 'node:test';
import { getDeviceId, getDeviceInstanceName, readInstanceIdFromToken } from './device-identity';

function stubStorage(initial: Record<string, string> = {}): Map<string, string> {
  const store = new Map(Object.entries(initial));
  (globalThis as any).localStorage = {
    getItem: (key: string) => (store.has(key) ? String(store.get(key)) : null),
    setItem: (key: string, value: string) => void store.set(key, String(value)),
    removeItem: (key: string) => void store.delete(key),
  };
  return store;
}

function tokenWith(claims: Record<string, unknown>): string {
  const encode = (value: unknown): string =>
    Buffer.from(JSON.stringify(value)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  return `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode(claims)}.signature`;
}

test('device id is generated once and reused', () => {
  const store = stubStorage();
  const first = getDeviceId();
  assert.ok(first.length > 6);
  const second = getDeviceId();
  assert.equal(first, second);
  assert.equal(store.get('localpdf_device_id'), first);
});

test('instance name stays stable for the same device and names the platform', () => {
  stubStorage({ localpdf_device_id: 'abcdef12-3456-7890-abcd-ef1234567890' });
  Object.defineProperty(globalThis, 'navigator', {
    value: { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/141.0 Safari/537.36' },
    configurable: true,
  });
  const name = getDeviceInstanceName();
  assert.match(name, /^LocalPDF · Chrome on macOS · abcdef$/);
  assert.equal(name, getDeviceInstanceName());
});

test('falls back to a generic id when storage is unavailable', () => {
  delete (globalThis as any).localStorage;
  assert.equal(getDeviceId(), 'unknown-device');
});

test('reads the activation instance out of the token', () => {
  assert.equal(readInstanceIdFromToken(tokenWith({ ins: 'inst-42' })), 'inst-42');
  assert.equal(readInstanceIdFromToken(tokenWith({ plan: 'pro' })), '');
  assert.equal(readInstanceIdFromToken('not-a-token'), '');
  assert.equal(readInstanceIdFromToken(null), '');
  assert.equal(readInstanceIdFromToken('a.b'), '');
});
