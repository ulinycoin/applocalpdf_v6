import { createApiKey, type ApiKeyRecord } from '../../src/core/api/api-key-manager';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
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

  const { name, tier } = req.body || {};
  if (!name || typeof name !== 'string') {
    return res.status(400).json({ error: 'Name is required' });
  }

  try {
    const { key, record } = await createApiKey(userId, name, tier || 'free');
    return res.status(201).json({
      id: record.id,
      key,
      name: record.name,
      tier: record.tier,
      createdAt: record.createdAt,
    });
  } catch (err: any) {
    console.error('Create API key error:', err);
    return res.status(500).json({ error: 'Failed to create API key' });
  }
}
