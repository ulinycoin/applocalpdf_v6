import { createDecipheriv, createHash, createVerify } from 'node:crypto';

/**
 * Device management for LemonSqueezy license activations.
 *
 *   POST { token | licenseKey, action: 'list' }                   -> devices holding a slot
 *   POST { token | licenseKey, action: 'deactivate', instanceId } -> frees one slot
 *
 * Every helper below is inlined on purpose. Vercel's frameworkless builder gives each `api/**` file its
 * own function bundle and does not put sibling modules into it, so a relative import of another api file
 * compiles fine and then fails at runtime with FUNCTION_INVOCATION_FAILED — that is what happened to
 * `refresh.ts`, which imports `./restore`. The Hobby plan additionally caps a deployment at twelve
 * functions, which is why list and deactivate share one route.
 */

const LS_JSON_API = 'https://api.lemonsqueezy.com/v1';
const LS_HEADERS = { Accept: 'application/vnd.api+json' };

const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX_ATTEMPTS = 20;
const attempts = new Map<string, { count: number; resetAt: number }>();

type LicenseTokenContext = {
  licenseKey: string;
  /** Empty for tokens issued before device instances existed. */
  licenseKeyId: string;
  /** This device's activation instance; empty when the device was never registered. */
  instanceId: string;
};

type DeviceRow = { id: string; name: string; createdAt: string };

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
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
    const signature = Buffer.from(base64Signature, 'base64');
    const verifier = createVerify('RSA-SHA256');
    verifier.update(signedData);
    return verifier.verify(publicKeyPem, signature);
  } catch {
    return false;
  }
}

function decryptString(encryptedText: string, secret: string): string {
  const key = createHash('sha256').update(secret).digest();
  const [ivHex, encrypted] = encryptedText.split(':');
  if (!ivHex || !encrypted) return '';
  const iv = Buffer.from(ivHex, 'hex');
  const decipher = createDecipheriv('aes-256-cbc', key, iv);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

/** Whoever holds the signed billing token holds the license, so no account is needed. */
function authenticateLicenseToken(rawToken: string): LicenseTokenContext | null {
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
  };
}

/** Tokens issued before `lki` existed carry no license-key id, but `validate` returns it. */
async function fetchLicenseKeyId(licenseKey: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2500);
  try {
    const response = await fetch(`${LS_JSON_API}/licenses/validate`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ license_key: licenseKey }).toString(),
      signal: controller.signal,
    });
    const data: any = await response.json().catch(() => null);
    const id = data?.license_key?.id;
    return typeof id === 'number' ? String(id) : isNonEmptyString(id) ? id : '';
  } catch (error) {
    console.warn('[billing/devices] license lookup failed', error);
    return '';
  } finally {
    clearTimeout(timeout);
  }
}

function getClientIp(req: any): string {
  const forwardedFor = req.headers?.['x-forwarded-for'];
  const candidate = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor;
  if (typeof candidate === 'string' && candidate.trim()) {
    return candidate.split(',')[0].trim();
  }
  return 'unknown';
}

function hitDeviceRateLimit(bucketKey: string): boolean {
  const now = Date.now();
  const current = attempts.get(bucketKey);
  if (!current || current.resetAt <= now) {
    attempts.set(bucketKey, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }
  current.count += 1;
  return current.count > RATE_LIMIT_MAX_ATTEMPTS;
}

async function listDevices(
  licenseKeyId: string,
  headers: Record<string, string>,
): Promise<{ devices: DeviceRow[]; limit: number | null; usage: number | null; upstream: Record<string, number> }> {
  const [instancesResponse, keyResponse] = await Promise.all([
    fetch(
      `${LS_JSON_API}/license-key-instances?filter%5Blicense_key_id%5D=${encodeURIComponent(licenseKeyId)}&page%5Bsize%5D=25`,
      { headers },
    ),
    fetch(`${LS_JSON_API}/license-keys/${encodeURIComponent(licenseKeyId)}`, { headers }),
  ]);

  const instancesData: any = await instancesResponse.json().catch(() => null);
  const keyData: any = await keyResponse.json().catch(() => null);

  const devices: DeviceRow[] = Array.isArray(instancesData?.data)
    ? instancesData.data
        .map((row: any) => ({
          id: String(row?.attributes?.identifier ?? row?.id ?? ''),
          name: String(row?.attributes?.name ?? 'Unknown device'),
          createdAt: String(row?.attributes?.created_at ?? ''),
        }))
        .filter((row: DeviceRow) => row.id !== '')
    : [];

  const limitRaw = Number(keyData?.data?.attributes?.activation_limit);
  const usageRaw = Number(
    keyData?.data?.attributes?.instances_count ?? keyData?.data?.attributes?.activation_usage,
  );

  return {
    devices,
    limit: Number.isFinite(limitRaw) ? limitRaw : null,
    usage: Number.isFinite(usageRaw) ? usageRaw : devices.length,
    upstream: { instances: instancesResponse.status, key: keyResponse.status },
  };
}

async function deactivateInstance(
  licenseKey: string,
  instanceId: string,
): Promise<{ ok: boolean; usage: number | null; limit: number | null; details?: string }> {
  const response = await fetch(`${LS_JSON_API}/licenses/deactivate`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ license_key: licenseKey, instance_id: instanceId }).toString(),
  });

  const data: any = await response.json().catch(() => null);
  if (!data?.deactivated) {
    return {
      ok: false,
      usage: null,
      limit: null,
      details: data?.error ?? 'LemonSqueezy rejected the deactivation',
    };
  }

  const usage = Number(data?.license_key?.activation_usage);
  const limit = Number(data?.license_key?.activation_limit);
  return {
    ok: true,
    usage: Number.isFinite(usage) ? usage : null,
    limit: Number.isFinite(limit) ? limit : null,
  };
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const token = typeof req.body?.token === 'string' ? req.body.token.trim() : '';
  const licenseKeyInput = typeof req.body?.licenseKey === 'string' ? req.body.licenseKey.trim() : '';
  if (!token && !licenseKeyInput) {
    return res.status(400).json({ error: 'Token or license key is required' });
  }

  const action = req.body?.action === 'deactivate' ? 'deactivate' : 'list';

  if (hitDeviceRateLimit(`${action}:${getClientIp(req)}`)) {
    return res.status(429).json({ error: 'Too many requests. Please try again later.' });
  }

  const context = token ? authenticateLicenseToken(token) : null;
  if (token && !context) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  const licenseKey = context?.licenseKey || licenseKeyInput;
  const apiKey = process.env.LEMON_SQUEEZY_API_KEY?.trim();
  if (!apiKey) {
    console.error('[billing/devices] Missing LEMON_SQUEEZY_API_KEY');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  try {
    if (action === 'deactivate') {
      const requested = typeof req.body?.instanceId === 'string' ? req.body.instanceId.trim() : '';
      const instanceId = requested || context?.instanceId || '';
      if (!instanceId) {
        return res.status(400).json({ error: 'This device is not registered on the license' });
      }

      const result = await deactivateInstance(licenseKey, instanceId);
      if (!result.ok) {
        console.warn('[billing/devices] deactivation rejected', result.details);
        // 409, not 502: the site sits behind Cloudflare, which replaces the body of any 5xx with its own
        // error page, so a business-level refusal has to travel as a 4xx to stay readable.
        return res.status(409).json({ error: 'deactivation_failed', details: result.details });
      }

      return res.status(200).json({
        success: true,
        action: 'deactivate',
        deactivatedInstanceId: instanceId,
        wasCurrentDevice: Boolean(context?.instanceId) && instanceId === context?.instanceId,
        usage: result.usage,
        limit: result.limit,
      });
    }

    const licenseKeyId = context?.licenseKeyId || (await fetchLicenseKeyId(licenseKey));
    if (!licenseKeyId) {
      return res.status(200).json({
        success: true,
        action: 'list',
        devices: [],
        limit: null,
        usage: null,
        instanceId: context?.instanceId || null,
      });
    }

    const headers = { ...LS_HEADERS, Authorization: `Bearer ${apiKey}` };
    const listed = await listDevices(licenseKeyId, headers);

    // Never answer "no devices" when the truth is "LemonSqueezy refused the read": a stale API key would
    // otherwise look exactly like a license nobody activated.
    if (listed.upstream.instances !== 200 || listed.upstream.key !== 200) {
      console.error('[billing/devices] LemonSqueezy refused the device read', listed.upstream);
      return res.status(409).json({
        error: 'device_list_unavailable',
        details: 'LemonSqueezy did not accept the device lookup; the server API key is missing or expired.',
        upstream: listed.upstream,
      });
    }

    return res.status(200).json({
      success: true,
      action: 'list',
      devices: listed.devices,
      limit: listed.limit,
      usage: listed.usage,
      instanceId: context?.instanceId || null,
      licenseKeyId,
    });
  } catch (error: any) {
    console.error('[billing/devices] failed', error);
    return res.status(409).json({ error: 'device_request_failed', message: error?.message ?? 'Unknown error' });
  }
}
