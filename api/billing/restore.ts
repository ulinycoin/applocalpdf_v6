import { crypto } from 'node:crypto';

// Helper to encode Base64URL
function encodeBase64Url(buffer: Buffer | Uint8Array): string {
  return buffer.toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

function encodeUtf8Base64Url(str: string): string {
  return encodeBase64Url(Buffer.from(str, 'utf8'));
}

// Logic to sign JWT using RS256
async function signJwt(payload: any, privateKeyPem: string): Promise<string> {
  const header = { alg: 'RS256', typ: 'JWT' };
  const headerStr = encodeUtf8Base64Url(JSON.stringify(header));
  const payloadStr = encodeUtf8Base64Url(JSON.stringify(payload));
  const dataToSign = `${headerStr}.${payloadStr}`;
  
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(dataToSign);
  sign.end();
  
  const signature = sign.sign(privateKeyPem);
  const signatureStr = encodeBase64Url(signature);
  
  return `${dataToSign}.${signatureStr}`;
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { licenseKey } = req.body;
  if (!licenseKey) {
    return res.status(400).json({ error: 'License key is required' });
  }

  const apiKey = process.env.LEMON_SQUEEZY_API_KEY;
  const privateKey = process.env.JWT_PRIVATE_KEY;

  if (!apiKey || !privateKey) {
    console.error('Missing server-side configuration (API key or Private key)');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  try {
    // 1. Validate with LemonSqueezy
    const lsResponse = await fetch('https://api.lemonsqueezy.com/v1/licenses/validate', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ license_key: licenseKey }).toString(),
    });

    const lsData = await lsResponse.json();

    if (!lsResponse.ok || !lsData.valid) {
      return res.status(402).json({ 
        error: 'Invalid or expired license key',
        details: lsData.error || 'Validation failed'
      });
    }

    // 2. Determine Plan and Entitlements
    // For now, any valid license from LS grants 'pro' plan.
    // In a real scenario, we might check product_id or variant_id from lsData.
    const plan = 'pro';
    const entitlements = [
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

    // 3. Create JWT Claims
    const now = Math.floor(Date.now() / 1000);
    const exp = now + (60 * 60 * 24 * 30); // 30 days expiry for the local token

    const claims = {
      sub: lsData.license_key?.id?.toString() || 'unknown',
      plan,
      entitlements,
      iat: now,
      exp,
    };

    // 4. Sign JWT
    const token = await signJwt(claims, privateKey);

    // 5. Respond
    // We return both the token and the plan, but frontend MUST trust only the token.
    return res.status(200).json({
      success: true,
      plan,
      token,
    });

  } catch (err: any) {
    console.error('Biling restore error:', err);
    return res.status(500).json({ error: 'Internal server error', message: err.message });
  }
}
