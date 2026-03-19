import { test, describe, mock, beforeEach, before } from 'node:test';
import * as assert from 'node:assert';
import { BillingService, BASIC_CONTEXT } from './billing-service';

function encodeBase64Url(buffer: ArrayBuffer | Uint8Array): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function encodeUtf8Base64Url(str: string): string {
  return encodeBase64Url(new TextEncoder().encode(str));
}

async function exportPublicKeyToPem(key: CryptoKey): Promise<string> {
  const exported = await crypto.subtle.exportKey('spki', key);
  const exportedAsString = String.fromCharCode.apply(null, Array.from(new Uint8Array(exported)));
  const exportedAsBase64 = btoa(exportedAsString);
  return `-----BEGIN PUBLIC KEY-----\n${exportedAsBase64}\n-----END PUBLIC KEY-----`;
}

describe('BillingService', () => {
  let publicKeyPem: string;
  let privateKey: CryptoKey;

  before(async () => {
    const keyPair = await crypto.subtle.generateKey(
      {
        name: 'RSASSA-PKCS1-v1_5',
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: 'SHA-256',
      },
      true,
      ['sign', 'verify']
    );
    privateKey = keyPair.privateKey;
    publicKeyPem = await exportPublicKeyToPem(keyPair.publicKey);
  });

  async function mockSignJwt(payload: unknown): Promise<string> {
    const headerStr = encodeUtf8Base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const payloadStr = encodeUtf8Base64Url(JSON.stringify(payload));
    const signedData = new TextEncoder().encode(`${headerStr}.${payloadStr}`);
    const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', privateKey, signedData);
    const signatureStr = encodeBase64Url(signature);
    return `${headerStr}.${payloadStr}.${signatureStr}`;
  }

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
  });

  test('initializes with BASIC_CONTEXT when no token is present', async () => {
    const service = new BillingService('test_storage', publicKeyPem);
    await service.initialize();
    assert.deepStrictEqual(service.getContext(), BASIC_CONTEXT);
  });

  test('drops invalid token and reverts to BASIC_CONTEXT', async () => {
    localStorage.setItem('test_storage', 'invalid.token.here');
    
    const service = new BillingService('test_storage', publicKeyPem);
    await service.initialize();
    
    // @ts-expect-error Mock type
    assert.strictEqual(localStorage.removeItem.mock.calls.length, 1);
    // @ts-expect-error Mock type
    assert.deepStrictEqual(localStorage.removeItem.mock.calls[0].arguments, ['test_storage']);
    assert.deepStrictEqual(service.getContext(), BASIC_CONTEXT);
  });

  test('verifies and tracks a valid token', async () => {
    const futureExp = Math.floor(Date.now() / 1000) + 3600;
    const token = await mockSignJwt({
      plan: 'pro',
      entitlements: ['pdf.edit', 'pdf.ocr'],
      exp: futureExp
    });

    localStorage.setItem('test_storage', token);
    
    const service = new BillingService('test_storage', publicKeyPem);
    await service.initialize();
    
    const context = service.getContext();
    assert.strictEqual(context.plan, 'pro');
    assert.deepStrictEqual(context.entitlements, ['pdf.edit', 'pdf.ocr']);
  });

  test('drops token if exp is in the past', async () => {
    const pastExp = Math.floor(Date.now() / 1000) - 3600;
    const token = await mockSignJwt({
      plan: 'pro',
      entitlements: ['pdf.edit', 'pdf.ocr'],
      exp: pastExp
    });

    localStorage.setItem('test_storage', token);
    
    const service = new BillingService('test_storage', publicKeyPem);
    await service.initialize();
    
    // @ts-expect-error Mock type
    assert.strictEqual(localStorage.removeItem.mock.calls.length, 1);
    // @ts-expect-error Mock type
    assert.deepStrictEqual(localStorage.removeItem.mock.calls[0].arguments, ['test_storage']);
    assert.deepStrictEqual(service.getContext(), BASIC_CONTEXT);
  });

  test('saveToken verifies and saves, then notifies subscribers', async () => {
    const futureExp = Math.floor(Date.now() / 1000) + 3600;
    const token = await mockSignJwt({
      plan: 'pro',
      entitlements: ['pdf.edit'],
      exp: futureExp
    });

    const service = new BillingService('test_storage', publicKeyPem);
    const listener = mock.fn();
    service.subscribe(listener);

    const result = await service.saveToken(token);
    
    assert.strictEqual(result, true);
    // @ts-expect-error Mock type
    assert.strictEqual(localStorage.setItem.mock.calls.length, 1);
    // @ts-expect-error Mock type
    assert.deepStrictEqual(localStorage.setItem.mock.calls[0].arguments, ['test_storage', token]);
    assert.strictEqual(service.getContext().plan, 'pro');
    assert.strictEqual(listener.mock.calls.length, 1);
    assert.deepStrictEqual(listener.mock.calls[0].arguments, [service.getContext()]);
  });

  test('saveToken refuses invalid token', async () => {
    // Override the mock to make it clean
    // @ts-expect-error Mock type
    localStorage.setItem.mock.resetCalls();

    const service = new BillingService('test_storage', publicKeyPem);
    const listener = mock.fn();
    service.subscribe(listener);

    const result = await service.saveToken('bad.token');
    
    assert.strictEqual(result, false);
    // @ts-expect-error Mock type
    assert.strictEqual(localStorage.setItem.mock.calls.length, 0);
    assert.deepStrictEqual(service.getContext(), BASIC_CONTEXT);
    assert.strictEqual(listener.mock.calls.length, 0);
  });
});
