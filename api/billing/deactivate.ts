import {
  authenticateLicenseToken,
  getClientIp,
  hitDeviceRateLimit,
  resolveLicenseKeyFromRequest,
} from '../../server/billing/device-auth';

/**
 * Frees one activation slot. Without this a customer who reinstalled a browser (and therefore lost the
 * instance id) could never get back in once the key's activation limit was reached.
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

  if (hitDeviceRateLimit(`deactivate:${getClientIp(req)}`)) {
    return res.status(429).json({ error: 'Too many requests. Please try again later.' });
  }

  const context = token ? authenticateLicenseToken(token) : null;
  if (token && !context) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  const licenseKey = context?.licenseKey || licenseKeyInput;
  const requested = typeof req.body?.instanceId === 'string' ? req.body.instanceId.trim() : '';
  const instanceId = requested || context?.instanceId || '';
  if (!instanceId) {
    return res.status(400).json({ error: 'This device is not registered on the license' });
  }

  try {
    const response = await fetch('https://api.lemonsqueezy.com/v1/licenses/deactivate', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        license_key: licenseKey,
        instance_id: instanceId,
      }).toString(),
    });

    const data: any = await response.json().catch(() => null);
    if (!data?.deactivated) {
      console.warn('[billing/deactivate] rejected', response.status, data?.error ?? '');
      return res.status(502).json({
        error: 'deactivation_failed',
        details: data?.error ?? 'LemonSqueezy rejected the deactivation',
      });
    }

    const usage = Number(data?.license_key?.activation_usage);
    const limit = Number(data?.license_key?.activation_limit);
    return res.status(200).json({
      success: true,
      deactivatedInstanceId: instanceId,
      wasCurrentDevice: Boolean(context?.instanceId) && instanceId === context?.instanceId,
      usage: Number.isFinite(usage) ? usage : null,
      limit: Number.isFinite(limit) ? limit : null,
    });
  } catch (error: any) {
    console.error('[billing/deactivate] failed', error);
    return res.status(502).json({ error: 'Deactivation failed', message: error?.message ?? 'Unknown error' });
  }
}
