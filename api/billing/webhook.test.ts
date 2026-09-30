import assert from 'node:assert/strict';
import test from 'node:test';
import { createHmac } from 'node:crypto';
import { handleLemonSqueezyWebhook } from './webhook';

const WEBHOOK_SECRET = 'test-webhook-secret';

function signBody(body: string): string {
  return createHmac('sha256', WEBHOOK_SECRET).update(body).digest('hex');
}

test('handleLemonSqueezyWebhook rejects invalid signature', async () => {
  const body = Buffer.from('{"meta":{"event_name":"order_created"}}');
  const result = await handleLemonSqueezyWebhook(body, 'bad-signature', WEBHOOK_SECRET);
  assert.equal(result.status, 401);
});

test('handleLemonSqueezyWebhook ignores non-purchase events', async () => {
  const payload = JSON.stringify({ meta: { event_name: 'subscription_updated' } });
  const body = Buffer.from(payload);
  const result = await handleLemonSqueezyWebhook(body, signBody(payload), WEBHOOK_SECRET);
  assert.equal(result.status, 200);
  assert.equal(result.body.ignored, true);
});

test('handleLemonSqueezyWebhook maps order_created to purchase_completed capture', async () => {
  const originalFetch = global.fetch;
  const calls: Array<{ event: string; distinctId: string }> = [];

  process.env.LEMON_SQUEEZY_PRO_MONTHLY_PRODUCT_IDS = '917519';
  process.env.LEMON_SQUEEZY_PRO_MONTHLY_VARIANT_IDS = '1442622';
  process.env.PUBLIC_POSTHOG_KEY = 'phc_test_key';

  global.fetch = async (_url: any, init?: RequestInit) => {
    const parsed = JSON.parse(String(init?.body ?? '{}')) as { event: string; distinct_id: string };
    calls.push({ event: parsed.event, distinctId: parsed.distinct_id });
    return new Response('{}', { status: 200 });
  };

  try {
    const payload = JSON.stringify({
      meta: {
        event_name: 'order_created',
        custom_data: { distinct_id: 'ph-user-1' },
      },
      data: {
        id: 'order-42',
        attributes: {
          total: 399,
          currency: 'USD',
          user_email: 'buyer@example.com',
          first_order_item: {
            product_id: 917519,
            variant_id: 1442622,
          },
        },
      },
    });
    const body = Buffer.from(payload);
    const result = await handleLemonSqueezyWebhook(body, signBody(payload), WEBHOOK_SECRET);

    assert.equal(result.status, 200);
    assert.equal(result.body.ok, true);
    assert.equal(result.body.tier, 'pro_monthly');
    assert.deepEqual(calls.map((item) => item.event), ['purchase_completed']);
    assert.equal(calls[0]?.distinctId, 'ph-user-1');
  } finally {
    global.fetch = originalFetch;
  }
});

test('handleLemonSqueezyWebhook attributes one-time lifetime purchases', async () => {
  const originalFetch = global.fetch;
  const originalLifetimeProducts = process.env.LEMON_SQUEEZY_PRO_LIFETIME_PRODUCT_IDS;
  const originalLifetimeVariants = process.env.LEMON_SQUEEZY_PRO_LIFETIME_VARIANT_IDS;
  const captured: Array<{ properties: Record<string, unknown> }> = [];

  process.env.LEMON_SQUEEZY_PRO_MONTHLY_PRODUCT_IDS = '917519';
  process.env.LEMON_SQUEEZY_PRO_MONTHLY_VARIANT_IDS = '1442622';
  process.env.PUBLIC_POSTHOG_KEY = 'phc_test_key';
  delete process.env.LEMON_SQUEEZY_PRO_LIFETIME_PRODUCT_IDS;
  delete process.env.LEMON_SQUEEZY_PRO_LIFETIME_VARIANT_IDS;

  global.fetch = async (_url: any, init?: RequestInit) => {
    captured.push(JSON.parse(String(init?.body ?? '{}')) as { properties: Record<string, unknown> });
    return new Response('{}', { status: 200 });
  };

  try {
    const payload = JSON.stringify({
      meta: {
        event_name: 'order_created',
        custom_data: { distinct_id: 'ph-user-lifetime' },
      },
      data: {
        id: 'order-lifetime-1',
        attributes: {
          total: 1900,
          currency: 'USD',
          user_email: 'lifetime@example.com',
          first_order_item: {
            product_id: 1371816,
            variant_id: 2143549,
          },
        },
      },
    });
    const body = Buffer.from(payload);
    const result = await handleLemonSqueezyWebhook(body, signBody(payload), WEBHOOK_SECRET);

    assert.equal(result.status, 200);
    assert.equal(result.body.ok, true);
    assert.equal(result.body.tier, 'pro_lifetime');
    assert.equal(captured.length, 1);
    assert.equal(captured[0]?.properties.tier, 'pro_lifetime');
    assert.equal(captured[0]?.properties.variant, 'lifetime');
    assert.equal(captured[0]?.properties.amount, 19);
  } finally {
    global.fetch = originalFetch;
    if (originalLifetimeProducts === undefined) {
      delete process.env.LEMON_SQUEEZY_PRO_LIFETIME_PRODUCT_IDS;
    } else {
      process.env.LEMON_SQUEEZY_PRO_LIFETIME_PRODUCT_IDS = originalLifetimeProducts;
    }
    if (originalLifetimeVariants === undefined) {
      delete process.env.LEMON_SQUEEZY_PRO_LIFETIME_VARIANT_IDS;
    } else {
      process.env.LEMON_SQUEEZY_PRO_LIFETIME_VARIANT_IDS = originalLifetimeVariants;
    }
  }
});

test('handleLemonSqueezyWebhook maps a diagnostic order without writing it to the revenue numbers', async () => {
  const originalFetch = global.fetch;
  const seen: string[] = [];
  process.env.LEMON_SQUEEZY_PRO_LIFETIME_PRODUCT_IDS = '1371816';
  process.env.LEMON_SQUEEZY_PRO_LIFETIME_VARIANT_IDS = '2143549';
  process.env.PUBLIC_POSTHOG_KEY = 'phc_test_key';

  global.fetch = async (url: any) => {
    seen.push(String(url));
    return new Response('{}', { status: 200 });
  };

  try {
    const payload = JSON.stringify({
      meta: { event_name: 'order_created', custom_data: { distinct_id: 'diag:smoke', diagnostic: true } },
      data: {
        id: 'diag-0002',
        attributes: {
          total: 1900,
          currency: 'USD',
          user_email: 'diag@localpdf.online',
          first_order_item: { product_id: 1371816, variant_id: 2143549 },
        },
      },
    });
    const body = Buffer.from(payload);
    const result = await handleLemonSqueezyWebhook(body, signBody(payload), WEBHOOK_SECRET);

    assert.equal(result.status, 200);
    assert.equal(result.body.diagnostic, true);
    // The mapping itself must still be proven by a smoke test.
    assert.equal(result.body.tier, 'pro_lifetime');
    assert.equal(seen.length, 0, 'diagnostic orders must not reach PostHog');
  } finally {
    global.fetch = originalFetch;
  }
});

/**
 * Regression: renewals arrive as subscription-invoice objects with no product/variant ids. They used to
 * fall through `mapProductVariantToTier('', '')` and be answered with `ignored:true`, which LemonSqueezy
 * reads as a successful delivery — the money never reached PostHog and was never retried.
 */
test('handleLemonSqueezyWebhook attributes subscription renewals from the invoice payload', async () => {
  const originalFetch = global.fetch;
  const originalApiKey = process.env.LEMON_SQUEEZY_API_KEY;
  const originalMonthlyProducts = process.env.LEMON_SQUEEZY_PRO_MONTHLY_PRODUCT_IDS;
  const originalMonthlyVariants = process.env.LEMON_SQUEEZY_PRO_MONTHLY_VARIANT_IDS;
  const seen: Array<{ url: string; body: any }> = [];

  process.env.LEMON_SQUEEZY_API_KEY = 'ls_test_key';
  process.env.LEMON_SQUEEZY_PRO_MONTHLY_PRODUCT_IDS = '917519';
  process.env.LEMON_SQUEEZY_PRO_MONTHLY_VARIANT_IDS = '1442622';
  process.env.PUBLIC_POSTHOG_KEY = 'phc_test_key';

  global.fetch = async (url: any, init?: RequestInit) => {
    const href = String(url);
    seen.push({ url: href, body: JSON.parse(String(init?.body ?? '{}')) });
    if (href.includes('/v1/subscriptions/2232410')) {
      return new Response(
        JSON.stringify({ data: { attributes: { product_id: 917519, variant_id: 1442622 } } }),
        { status: 200 },
      );
    }
    return new Response('{}', { status: 200 });
  };

  try {
    const payload = JSON.stringify({
      meta: { event_name: 'subscription_payment_success' },
      data: {
        type: 'subscription-invoices',
        id: '8375981',
        attributes: {
          subscription_id: 2232410,
          billing_reason: 'renewal',
          total: 487,
          currency: 'USD',
          user_email: 'subscriber@example.com',
        },
      },
    });
    const body = Buffer.from(payload);
    const result = await handleLemonSqueezyWebhook(body, signBody(payload), WEBHOOK_SECRET);

    assert.equal(result.status, 200);
    assert.equal(result.body.ok, true);
    assert.equal(result.body.tier, 'pro_monthly');

    const capture = seen.find((call) => call.url.includes('/capture/'));
    assert.ok(capture, 'renewal must reach PostHog');
    assert.equal(capture?.body.event, 'purchase_completed');
    assert.equal(capture?.body.distinct_id, 'email:subscriber@example.com');
    assert.equal(capture?.body.properties.tier, 'pro_monthly');
    assert.equal(capture?.body.properties.variant, 'monthly');
    assert.equal(capture?.body.properties.subscription_id, '2232410');
    assert.equal(capture?.body.properties.billing_reason, 'renewal');
    assert.equal(capture?.body.properties.amount, 4.87);
    assert.equal(capture?.body.properties.variant_resolved, true);
  } finally {
    global.fetch = originalFetch;
    if (originalApiKey === undefined) delete process.env.LEMON_SQUEEZY_API_KEY;
    else process.env.LEMON_SQUEEZY_API_KEY = originalApiKey;
    if (originalMonthlyProducts === undefined) delete process.env.LEMON_SQUEEZY_PRO_MONTHLY_PRODUCT_IDS;
    else process.env.LEMON_SQUEEZY_PRO_MONTHLY_PRODUCT_IDS = originalMonthlyProducts;
    if (originalMonthlyVariants === undefined) delete process.env.LEMON_SQUEEZY_PRO_MONTHLY_VARIANT_IDS;
    else process.env.LEMON_SQUEEZY_PRO_MONTHLY_VARIANT_IDS = originalMonthlyVariants;
  }
});

test('handleLemonSqueezyWebhook still counts a renewal when the variant cannot be resolved', async () => {
  const originalFetch = global.fetch;
  const originalApiKey = process.env.LEMON_SQUEEZY_API_KEY;
  const seen: Array<{ url: string; body: any }> = [];

  delete process.env.LEMON_SQUEEZY_API_KEY;
  process.env.PUBLIC_POSTHOG_KEY = 'phc_test_key';

  global.fetch = async (url: any, init?: RequestInit) => {
    seen.push({ url: String(url), body: JSON.parse(String(init?.body ?? '{}')) });
    return new Response('{}', { status: 200 });
  };

  try {
    const payload = JSON.stringify({
      meta: { event_name: 'subscription_payment_success' },
      data: {
        type: 'subscription-invoices',
        id: '7811583',
        attributes: {
          subscription_id: 2232410,
          billing_reason: 'renewal',
          total: 487,
          currency: 'USD',
          user_email: 'subscriber@example.com',
        },
      },
    });
    const body = Buffer.from(payload);
    const result = await handleLemonSqueezyWebhook(body, signBody(payload), WEBHOOK_SECRET);

    assert.equal(result.status, 200);
    assert.equal(result.body.tier, 'pro_subscription');
    const capture = seen.find((call) => call.url.includes('/capture/'));
    assert.ok(capture, 'unknown variant must not drop the payment');
    assert.equal(capture?.body.properties.variant, 'subscription');
    assert.equal(capture?.body.properties.variant_resolved, false);
  } finally {
    global.fetch = originalFetch;
    if (originalApiKey === undefined) delete process.env.LEMON_SQUEEZY_API_KEY;
    else process.env.LEMON_SQUEEZY_API_KEY = originalApiKey;
  }
});
