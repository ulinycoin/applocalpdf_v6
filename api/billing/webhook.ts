import { createHmac, timingSafeEqual } from 'node:crypto';

type BillingTier = 'pro_monthly' | 'pro_yearly';

const DEFAULT_POSTHOG_HOST = 'https://eu.i.posthog.com';

const PURCHASE_EVENTS = new Set([
  'order_created',
  'subscription_created',
  'subscription_payment_success',
]);

function parseIdSet(raw: string | undefined): Set<string> {
  return new Set((raw ?? '').split(',').map((value) => value.trim()).filter(Boolean));
}

function mapProductVariantToTier(productId: string, variantId: string): BillingTier | null {
  const monthlyProductIds = parseIdSet(process.env.LEMON_SQUEEZY_PRO_MONTHLY_PRODUCT_IDS);
  const monthlyVariantIds = parseIdSet(process.env.LEMON_SQUEEZY_PRO_MONTHLY_VARIANT_IDS);
  const yearlyProductIds = parseIdSet(process.env.LEMON_SQUEEZY_PRO_YEARLY_PRODUCT_IDS);
  const yearlyVariantIds = parseIdSet(process.env.LEMON_SQUEEZY_PRO_YEARLY_VARIANT_IDS);

  const hasMonthlyVariant = variantId !== '' && monthlyVariantIds.has(variantId);
  const hasYearlyVariant = variantId !== '' && yearlyVariantIds.has(variantId);
  if (hasMonthlyVariant && hasYearlyVariant) return null;
  if (hasMonthlyVariant) return 'pro_monthly';
  if (hasYearlyVariant) return 'pro_yearly';

  const hasMonthlyProduct = productId !== '' && monthlyProductIds.has(productId);
  const hasYearlyProduct = productId !== '' && yearlyProductIds.has(productId);
  if (hasMonthlyProduct && hasYearlyProduct) return null;
  if (hasMonthlyProduct) return 'pro_monthly';
  if (hasYearlyProduct) return 'pro_yearly';

  return null;
}

async function capturePostHogEvent(input: {
  event: string;
  distinctId: string;
  properties?: Record<string, unknown>;
}): Promise<boolean> {
  const apiKey = process.env.POSTHOG_PROJECT_API_KEY
    ?? process.env.PUBLIC_POSTHOG_KEY
    ?? process.env.VITE_PUBLIC_POSTHOG_KEY;
  if (!apiKey?.trim()) {
    console.error('[posthog] Missing POSTHOG_PROJECT_API_KEY or PUBLIC_POSTHOG_KEY');
    return false;
  }

  const host = (process.env.POSTHOG_HOST ?? DEFAULT_POSTHOG_HOST).replace(/\/$/, '');
  const body: Record<string, unknown> = {
    api_key: apiKey.trim(),
    event: input.event,
    distinct_id: input.distinctId,
    properties: {
      ...input.properties,
      $lib: 'localpdf-billing-webhook',
    },
  };

  const response = await fetch(`${host}/capture/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    console.error('[posthog] capture failed', response.status, text);
    return false;
  }

  return true;
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

  return {
    status: captured ? 200 : 502,
    body: {
      ok: captured,
      orderId: order.orderId,
      tier,
    },
  };
}

function sendJson(res: any, status: number, body: Record<string, unknown>): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

async function readRawBody(req: any): Promise<Buffer> {
  if (typeof req.body === 'string') {
    return Buffer.from(req.body);
  }
  if (Buffer.isBuffer(req.body)) {
    return req.body;
  }
  if (req.body && typeof req.body === 'object') {
    return Buffer.from(JSON.stringify(req.body));
  }
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export default async function handler(req: any, res: any) {
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }

  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  const secret = process.env.LEMON_SQUEEZY_WEBHOOK_SECRET ?? process.env.LEMONSQUEEZY_WEBHOOK_SECRET;
  if (!secret?.trim()) {
    console.error('[billing/webhook] Missing LEMON_SQUEEZY_WEBHOOK_SECRET');
    return sendJson(res, 500, { error: 'Server configuration error' });
  }

  try {
    const rawBody = await readRawBody(req);
    const result = await handleLemonSqueezyWebhook(rawBody, req.headers?.['x-signature'], secret.trim());
    return sendJson(res, result.status, result.body);
  } catch (error) {
    console.error('[billing/webhook] handler failed', error);
    return sendJson(res, 500, { error: 'Internal server error' });
  }
}
