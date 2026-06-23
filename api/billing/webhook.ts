import { createHmac, timingSafeEqual } from 'node:crypto';
import { mapProductVariantToTier } from './catalog';
import { capturePostHogEvent } from './posthog-capture';

const PURCHASE_EVENTS = new Set([
  'order_created',
  'subscription_created',
  'subscription_payment_success',
]);

function jsonResponse(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function verifySignature(rawBody: Buffer, signatureHeader: string | string[] | undefined, secret: string): boolean {
  const signature = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader;
  if (!signature?.trim()) {
    return false;
  }

  const digest = createHmac('sha256', secret).update(rawBody).digest('hex');
  const provided = signature.trim().toLowerCase();
  const expected = digest.toLowerCase();

  if (provided.length !== expected.length) {
    return false;
  }

  return timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
}

function readCustomData(payload: any): Record<string, unknown> {
  const fromMeta = payload?.meta?.custom_data;
  const fromAttributes = payload?.data?.attributes?.custom_data;
  const fromFirstItem = payload?.data?.attributes?.first_order_item?.custom_data;

  const merged = {
    ...(typeof fromMeta === 'object' && fromMeta ? fromMeta : {}),
    ...(typeof fromAttributes === 'object' && fromAttributes ? fromAttributes : {}),
    ...(typeof fromFirstItem === 'object' && fromFirstItem ? fromFirstItem : {}),
  };

  return merged;
}

function extractOrderContext(payload: any): {
  orderId: string;
  productId: string;
  variantId: string;
  totalCents: number;
  currency: string;
  email: string;
  distinctId: string | null;
  eventName: string;
} | null {
  const eventName = String(payload?.meta?.event_name ?? '');
  if (!PURCHASE_EVENTS.has(eventName)) {
    return null;
  }

  const attributes = payload?.data?.attributes ?? {};
  const firstOrderItem = attributes.first_order_item ?? {};
  const orderId = String(payload?.data?.id ?? attributes.identifier ?? '');
  if (!orderId) {
    return null;
  }

  const productId = String(firstOrderItem.product_id ?? attributes.product_id ?? '');
  const variantId = String(firstOrderItem.variant_id ?? attributes.variant_id ?? '');
  const totalCents = Number(attributes.total ?? attributes.subtotal ?? 0);
  const currency = String(attributes.currency ?? 'USD').toUpperCase();
  const email = String(attributes.user_email ?? attributes.customer_email ?? '').trim();
  const customData = readCustomData(payload);
  const distinctIdRaw = customData.distinct_id ?? customData.distinctId;
  const distinctId = typeof distinctIdRaw === 'string' && distinctIdRaw.trim() ? distinctIdRaw.trim() : null;

  return {
    orderId,
    productId,
    variantId,
    totalCents: Number.isFinite(totalCents) ? totalCents : 0,
    currency,
    email,
    distinctId,
    eventName,
  };
}

export async function handleLemonSqueezyWebhook(
  rawBody: Buffer,
  signatureHeader: string | string[] | undefined,
  secret: string,
): Promise<{ status: number; body: Record<string, unknown> }> {
  if (!verifySignature(rawBody, signatureHeader, secret)) {
    return { status: 401, body: { error: 'Invalid webhook signature' } };
  }

  let payload: any;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return { status: 400, body: { error: 'Invalid JSON payload' } };
  }

  const order = extractOrderContext(payload);
  if (!order) {
    return { status: 200, body: { ok: true, ignored: true } };
  }

  const tier = mapProductVariantToTier(order.productId, order.variantId);
  if (!tier) {
    console.warn('[billing/webhook] Unmapped product', order.productId, order.variantId);
    return { status: 200, body: { ok: true, ignored: true, reason: 'unmapped_product' } };
  }

  const distinctId = order.distinctId ?? (order.email ? `email:${order.email}` : `order:${order.orderId}`);
  const amount = order.totalCents > 0 ? order.totalCents / 100 : undefined;
  const variant = tier === 'pro_yearly' ? 'yearly' : 'monthly';

  const captured = await capturePostHogEvent({
    event: 'purchase_completed',
    distinctId,
    uuid: `ls-order-${order.orderId}`,
    properties: {
      source: 'lemonsqueezy_webhook',
      ls_event: order.eventName,
      order_id: order.orderId,
      product_id: order.productId,
      variant_id: order.variantId,
      plan: 'pro',
      tier,
      variant,
      amount,
      currency: order.currency,
      email: order.email || undefined,
    },
  });

  await capturePostHogEvent({
    event: 'trial_convert',
    distinctId,
    uuid: `ls-trial-convert-${order.orderId}`,
    properties: {
      source: 'lemonsqueezy_webhook',
      order_id: order.orderId,
      plan: 'pro',
      tier,
      variant,
    },
  });

  return {
    status: captured ? 200 : 502,
    body: {
      ok: captured,
      orderId: order.orderId,
      tier,
    },
  };
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204 });
  }

  if (request.method !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  const secret = process.env.LEMON_SQUEEZY_WEBHOOK_SECRET ?? process.env.LEMONSQUEEZY_WEBHOOK_SECRET;
  if (!secret?.trim()) {
    console.error('[billing/webhook] Missing LEMON_SQUEEZY_WEBHOOK_SECRET');
    return jsonResponse(500, { error: 'Server configuration error' });
  }

  try {
    const rawBody = Buffer.from(await request.arrayBuffer());
    const result = await handleLemonSqueezyWebhook(
      rawBody,
      request.headers.get('x-signature') ?? undefined,
      secret.trim(),
    );
    return jsonResponse(result.status, result.body);
  } catch (error) {
    console.error('[billing/webhook] handler failed', error);
    return jsonResponse(500, { error: 'Internal server error' });
  }
}
