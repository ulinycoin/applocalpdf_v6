import {
  authenticateLicenseToken,
  fetchLicenseKeyId,
  getClientIp,
  hitDeviceRateLimit,
  resolveLicenseKeyFromRequest,
} from './device-auth';

const LS_HEADERS = { Accept: 'application/vnd.api+json' };

type DeviceRow = { id: string; name: string; createdAt: string };

/**
 * Lists the devices a license key has been activated on, so a customer who hits the activation limit
 * can free a slot without asking support. Reads only; the LemonSqueezy API key stays server-side.
 */
export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const token = typeof req.body?.token === 'string' ? req.body.token.trim() : '';
  const licenseKeyInput = resolveLicenseKeyFromRequest(req.body);
  if (!token && !licenseKeyInput) {
    return res.status(400).json({ error: 'Token or license key is required' });
  }

  if (hitDeviceRateLimit(`devices:${getClientIp(req)}`)) {
    return res.status(429).json({ error: 'Too many requests. Please try again later.' });
  }

  const context = token ? authenticateLicenseToken(token) : null;
  if (token && !context) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  const apiKey = process.env.LEMON_SQUEEZY_API_KEY?.trim();
  if (!apiKey) {
    console.error('[billing/devices] Missing LEMON_SQUEEZY_API_KEY');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const headers = { ...LS_HEADERS, Authorization: `Bearer ${apiKey}` };

  try {
    const licenseKeyId = context?.licenseKeyId
      || (await fetchLicenseKeyId(context?.licenseKey || licenseKeyInput));
    if (!licenseKeyId) {
      return res.status(200).json({
        success: true,
        devices: [],
        limit: null,
        usage: null,
        instanceId: context?.instanceId || null,
      });
    }

    const [instancesResponse, keyResponse] = await Promise.all([
      fetch(
        `https://api.lemonsqueezy.com/v1/license-key-instances?filter%5Blicense_key_id%5D=${encodeURIComponent(licenseKeyId)}&page%5Bsize%5D=25`,
        { headers },
      ),
      fetch(`https://api.lemonsqueezy.com/v1/license-keys/${encodeURIComponent(licenseKeyId)}`, { headers }),
    ]);

    const instancesData: any = await instancesResponse.json().catch(() => null);
    const keyData: any = await keyResponse.json().catch(() => null);

    const devices: DeviceRow[] = Array.isArray(instancesData?.data)
      ? instancesData.data.map((row: any) => ({
          id: String(row?.attributes?.identifier ?? row?.id ?? ''),
          name: String(row?.attributes?.name ?? 'Unknown device'),
          createdAt: String(row?.attributes?.created_at ?? ''),
        })).filter((row: DeviceRow) => row.id !== '')
      : [];

    const limitRaw = Number(keyData?.data?.attributes?.activation_limit);
    const usageRaw = Number(
      keyData?.data?.attributes?.instances_count ?? keyData?.data?.attributes?.activation_usage,
    );

    return res.status(200).json({
      success: true,
      devices,
      limit: Number.isFinite(limitRaw) ? limitRaw : null,
      usage: Number.isFinite(usageRaw) ? usageRaw : devices.length,
      instanceId: context?.instanceId || null,
      licenseKeyId,
    });
  } catch (error: any) {
    console.error('[billing/devices] failed', error);
    return res.status(502).json({ error: 'Device list unavailable', message: error?.message ?? 'Unknown error' });
  }
}
