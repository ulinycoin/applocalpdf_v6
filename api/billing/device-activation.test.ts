import { after, describe, test } from 'node:test';
import * as assert from 'node:assert';
import { generateKeyPairSync } from 'node:crypto';
import restoreHandler, { encryptString, signJwt } from './restore';
import handler from './deactivate';

function decodeTestPayload(token: string): any {
  const parts = token.split('.');
  return JSON.parse(Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
}

const originalEnv = {
  privateKey: process.env.JWT_PRIVATE_KEY,
  publicKey: process.env.VITE_PUBLIC_JWT_KEY,
  apiKey: process.env.LEMON_SQUEEZY_API_KEY,
  monthlyProducts: process.env.LEMON_SQUEEZY_PRO_MONTHLY_PRODUCT_IDS,
  monthlyVariants: process.env.LEMON_SQUEEZY_PRO_MONTHLY_VARIANT_IDS,
  yearlyProducts: process.env.LEMON_SQUEEZY_PRO_YEARLY_PRODUCT_IDS,
  yearlyVariants: process.env.LEMON_SQUEEZY_PRO_YEARLY_VARIANT_IDS,
  lifetimeProducts: process.env.LEMON_SQUEEZY_PRO_LIFETIME_PRODUCT_IDS,
  lifetimeVariants: process.env.LEMON_SQUEEZY_PRO_LIFETIME_VARIANT_IDS,
};

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

function fakeResponse(): any {
  const res: any = {
    statusCode: 0,
    body: null,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(payload: unknown) {
      res.body = payload;
      return res;
    },
  };
  return res;
}

describe('billing restore device activation', () => {
  test('registers the device and reports how many slots are used', async () => {
    const originalFetch = global.fetch;
    const calls: string[] = [];
    process.env.JWT_PRIVATE_KEY = privateKey;
    process.env.VITE_PUBLIC_JWT_KEY = publicKey;
    process.env.LEMON_SQUEEZY_API_KEY = 'ls_test_key';
    process.env.LEMON_SQUEEZY_PRO_LIFETIME_PRODUCT_IDS = '1371816';
    process.env.LEMON_SQUEEZY_PRO_LIFETIME_VARIANT_IDS = '2143549';

    global.fetch = async (url: any, init?: RequestInit) => {
      const href = String(url);
      calls.push(href);
      if (href.includes('/licenses/validate')) {
        return new Response(
          JSON.stringify({
            valid: true,
            license_key: { id: 1291436, activation_limit: 3, activation_usage: 1 },
            meta: { product_id: 1371816, variant_id: 2143549 },
          }),
          { status: 200 },
        );
      }
      if (href.includes('/license-key-instances')) {
        return new Response(JSON.stringify({ data: [] }), { status: 200 });
      }
      if (href.includes('/licenses/activate')) {
        const body = String(init?.body ?? '');
        assert.match(body, /instance_name=LocalPDF\+on\+Chrome/);
        return new Response(
          JSON.stringify({ activated: true, instance: { id: 'inst-1' }, license_key: { id: 1291436 } }),
          { status: 200 },
        );
      }
      throw new Error(`unexpected fetch ${href}`);
    };

    try {
      const res = fakeResponse();
      await restoreHandler(
        {
          method: 'POST',
          headers: { 'x-forwarded-for': '203.0.113.9' },
          body: { licenseKey: 'KEY-123', instanceName: 'LocalPDF on Chrome' },
        },
        res,
      );

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.instanceId, 'inst-1');
      assert.strictEqual(res.body.devicesUsed, 2);
      assert.strictEqual(res.body.deviceLimit, 3);
      assert.ok(calls.some((href) => href.includes('/licenses/activate')));

      const payload = decodeTestPayload(res.body.token);
      assert.strictEqual(payload.ins, 'inst-1');
      assert.strictEqual(payload.lki, '1291436');
      assert.strictEqual(payload.tier, 'pro_lifetime');
    } finally {
      global.fetch = originalFetch;
    }
  });

  test('reuses the instance of a device that already activated under the same name', async () => {
    const originalFetch = global.fetch;
    let activateCalls = 0;
    process.env.JWT_PRIVATE_KEY = privateKey;
    process.env.VITE_PUBLIC_JWT_KEY = publicKey;
    process.env.LEMON_SQUEEZY_API_KEY = 'ls_test_key';

    global.fetch = async (url: any) => {
      const href = String(url);
      if (href.includes('/licenses/validate')) {
        return new Response(
          JSON.stringify({
            valid: true,
            license_key: { id: 1291436, activation_limit: 3, activation_usage: 1 },
            meta: { product_id: 1371816, variant_id: 2143549 },
          }),
          { status: 200 },
        );
      }
      if (href.includes('/license-key-instances')) {
        assert.match(href, /license_key_id%5D=1291436|license_key_id\]=1291436/);
        return new Response(
          JSON.stringify({
            data: [
              { id: 'row-1', attributes: { identifier: 'inst-existing', name: 'LocalPDF on Chrome' } },
              { id: 'row-2', attributes: { identifier: 'inst-other', name: 'LocalPDF on Windows' } },
            ],
          }),
          { status: 200 },
        );
      }
      if (href.includes('/licenses/activate')) {
        activateCalls += 1;
        return new Response(JSON.stringify({ activated: true, instance: { id: 'inst-new' } }), { status: 200 });
      }
      throw new Error(`unexpected fetch ${href}`);
    };

    try {
      const res = fakeResponse();
      await restoreHandler(
        { method: 'POST', headers: {}, body: { licenseKey: 'KEY-123', instanceName: 'LocalPDF on Chrome' } },
        res,
      );

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(activateCalls, 0, 'matching device must not consume a slot');
      assert.strictEqual(res.body.instanceId, 'inst-existing');
      assert.strictEqual(res.body.devicesUsed, 1);
    } finally {
      global.fetch = originalFetch;
    }
  });

  test('does not spend another slot for a device that already holds an instance', async () => {
    const originalFetch = global.fetch;
    let activateCalls = 0;
    process.env.JWT_PRIVATE_KEY = privateKey;
    process.env.VITE_PUBLIC_JWT_KEY = publicKey;
    process.env.LEMON_SQUEEZY_API_KEY = 'ls_test_key';

    global.fetch = async (url: any) => {
      const href = String(url);
      if (href.includes('/licenses/validate')) {
        return new Response(
          JSON.stringify({
            valid: true,
            license_key: { id: 1291436, activation_limit: 3, activation_usage: 2 },
            meta: { product_id: 1371816, variant_id: 2143549 },
          }),
          { status: 200 },
        );
      }
      if (href.includes('/licenses/activate')) {
        activateCalls += 1;
        return new Response(JSON.stringify({ activated: true, instance: { id: 'inst-new' } }), { status: 200 });
      }
      throw new Error(`unexpected fetch ${href}`);
    };

    try {
      const res = fakeResponse();
      await restoreHandler(
        {
          method: 'POST',
          headers: {},
          body: { licenseKey: 'KEY-123', instanceId: 'inst-1', instanceName: 'LocalPDF on Chrome' },
        },
        res,
      );

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(activateCalls, 0);
      assert.strictEqual(res.body.instanceId, 'inst-1');
      assert.strictEqual(res.body.devicesUsed, 2);
    } finally {
      global.fetch = originalFetch;
    }
  });

  test('surfaces the activation limit instead of silently granting Pro', async () => {
    const originalFetch = global.fetch;
    process.env.JWT_PRIVATE_KEY = privateKey;
    process.env.VITE_PUBLIC_JWT_KEY = publicKey;
    process.env.LEMON_SQUEEZY_API_KEY = 'ls_test_key';

    global.fetch = async (url: any) => {
      const href = String(url);
      if (href.includes('/licenses/validate')) {
        return new Response(
          JSON.stringify({
            valid: true,
            license_key: { id: 1291436, activation_limit: 3, activation_usage: 3 },
            meta: { product_id: 1371816, variant_id: 2143549 },
          }),
          { status: 200 },
        );
      }
      if (href.includes('/licenses/activate')) {
        return new Response(
          JSON.stringify({
            activated: false,
            error: 'activation_limit_reached',
            license_key: { activation_limit: 3, activation_usage: 3 },
          }),
          { status: 400 },
        );
      }
      throw new Error(`unexpected fetch ${href}`);
    };

    try {
      const res = fakeResponse();
      await restoreHandler(
        { method: 'POST', headers: {}, body: { licenseKey: 'KEY-123', instanceName: 'Fourth device' } },
        res,
      );

      assert.strictEqual(res.statusCode, 409);
      assert.strictEqual(res.body.error, 'activation_limit_reached');
      assert.strictEqual(res.body.limit, 3);
      assert.strictEqual(res.body.usage, 3);
    } finally {
      global.fetch = originalFetch;
    }
  });

  test('still issues a token when LemonSqueezy activation is unavailable', async () => {
    const originalFetch = global.fetch;
    process.env.JWT_PRIVATE_KEY = privateKey;
    process.env.VITE_PUBLIC_JWT_KEY = publicKey;
    process.env.LEMON_SQUEEZY_API_KEY = 'ls_test_key';

    global.fetch = async (url: any) => {
      const href = String(url);
      if (href.includes('/licenses/validate')) {
        return new Response(
          JSON.stringify({
            valid: true,
            license_key: { id: 1291436, activation_limit: 3, activation_usage: 0 },
            meta: { product_id: 1371816, variant_id: 2143549 },
          }),
          { status: 200 },
        );
      }
      if (href.includes('/licenses/activate')) {
        return new Response('upstream exploded', { status: 500 });
      }
      throw new Error(`unexpected fetch ${href}`);
    };

    try {
      const res = fakeResponse();
      await restoreHandler({ method: 'POST', headers: {}, body: { licenseKey: 'KEY-123' } }, res);

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.instanceId, null);
      assert.strictEqual(res.body.devicesUsed, 0);
      const payload = decodeTestPayload(res.body.token);
      assert.strictEqual(payload.plan, 'pro');
      assert.strictEqual(payload.ins, undefined);
    } finally {
      global.fetch = originalFetch;
    }
  });
});

describe('billing deactivate', () => {
  test('frees the slot of the device that owns the token', async () => {
    const originalFetch = global.fetch;
    const deactivateBodies: string[] = [];
    process.env.JWT_PRIVATE_KEY = privateKey;
    process.env.VITE_PUBLIC_JWT_KEY = publicKey;
    process.env.LEMON_SQUEEZY_API_KEY = 'ls_test_key';

    const token = await signJwt(
      {
        iss: 'localpdf-billing',
        aud: 'localpdf-v6',
        sub: '1291436',
        plan: 'pro',
        tier: 'pro_lifetime',
        entitlements: ['pdf.merge'],
        lk: encryptString('KEY-123', privateKey),
        ins: 'inst-1',
        lki: '1291436',
        exp: Math.floor(Date.now() / 1000) + 3600,
      },
      privateKey,
    );

    global.fetch = async (url: any, init?: RequestInit) => {
      const href = String(url);
      if (href.includes('/licenses/deactivate')) {
        deactivateBodies.push(String(init?.body ?? ''));
        return new Response(
          JSON.stringify({ deactivated: true, license_key: { activation_usage: 0, activation_limit: 3 } }),
          { status: 200 },
        );
      }
      throw new Error(`unexpected fetch ${href}`);
    };

    try {
      const res = fakeResponse();
      await handler({ method: 'POST', headers: {}, body: { token } }, res);

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.wasCurrentDevice, true);
      assert.strictEqual(res.body.usage, 0);
      assert.match(deactivateBodies[0] ?? '', /instance_id=inst-1/);
      assert.match(deactivateBodies[0] ?? '', /license_key=KEY-123/);
    } finally {
      global.fetch = originalFetch;
    }
  });

  test('rejects a token that was not signed by this service', async () => {
    process.env.JWT_PRIVATE_KEY = privateKey;
    process.env.VITE_PUBLIC_JWT_KEY = publicKey;
    const res = fakeResponse();
    await handler({ method: 'POST', headers: {}, body: { token: 'not.a.token' } }, res);
    assert.strictEqual(res.statusCode, 401);
  });
});

after(() => {
  const restore = (key: keyof typeof originalEnv, envName: string) => {
    const value = originalEnv[key];
    if (value === undefined) delete process.env[envName];
    else process.env[envName] = value;
  };
  restore('privateKey', 'JWT_PRIVATE_KEY');
  restore('publicKey', 'VITE_PUBLIC_JWT_KEY');
  restore('apiKey', 'LEMON_SQUEEZY_API_KEY');
  restore('monthlyProducts', 'LEMON_SQUEEZY_PRO_MONTHLY_PRODUCT_IDS');
  restore('monthlyVariants', 'LEMON_SQUEEZY_PRO_MONTHLY_VARIANT_IDS');
  restore('yearlyProducts', 'LEMON_SQUEEZY_PRO_YEARLY_PRODUCT_IDS');
  restore('yearlyVariants', 'LEMON_SQUEEZY_PRO_YEARLY_VARIANT_IDS');
  restore('lifetimeProducts', 'LEMON_SQUEEZY_PRO_LIFETIME_PRODUCT_IDS');
  restore('lifetimeVariants', 'LEMON_SQUEEZY_PRO_LIFETIME_VARIANT_IDS');
});
