import { validateApiKey, incrementUsage } from '../../src/core/api/api-key-manager';

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = req.headers?.['x-api-key'];
  if (!apiKey || typeof apiKey !== 'string') {
    return res.status(400).json({ error: 'x-api-key header required' });
  }

  try {
    const result = await validateApiKey(apiKey);
    
    if (!result.valid) {
      return res.status(401).json({ error: result.error });
    }

    await incrementUsage(result.userId!, result.record!.keyHash);

    return res.status(200).json({
      valid: true,
      tier: result.record!.tier,
      requestsToday: result.record!.requestsToday + 1,
    });
  } catch (err: any) {
    console.error('Validate API key error:', err);
    return res.status(500).json({ error: 'Validation failed' });
  }
}
