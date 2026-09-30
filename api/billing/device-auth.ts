import { decryptString } from './restore';
import { decodePayload, verifyJwtSignature } from './refresh';

export type LicenseTokenContext = {
  licenseKey: string;
  /** LemonSqueezy license-key id; empty for tokens issued before device instances existed. */
  licenseKeyId: string;
  /** This device's activation instance; empty when the device was never registered. */
  instanceId: string;
  tier: string;
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Device management endpoints (list/deactivate) are authorized by the signed billing token itself, so
 * they work without an account: whoever holds the token holds the license.
 */
export function authenticateLicenseToken(rawToken: string): LicenseTokenContext | null {
  const publicKeyRaw = process.env.VITE_PUBLIC_JWT_KEY;
  const privateKeyRaw = process.env.JWT_PRIVATE_KEY;
  if (!isNonEmptyString(publicKeyRaw) || !isNonEmptyString(privateKeyRaw)) {
    return null;
  }

  const publicKey = publicKeyRaw.replace(/\\n/g, '\n');
  if (!verifyJwtSignature(rawToken, publicKey)) {
    return null;
  }

  const payload = decodePayload(rawToken);
  if (!payload || payload.iss !== 'localpdf-billing' || payload.aud !== 'localpdf-v6') {
    return null;
  }
  if (!isNonEmptyString(payload.lk)) {
    return null;
  }

  let licenseKey = '';
  try {
    // Must match the key material restore.ts encrypted with: the raw env value, newlines still escaped.
    licenseKey = decryptString(payload.lk, privateKeyRaw);
  } catch {
    return null;
  }
  if (!isNonEmptyString(licenseKey)) {
    return null;
  }

  return {
    licenseKey: licenseKey.trim(),
    licenseKeyId: isNonEmptyString(payload.lki) ? payload.lki : '',
    instanceId: isNonEmptyString(payload.ins) ? payload.ins : '',
    tier: isNonEmptyString(payload.tier) ? payload.tier : '',
  };
}

/** Tokens issued before `lki` existed carry no license-key id, but `validate` returns it. */
export async function fetchLicenseKeyId(licenseKey: string): Promise<string> {
  try {
    const response = await fetch('https://api.lemonsqueezy.com/v1/licenses/validate', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ license_key: licenseKey }).toString(),
    });
    const data: any = await response.json().catch(() => null);
    return isNonEmptyString(data?.license_key?.id) ? String(data.license_key.id) : '';
  } catch (error) {
    console.warn('[billing/devices] license lookup failed', error);
    return '';
  }
}

export function getClientIp(req: any): string {
  const forwardedFor = req.headers?.['x-forwarded-for'];
  const candidate = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor;
  if (typeof candidate === 'string' && candidate.trim()) {
    return candidate.split(',')[0].trim();
  }
  return 'unknown';
}

const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX_ATTEMPTS = 20;
const attempts = new Map<string, { count: number; resetAt: number }>();

/** Device endpoints are cheap but touch the LemonSqueezy API, so keep a per-IP ceiling. */
export function hitDeviceRateLimit(bucketKey: string): boolean {
  const now = Date.now();
  const current = attempts.get(bucketKey);
  if (!current || current.resetAt <= now) {
    attempts.set(bucketKey, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }
  current.count += 1;
  return current.count > RATE_LIMIT_MAX_ATTEMPTS;
}

/**
 * A customer who has not activated this device yet has no token, but they do have the license key they
 * just pasted — without accepting it they could never see which devices are holding their slots.
 */
export function resolveLicenseKeyFromRequest(body: any): string {
  return isNonEmptyString(body?.licenseKey) ? body.licenseKey.trim() : '';
}

/**
 * Vercel only bundles a file from `api/` into a function when that file is itself a function, so this
 * shared helper has to keep a default export even though nothing should ever call the route (Hobby plan
 * also caps a deployment at 12 functions, and `api/` sits at 11).
 */
export default async function handler(_req: any, res: any) {
  return res.status(405).json({ error: 'Method not allowed' });
}
