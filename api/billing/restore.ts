import { createSign, createVerify, createCipheriv, createDecipheriv, createHash, randomBytes, type KeyLike } from 'node:crypto';

type BillingPlan = 'basic' | 'pro';
type BillingTier = 'free' | 'pro_monthly' | 'pro_yearly' | 'pro_lifetime';

/** One-time purchases get a long-lived token instead of the 30-day subscription token. */
const LIFETIME_JWT_SECONDS = 10 * 365 * 24 * 60 * 60;

/** One-time "LocalPDF Pro" product (1371816) and its single variant (2143549); env vars still win. */
const LIFETIME_PRODUCT_ID_FALLBACK = '1371816';
const LIFETIME_VARIANT_ID_FALLBACK = '2143549';

function parseIdSet(raw: string | undefined): Set<string> {
  return new Set((raw ?? '').split(',').map((value) => value.trim()).filter(Boolean));
}

function mapProductVariantToTier(productId: string, variantId: string): BillingTier | null {
  const monthlyProductIds = parseIdSet(process.env.LEMON_SQUEEZY_PRO_MONTHLY_PRODUCT_IDS);
  const monthlyVariantIds = parseIdSet(process.env.LEMON_SQUEEZY_PRO_MONTHLY_VARIANT_IDS);
  const yearlyProductIds = parseIdSet(process.env.LEMON_SQUEEZY_PRO_YEARLY_PRODUCT_IDS);
  const yearlyVariantIds = parseIdSet(process.env.LEMON_SQUEEZY_PRO_YEARLY_VARIANT_IDS);
  const lifetimeProductIds = parseIdSet(process.env.LEMON_SQUEEZY_PRO_LIFETIME_PRODUCT_IDS);
  const lifetimeVariantIds = parseIdSet(process.env.LEMON_SQUEEZY_PRO_LIFETIME_VARIANT_IDS);
  if (LIFETIME_PRODUCT_ID_FALLBACK) lifetimeProductIds.add(LIFETIME_PRODUCT_ID_FALLBACK);
  if (LIFETIME_VARIANT_ID_FALLBACK) lifetimeVariantIds.add(LIFETIME_VARIANT_ID_FALLBACK);

  const hasMonthlyVariant = variantId !== '' && monthlyVariantIds.has(variantId);
  const hasYearlyVariant = variantId !== '' && yearlyVariantIds.has(variantId);
  const hasLifetimeVariant = variantId !== '' && lifetimeVariantIds.has(variantId);
  if (hasMonthlyVariant && hasYearlyVariant) return null;
  if (hasMonthlyVariant) return 'pro_monthly';
  if (hasYearlyVariant) return 'pro_yearly';
  if (hasLifetimeVariant) return 'pro_lifetime';

  const hasMonthlyProduct = productId !== '' && monthlyProductIds.has(productId);
  const hasYearlyProduct = productId !== '' && yearlyProductIds.has(productId);
  const hasLifetimeProduct = productId !== '' && lifetimeProductIds.has(productId);
  if (hasMonthlyProduct && hasYearlyProduct) return null;
  // The one-time variant shares its product with the subscription variants, so the product id alone
  // can only mean lifetime when it is listed there and nowhere else.
  if (hasLifetimeProduct && !hasMonthlyProduct && !hasYearlyProduct) return 'pro_lifetime';
  if (hasMonthlyProduct) return 'pro_monthly';
  if (hasYearlyProduct) return 'pro_yearly';

  return null;
}

/**
 * LemonSqueezy only counts a device when a licence is activated through the License API, which also
 * enforces the key's activation limit. `validate` (used below) never registers a device, so before this
 * existed every key stayed at "0 of 3 devices" in the dashboard no matter how many machines used it.
 */
type ActivationOutcome =
  | { ok: true; instanceId: string; licenseKeyId: string }
  | { ok: false; reason: 'activation_limit_reached'; limit: number | null; usage: number | null }
  | { ok: false; reason: 'unavailable' };

/**
 * Device names embed a stable per-device id, so a returning device can be matched to its existing
 * instance instead of burning another of the three slots.
 */
export async function findExistingInstanceId(licenseKeyId: string, instanceName: string): Promise<string> {
  const apiKey = process.env.LEMON_SQUEEZY_API_KEY?.trim();
  if (!licenseKeyId || !instanceName || !apiKey) {
    return '';
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2500);
  try {
    const response = await fetch(
      `https://api.lemonsqueezy.com/v1/license-key-instances?filter%5Blicense_key_id%5D=${encodeURIComponent(licenseKeyId)}&page%5Bsize%5D=25`,
      {
        headers: { Accept: 'application/vnd.api+json', Authorization: `Bearer ${apiKey}` },
        signal: controller.signal,
      },
    );
    if (!response.ok) {
      return '';
    }
    const data: any = await response.json();
    const match = (Array.isArray(data?.data) ? data.data : []).find(
      (row: any) => String(row?.attributes?.name ?? '') === instanceName,
    );
    return match ? toIdString(match?.attributes?.identifier ?? match?.id) : '';
  } catch (error) {
    console.warn('[billing/restore] instance lookup failed', error);
    return '';
  } finally {
    clearTimeout(timeout);
  }
}

export async function activateDeviceInstance(input: {
  licenseKey: string;
  instanceName: string;
}): Promise<ActivationOutcome> {
  try {
    const response = await fetch('https://api.lemonsqueezy.com/v1/licenses/activate', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        license_key: input.licenseKey,
        instance_name: input.instanceName,
      }).toString(),
    });

    const data: any = await response.json().catch(() => null);
    const instanceId = toIdString(data?.instance?.id);
    if (data?.activated && instanceId) {
      return {
        ok: true,
        instanceId,
        licenseKeyId: toIdString(data?.license_key?.id),
      };
    }

    const errorCode = String(data?.error ?? '').toLowerCase();
    if (errorCode.includes('activation_limit')) {
      return {
        ok: false,
        reason: 'activation_limit_reached',
        limit: Number.isFinite(data?.license_key?.activation_limit)
          ? Number(data.license_key.activation_limit)
          : null,
        usage: Number.isFinite(data?.license_key?.activation_usage)
          ? Number(data.license_key.activation_usage)
          : null,
      };
    }

    console.warn('[billing/restore] activation rejected', response.status, data?.error ?? '');
    return { ok: false, reason: 'unavailable' };
  } catch (error) {
    console.warn('[billing/restore] activation request failed', error);
    return { ok: false, reason: 'unavailable' };
  }
}

export function getMappedLicense(lsData: any): { plan: BillingPlan; tier: BillingTier } | null {
  const meta = lsData?.meta ?? {};
  const orderItem = lsData?.license_key?.order_item ?? {};
  const productId = String(meta.product_id ?? orderItem.product_id ?? '');
  const variantId = String(meta.variant_id ?? orderItem.variant_id ?? '');

  const tier = mapProductVariantToTier(productId, variantId);
  if (!tier) {
    return null;
  }

  return { plan: 'pro', tier };
}

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
  | 'pdf.protect.unlock'
  | 'pdf.redact.verify';

export const BASIC_ENTITLEMENTS: BillingEntitlement[] = [
  'pdf.merge',
  'pdf.split',
  'pdf.compress',
];

export const PRO_ENTITLEMENTS: BillingEntitlement[] = [
  ...BASIC_ENTITLEMENTS,
  'pdf.ocr',
  'pdf.rotate',
  'pdf.delete_pages',
  'pdf.edit',
  'pdf.to_image',
  'office.convert',
  'pdf.protect.encrypt',
  'pdf.protect.unlock',
  'pdf.redact.verify',
];

function getDefaultEntitlementsForPlan(plan: BillingPlan): BillingEntitlement[] {
  return [...(plan === 'pro' ? PRO_ENTITLEMENTS : BASIC_ENTITLEMENTS)];
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/** LemonSqueezy returns ids as numbers in some payloads and strings in others. */
function toIdString(value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return isNonEmptyString(value) ? value.trim() : '';
}

export function encryptString(text: string, secret: string): string {
  const key = createHash('sha256').update(secret).digest();
  const iv = randomBytes(16);
  const cipher = createCipheriv('aes-256-cbc', key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return `${iv.toString('hex')}:${encrypted}`;
}

export function decryptString(encryptedText: string, secret: string): string {
  const key = createHash('sha256').update(secret).digest();
  const [ivHex, encrypted] = encryptedText.split(':');
  if (!ivHex || !encrypted) return '';
  const iv = Buffer.from(ivHex, 'hex');
  const decipher = createDecipheriv('aes-256-cbc', key, iv);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
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

export async function signJwt(payload: Record<string, unknown>, privateKeyPem: string): Promise<string> {
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

function decodePayload(token: string): any {
  try {
    const parts = token.split('.');
    const base64Payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(Buffer.from(base64Payload, 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

function verifyJwtSignature(token: string, publicKeyPem: string): boolean {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return false;
    const signedData = `${parts[0]}.${parts[1]}`;
    const base64Signature = parts[2].replace(/-/g, '+').replace(/_/g, '/');
    const verifier = createVerify('RSA-SHA256');
    verifier.update(signedData);
    return verifier.verify(publicKeyPem, Buffer.from(base64Signature, 'base64'));
  } catch {
    return false;
  }
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


/**
 * Token renewal used to live in its own route that imported this file. Vercel's frameworkless builder
 * ships only the entry file of a function (Node ESM then fails with ERR_MODULE_NOT_FOUND), so the route
 * never worked in production and the flow lives here instead; `/api/billing/refresh` is rewritten to
 * this function for clients that still call it.
 */
async function handleRefreshTicket(req: any, res: any) {
  const token = typeof req.body?.token === 'string' ? req.body.token.trim() : '';
  if (!token) {
    return res.status(400).json({ error: 'Token is required' });
  }

  const apiKey = process.env.LEMON_SQUEEZY_API_KEY;
  const privateKeyRaw = process.env.JWT_PRIVATE_KEY;
  const publicKeyRaw = process.env.VITE_PUBLIC_JWT_KEY;
  if (!isNonEmptyString(apiKey) || !isNonEmptyString(privateKeyRaw) || !isNonEmptyString(publicKeyRaw)) {
    console.error('Missing server-side configuration for token refresh');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const privateKey = privateKeyRaw.replace(/\\n/g, '\n');
  const publicKey = publicKeyRaw.replace(/\\n/g, '\n');

  if (!verifyJwtSignature(token, publicKey)) {
    return res.status(401).json({ error: 'Invalid token signature' });
  }

  const payload = decodePayload(token);
  if (!payload) {
    return res.status(400).json({ error: 'Malformed token payload' });
  }

  if (payload.iss !== 'localpdf-billing' || payload.aud !== 'localpdf-v6' || !isNonEmptyString(payload.lk)) {
    return res.status(403).json({ error: 'Token is not authorized for renewal' });
  }

  const now = Math.floor(Date.now() / 1000);
  const isLifetimeTier = payload.tier === 'pro_lifetime';
  if (!isLifetimeTier && (typeof payload.exp !== 'number' || payload.exp < now - (30 * 24 * 60 * 60))) {
    return res.status(403).json({ error: 'Token has been expired for too long' });
  }

  const clientIp = getClientIp(req);
  if (hitRateLimit(`${clientIp}:${String(payload.sub).slice(0, 10)}`)) {
    return res.status(429).json({ error: 'Too many refresh attempts. Please try again later.' });
  }

  let licenseKey = '';
  try {
    licenseKey = decryptString(payload.lk, privateKeyRaw);
  } catch (err) {
    console.error('Failed to decrypt license key in refresh handler:', err);
    return res.status(403).json({ error: 'Failed to decrypt license key' });
  }
  if (!isNonEmptyString(licenseKey)) {
    return res.status(403).json({ error: 'Decrypted license key is empty' });
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
      return res.status(402).json({ error: 'License key is no longer valid or expired', details: lsData.error || 'Validation failed' });
    }

    const mapped = getMappedLicense(lsData);
    if (!mapped) {
      return res.status(403).json({ error: 'License is valid but not allowed for this app configuration.' });
    }

    const newExp = now + (mapped.tier === 'pro_lifetime' ? LIFETIME_JWT_SECONDS : 60 * 60 * 24 * 30);
    const newClaims = {
      iss: 'localpdf-billing',
      aud: 'localpdf-v6',
      sub: String(lsData.license_key?.id ?? lsData.instance?.id ?? 'unknown'),
      plan: mapped.plan,
      tier: mapped.tier,
      entitlements: PRO_ENTITLEMENTS,
      lk: encryptString(licenseKey, privateKeyRaw),
      // The registered device travels with the token; refreshing must not spend a new activation slot.
      ins: typeof payload.ins === 'string' && payload.ins ? payload.ins : undefined,
      lki: typeof payload.lki === 'string' && payload.lki ? payload.lki : undefined,
      iat: now,
      nbf: now,
      exp: newExp,
    };

    const newToken = await signJwt(newClaims, privateKey);
    return res.status(200).json({
      success: true,
      plan: mapped.plan,
      tier: mapped.tier,
      token: newToken,
      expiresAt: new Date(newExp * 1000).toISOString(),
    });
  } catch (err: any) {
    console.error('Billing refresh error:', err);
    return res.status(500).json({ error: 'Internal server error', message: err?.message ?? 'Unknown error' });
  }
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // A token without a license key means "renew my ticket", which is what /api/billing/refresh rewrites to.
  if (typeof req.body?.token === 'string' && !req.body?.licenseKey) {
    return handleRefreshTicket(req, res);
  }

  const licenseKey = typeof req.body?.licenseKey === 'string' ? req.body.licenseKey.trim() : '';
  if (!licenseKey) {
    return res.status(400).json({ error: 'License key is required' });
  }

  const apiKey = process.env.LEMON_SQUEEZY_API_KEY;
  const privateKeyRaw = process.env.JWT_PRIVATE_KEY;
  if (!isNonEmptyString(apiKey) || !isNonEmptyString(privateKeyRaw)) {
    console.error('Missing server-side configuration (API key or private key)');
    return res.status(500).json({ error: 'Server configuration error' });
  }
  const privateKey = privateKeyRaw.replace(/\\n/g, '\n');

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

    const requestedInstanceId = typeof req.body?.instanceId === 'string' ? req.body.instanceId.trim() : '';
    const requestedInstanceName = typeof req.body?.instanceName === 'string' ? req.body.instanceName.trim() : '';
    const instanceName = (requestedInstanceName || `device-${clientIp}`).slice(0, 120);

    let instanceId = requestedInstanceId;
    let licenseKeyId = toIdString(lsData.license_key?.id);
    let activatedNow = false;

    // A device that already holds an instance id must not spend another activation slot.
    if (!instanceId && licenseKeyId && requestedInstanceName) {
      instanceId = await findExistingInstanceId(licenseKeyId, instanceName);
    }
    if (!instanceId) {
      const activation = await activateDeviceInstance({ licenseKey, instanceName });
      if (!activation.ok && activation.reason === 'activation_limit_reached') {
        return res.status(409).json({
          error: 'activation_limit_reached',
          message: `This license is already active on ${activation.usage ?? activation.limit ?? 3} device(s).`,
          limit: activation.limit,
          usage: activation.usage,
        });
      }
      if (activation.ok) {
        instanceId = activation.instanceId;
        activatedNow = true;
        if (activation.licenseKeyId) {
          licenseKeyId = activation.licenseKeyId;
        }
      } else {
        // The license itself already validated, so a LemonSqueezy hiccup must not lock out a paying
        // customer — issue the token, just without a registered device.
        console.warn('[billing/restore] issuing token without a registered device instance');
      }
    }

    const usageBefore = Number(lsData.license_key?.activation_usage);
    const devicesUsed = (Number.isFinite(usageBefore) ? usageBefore : 0) + (activatedNow ? 1 : 0);
    const deviceLimit = Number.isFinite(Number(lsData.license_key?.activation_limit))
      ? Number(lsData.license_key?.activation_limit)
      : null;

    const now = Math.floor(Date.now() / 1000);
    const exp = now + (mapped.tier === 'pro_lifetime' ? LIFETIME_JWT_SECONDS : 60 * 60 * 24 * 30);
    const claims = {
      iss: 'localpdf-billing',
      aud: 'localpdf-v6',
      sub: String(lsData.license_key?.id ?? lsData.instance?.id ?? 'unknown'),
      plan: mapped.plan,
      tier: mapped.tier,
      entitlements: getDefaultEntitlementsForPlan(mapped.plan),
      lk: encryptString(licenseKey, privateKeyRaw),
      ins: instanceId || undefined,
      lki: licenseKeyId || undefined,
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
      instanceId: instanceId || null,
      devicesUsed,
      deviceLimit,
      expiresAt: new Date(exp * 1000).toISOString(),
    });
  } catch (err: any) {
    console.error('Billing restore error:', err);
    return res.status(500).json({ error: 'Internal server error', message: err?.message ?? 'Unknown error' });
  }
}
