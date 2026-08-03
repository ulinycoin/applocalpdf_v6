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

  global.fetch = async (_url: string | URL, init?: RequestInit) => {
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
