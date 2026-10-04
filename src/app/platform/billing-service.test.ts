import { test, describe, mock, beforeEach, before } from 'node:test';
import * as assert from 'node:assert';
import { BillingService, BASIC_CONTEXT, LOCAL_PRO_CONTEXT } from './billing-service';
import { BASIC_ENTITLEMENTS, PRO_ENTITLEMENTS } from './billing-contract';

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

  async function mockSignJwt(payload: Record<string, unknown>): Promise<string> {
    const headerStr = encodeUtf8Base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const payloadStr = encodeUtf8Base64Url(JSON.stringify(payload));
    const signedData = new TextEncoder().encode(`${headerStr}.${payloadStr}`);
    const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', privateKey, signedData);
    const signatureStr = encodeBase64Url(signature);
    return `${headerStr}.${payloadStr}.${signatureStr}`;
  }

  async function createValidToken(overrides: Record<string, unknown> = {}): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    return mockSignJwt({
      iss: 'localpdf-billing',
      aud: 'localpdf-v6',
      sub: 'license-123',
      iat: now,
      exp: now + 3600,
      plan: 'pro',
      tier: 'pro_monthly',
      entitlements: ['pdf.edit', 'pdf.ocr'],
      ...overrides,
    });
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
    // Мокаем global.fetch для предотвращения ошибок при фоновом обновлении JWT
    global.fetch = mock.fn(async (input, init) => {
      return {
        ok: true,
        json: async () => ({ success: true, token: 'mocked.new.token' }),
      } as Response;
    });
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
    const token = await createValidToken();
    localStorage.setItem('test_storage', token);
    const service = new BillingService('test_storage', publicKeyPem);
    await service.initialize();
    const context = service.getContext();
    assert.strictEqual(context.plan, 'pro');
    // The token in this fixture lists only two entitlements; the licence must still hand over every
    // tool, because tool access is not what Pro sells.
    assert.deepStrictEqual(context.entitlements, [...PRO_ENTITLEMENTS]);
    assert.ok(context.entitlements.includes('pdf.protect.encrypt'));
  });

  test('accepts a yearly pro token', async () => {
    const token = await createValidToken({ tier: 'pro_yearly' });
    const service = new BillingService('test_storage', publicKeyPem);
    const result = await service.saveToken(token);
    assert.strictEqual(result, true);
    assert.strictEqual(service.getContext().plan, 'pro');
  });

  test('falls back to default basic entitlements for basic plan token', async () => {
    const token = await createValidToken({ plan: 'basic', tier: 'free', entitlements: [] });
    const service = new BillingService('test_storage', publicKeyPem);
    const result = await service.saveToken(token);
    assert.strictEqual(result, true);
    const context = service.getContext();
    // The free plan runs every tool: the day's limit lives on downloads, not on tool access.
    assert.deepStrictEqual(context.entitlements, [...BASIC_ENTITLEMENTS]);
    assert.ok(context.entitlements.includes('pdf.ocr'));
    assert.ok(context.entitlements.includes('pdf.protect.encrypt'));
  });

  test('accepts a one-time lifetime pro token', async () => {
    const token = await createValidToken({ tier: 'pro_lifetime' });
    const service = new BillingService('test_storage', publicKeyPem);
    const result = await service.saveToken(token);
    assert.strictEqual(result, true);
    assert.strictEqual(service.getContext().plan, 'pro');
  });

  test('rejects token with mismatched tier and plan', async () => {
    const token = await createValidToken({ plan: 'basic', tier: 'pro_monthly' });
    const service = new BillingService('test_storage', publicKeyPem);
    const result = await service.saveToken(token);
    assert.strictEqual(result, false);
  });

  test('rejects token with wrong issuer', async () => {
    const token = await createValidToken({ iss: 'evil' });
    const service = new BillingService('test_storage', publicKeyPem);
    const result = await service.saveToken(token);
    assert.strictEqual(result, false);
  });

  test('rejects token if exp is in the past', async () => {
    const token = await createValidToken({ exp: Math.floor(Date.now() / 1000) - 3600 });
    localStorage.setItem('test_storage', token);
    const service = new BillingService('test_storage', publicKeyPem);
    await service.initialize();
    // @ts-expect-error Mock type
    assert.strictEqual(localStorage.removeItem.mock.calls.length, 1);
    assert.deepStrictEqual(service.getContext(), BASIC_CONTEXT);
  });

  test('saveToken verifies and saves, then notifies subscribers', async () => {
    const token = await createValidToken({ entitlements: ['pdf.edit'] });
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

  test('triggers background token refresh when token is close to expiry', async () => {
    // Создаем токен, у которого осталось менее 5 дней (например, 1 час)
    const token = await createValidToken({ exp: Math.floor(Date.now() / 1000) + 3600 });
    localStorage.setItem('test_storage', token);

    const service = new BillingService('test_storage', publicKeyPem);
    
    // Подменяем verifyToken, чтобы он принимал наш замоканный новый токен как валидный
    mock.method(service as any, 'verifyToken', async (t: string) => {
      if (t === token) {
        return { plan: 'pro' as const, entitlements: ['pdf.edit'] };
      }
      if (t === 'mocked.new.token') {
        return { plan: 'pro' as const, entitlements: ['pdf.edit', 'pdf.ocr'] };
      }
      return null;
    });

    await service.initialize();

    // Даем фоновому промису выполниться
    await new Promise(resolve => setTimeout(resolve, 10));

    // Проверяем, что fetch был вызван для обновления
    // @ts-expect-error Mock type
    assert.strictEqual(fetch.mock.calls.length, 1);
    // @ts-expect-error Mock type
    assert.strictEqual(fetch.mock.calls[0].arguments[0], '/api/billing/restore');

    // Проверяем, что токен обновился в localStorage
    assert.strictEqual(localStorage.getItem('test_storage'), 'mocked.new.token');
    assert.deepStrictEqual(service.getContext().entitlements, ['pdf.edit', 'pdf.ocr']);
  });

  test('saveToken refuses invalid token', async () => {
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

  describe('developer Pro override', () => {
    test('a production build cannot arm the override', async () => {
      const service = new BillingService('test_storage', publicKeyPem);
      await service.initialize();

      assert.strictEqual(service.isLocalProAvailable(), false);
      assert.strictEqual(service.setLocalPro(true), false);
      assert.strictEqual(service.isLocalProEnabled(), false);
      assert.deepStrictEqual(service.getContext(), BASIC_CONTEXT);
    });

    test('a pre-seeded localStorage flag does not unlock Pro when unavailable', async () => {
      localStorage.setItem('localpdf_dev_pro_override', '1');
      const service = new BillingService('test_storage', publicKeyPem);
      await service.initialize();

      assert.strictEqual(service.isLocalProEnabled(), false);
      assert.deepStrictEqual(service.getContext(), BASIC_CONTEXT);
    });

    test('a dev build grants full Pro and restores the real context when switched off', async () => {
      const service = new BillingService('test_storage', publicKeyPem, { allowLocalPro: true });
      await service.initialize();
      const listener = mock.fn();
      service.subscribe(listener);

      assert.strictEqual(service.isLocalProAvailable(), true);
      assert.strictEqual(service.setLocalPro(true), true);
      assert.strictEqual(service.getContext().plan, 'pro');
      assert.ok(service.getContext().entitlements.includes('pdf.ocr'));
      assert.ok(service.getContext().entitlements.includes('pdf.edit'));
      assert.strictEqual(listener.mock.calls.length, 1);

      assert.strictEqual(service.setLocalPro(false), false);
      assert.deepStrictEqual(service.getContext(), BASIC_CONTEXT);
      assert.strictEqual(listener.mock.calls.length, 2);
    });

    test('the override outranks a real free licence but a real Pro licence survives it', async () => {
      const token = await createValidToken({ plan: 'pro', entitlements: ['pdf.ocr'] });
      localStorage.setItem('test_storage', token);

      const service = new BillingService('test_storage', publicKeyPem, { allowLocalPro: true });
      await service.initialize();
      assert.strictEqual(service.getContext().plan, 'pro');

      service.setLocalPro(true);
      assert.deepStrictEqual(service.getContext().entitlements, LOCAL_PRO_CONTEXT.entitlements);

      // Switching the override off must fall back to the verified licence, not to Free.
      service.setLocalPro(false);
      assert.deepStrictEqual(service.getContext().entitlements, [...PRO_ENTITLEMENTS]);
    });
  });
}
);
