import { listApiKeys } from '../../src/core/api/api-key-manager';

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authHeader = req.headers?.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authorization required' });
  }

  const jwt = authHeader.slice(7);
  let userId: string;
  try {
    const payload = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString());
    userId = payload.sub || payload.iss || 'anonymous';
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }

  try {
    const keys = await listApiKeys(userId);
    return res.status(200).json({
      keys: keys.map(k => ({
        id: k.id,
        prefix: k.keyPrefix,
        name: k.name,
        tier: k.tier,
        createdAt: k.createdAt,
        lastUsedAt: k.lastUsedAt,
        requestsToday: k.requestsToday,
      })),
    });
  } catch (err: any) {
    console.error('List API keys error:', err);
    return res.status(500).json({ error: 'Failed to list API keys' });
  }
}
