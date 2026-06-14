import { createSign, createVerify, type KeyLike } from 'node:crypto';
import { decryptString, encryptString, getMappedLicense } from './restore';

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function verifyJwtSignature(token: string, publicKeyPem: string): boolean {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return false;
    const signedData = `${parts[0]}.${parts[1]}`;
    // Base64Url to Base64
    const base64Signature = parts[2].replace(/-/g, '+').replace(/_/g, '/');
    const signature = Buffer.from(base64Signature, 'base64');
    
    const verifier = createVerify('RSA-SHA256');
    verifier.update(signedData);
    return verifier.verify(publicKeyPem, signature);
  } catch {
    return false;
  }
}

function decodePayload(token: string): any {
  try {
    const parts = token.split('.');
    const base64Payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = Buffer.from(base64Payload, 'base64').toString('utf8');
    return JSON.parse(json);
  } catch {
    return null;
  }
}

const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX_ATTEMPTS = 15;
const refreshAttempts = new Map<string, { count: number; resetAt: number }>();

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
  const current = refreshAttempts.get(bucketKey);
  if (!current || current.resetAt <= now) {
    refreshAttempts.set(bucketKey, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }
  current.count += 1;
  return current.count > RATE_LIMIT_MAX_ATTEMPTS;
}

const PRO_ENTITLEMENTS = [
  'pdf.merge',
  'pdf.split',
  'pdf.compress',
  'pdf.ocr',
  'pdf.rotate',
  'pdf.delete_pages',
  'pdf.edit',
  'pdf.to_image',
  'office.convert',
  'pdf.protect.encrypt',
  'pdf.protect.unlock',
];

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

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

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

  // Проверка подписи
  if (!verifyJwtSignature(token, publicKey)) {
    return res.status(401).json({ error: 'Invalid token signature' });
  }

  const payload = decodePayload(token);
  if (!payload) {
    return res.status(400).json({ error: 'Malformed token payload' });
  }

  // Проверка базовых claims
  if (payload.iss !== 'localpdf-billing' || payload.aud !== 'localpdf-v6' || !isNonEmptyString(payload.lk)) {
    return res.status(403).json({ error: 'Token is not authorized for renewal' });
  }

  // Ограничение: токен не должен быть протухшим слишком давно (например, не более 30 дней назад)
  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== 'number' || payload.exp < now - (30 * 24 * 60 * 60)) {
    return res.status(403).json({ error: 'Token has been expired for too long' });
  }

  // Лимитирование запросов по IP + sub токена
  const clientIp = getClientIp(req);
  const rateKey = `${clientIp}:${String(payload.sub).slice(0, 10)}`;
  if (hitRateLimit(rateKey)) {
    return res.status(429).json({ error: 'Too many refresh attempts. Please try again later.' });
  }

  // Расшифровка лицензионного ключа
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

    // Выпуск нового JWT на 30 дней
    const newExp = now + (60 * 60 * 24 * 30);
    const newClaims = {
      iss: 'localpdf-billing',
      aud: 'localpdf-v6',
      sub: String(lsData.license_key?.id ?? lsData.instance?.id ?? 'unknown'),
      plan: mapped.plan,
      tier: mapped.tier,
      entitlements: PRO_ENTITLEMENTS, // Продлеваем Pro entitlements
      lk: encryptString(licenseKey, privateKeyRaw),
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
