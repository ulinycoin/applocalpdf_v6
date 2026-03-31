import { createSign, type KeyLike } from 'node:crypto';

type BillingPlan = 'basic' | 'pro';
type BillingTier = 'free' | 'pro_monthly' | 'pro_yearly';
type BillingEntitlement =
  | 'pdf.merge'
  | 'pdf.split'
  | 'pdf.compress'
  | 'pdf.ocr'
  | 'pdf.rotate'
  | 'pdf.delete_pages'
  | 'pdf.edit'
  | 'pdf.to_image'
  | 'office.convert'
  | 'pdf.protect.encrypt'
  | 'pdf.protect.unlock';

const BASIC_ENTITLEMENTS: BillingEntitlement[] = [
  'pdf.merge',
  'pdf.split',
  'pdf.compress',
];

const PRO_ENTITLEMENTS: BillingEntitlement[] = [
  ...BASIC_ENTITLEMENTS,
  'pdf.ocr',
  'pdf.rotate',
  'pdf.delete_pages',
  'pdf.edit',
  'pdf.to_image',
  'office.convert',
  'pdf.protect.encrypt',
  'pdf.protect.unlock',
];

function getDefaultEntitlementsForPlan(plan: BillingPlan): BillingEntitlement[] {
  return [...(plan === 'pro' ? PRO_ENTITLEMENTS : BASIC_ENTITLEMENTS)];
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX_ATTEMPTS = 10;
const keyAttempts = new Map<string, { count: number; resetAt: number }>();

function encodeBase64Url(buffer: Buffer | Uint8Array): string {
  return Buffer.from(buffer).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function encodeUtf8Base64Url(str: string): string {
  return encodeBase64Url(Buffer.from(str, 'utf8'));
}

async function signJwt(payload: Record<string, unknown>, privateKeyPem: string): Promise<string> {
  const headerStr = encodeUtf8Base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payloadStr = encodeUtf8Base64Url(JSON.stringify(payload));
  const dataToSign = `${headerStr}.${payloadStr}`;
  const signer = createSign('RSA-SHA256');
  signer.update(dataToSign);
  signer.end();
  const signature = signer.sign(privateKeyPem as unknown as KeyLike);
  return `${dataToSign}.${encodeBase64Url(signature)}`;
}

function getClientIp(req: any): string {
  const forwardedFor = req.headers?.['x-forwarded-for'];
  const candidate = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor;
  if (typeof candidate === 'string' && candidate.trim()) {
    return candidate.split(',')[0].trim();
  }
  return 'unknown';
}

function hitRateLimit(bucketKey: string): boolean {
  const now = Date.now();
  const current = keyAttempts.get(bucketKey);
  if (!current || current.resetAt <= now) {
    keyAttempts.set(bucketKey, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }
  current.count += 1;
  return current.count > RATE_LIMIT_MAX_ATTEMPTS;
}

function parseIdSet(raw: string | undefined): Set<string> {
  return new Set((raw ?? '').split(',').map((value) => value.trim()).filter(Boolean));
}

function selectTierByVariantOrProduct(
  productId: string,
  variantId: string,
  options: {
    monthlyProductIds: Set<string>;
    monthlyVariantIds: Set<string>;
    yearlyProductIds: Set<string>;
    yearlyVariantIds: Set<string>;
  },
): BillingTier | null {
  const {
    monthlyProductIds,
    monthlyVariantIds,
    yearlyProductIds,
    yearlyVariantIds,
  } = options;

  const hasMonthlyVariant = variantId !== '' && monthlyVariantIds.has(variantId);
  const hasYearlyVariant = variantId !== '' && yearlyVariantIds.has(variantId);

  if (hasMonthlyVariant && hasYearlyVariant) {
    return null;
  }
  if (hasMonthlyVariant) {
    return 'pro_monthly';
  }
  if (hasYearlyVariant) {
    return 'pro_yearly';
  }

  const hasMonthlyProduct = productId !== '' && monthlyProductIds.has(productId);
  const hasYearlyProduct = productId !== '' && yearlyProductIds.has(productId);

  if (hasMonthlyProduct && hasYearlyProduct) {
    return null;
  }
  if (hasMonthlyProduct) {
    return 'pro_monthly';
  }
  if (hasYearlyProduct) {
    return 'pro_yearly';
  }

  return null;
}

export function getMappedLicense(lsData: any): { plan: BillingPlan; tier: BillingTier } | null {
  const meta = lsData?.meta ?? {};
  const orderItem = lsData?.license_key?.order_item ?? {};
  const productId = String(meta.product_id ?? orderItem.product_id ?? '');
  const variantId = String(meta.variant_id ?? orderItem.variant_id ?? '');

  const monthlyProductIds = parseIdSet(process.env.LEMON_SQUEEZY_PRO_MONTHLY_PRODUCT_IDS);
  const monthlyVariantIds = parseIdSet(process.env.LEMON_SQUEEZY_PRO_MONTHLY_VARIANT_IDS);
  const yearlyProductIds = parseIdSet(process.env.LEMON_SQUEEZY_PRO_YEARLY_PRODUCT_IDS);
  const yearlyVariantIds = parseIdSet(process.env.LEMON_SQUEEZY_PRO_YEARLY_VARIANT_IDS);

  const tier = selectTierByVariantOrProduct(productId, variantId, {
    monthlyProductIds,
    monthlyVariantIds,
    yearlyProductIds,
    yearlyVariantIds,
  });

  if (!tier) {
    return null;
  }

  return { plan: 'pro', tier };
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const licenseKey = typeof req.body?.licenseKey === 'string' ? req.body.licenseKey.trim() : '';
  if (!licenseKey) {
    return res.status(400).json({ error: 'License key is required' });
  }

  const apiKey = process.env.LEMON_SQUEEZY_API_KEY;
  const privateKey = process.env.JWT_PRIVATE_KEY;
  if (!isNonEmptyString(apiKey) || !isNonEmptyString(privateKey)) {
    console.error('Missing server-side configuration (API key or private key)');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const clientIp = getClientIp(req);
  const rateKey = `${clientIp}:${licenseKey.slice(0, 8).toLowerCase()}`;
  if (hitRateLimit(rateKey)) {
    return res.status(429).json({ error: 'Too many restore attempts. Please try again later.' });
  }

  try {
    const lsResponse = await fetch('https://api.lemonsqueezy.com/v1/licenses/validate', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Bearer ${apiKey}`,
      },
      body: new URLSearchParams({ license_key: licenseKey }).toString(),
    });

    const lsData = await lsResponse.json();
    if (!lsResponse.ok || !lsData.valid) {
      return res.status(402).json({ error: 'Invalid or expired license key', details: lsData.error || 'Validation failed' });
    }

    const mapped = getMappedLicense(lsData);
    if (!mapped) {
      return res.status(403).json({ error: 'License is valid but not allowed for this app configuration.' });
    }

    const now = Math.floor(Date.now() / 1000);
    const exp = now + (60 * 60 * 24 * 30);
    const claims = {
      iss: 'localpdf-billing',
      aud: 'localpdf-v6',
      sub: String(lsData.license_key?.id ?? lsData.instance?.id ?? 'unknown'),
      plan: mapped.plan,
      tier: mapped.tier,
      entitlements: getDefaultEntitlementsForPlan(mapped.plan),
      iat: now,
      nbf: now,
      exp,
    };

    const token = await signJwt(claims, privateKey);
    return res.status(200).json({
      success: true,
      plan: mapped.plan,
      tier: mapped.tier,
      token,
      expiresAt: new Date(exp * 1000).toISOString(),
    });
  } catch (err: any) {
    console.error('Billing restore error:', err);
    return res.status(500).json({ error: 'Internal server error', message: err?.message ?? 'Unknown error' });
  }
}
