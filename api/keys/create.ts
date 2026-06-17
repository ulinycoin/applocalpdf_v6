import { randomBytes, createHash } from 'node:crypto';

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const ADMIN_SECRET = process.env.API_ADMIN_SECRET || 'localpdf-admin-2024';

async function redis(command: string[]): Promise<any> {
  if (!UPSTASH_URL || !UPSTASH_TOKEN) {
    throw new Error('Redis not configured');
  }
  console.log(`[redis] → ${command[0]} ${command.slice(1, 3).join(' ')}...`);
  const res = await fetch(UPSTASH_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${UPSTASH_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(command),
  });
  const body = await res.json();
  if (!res.ok) {
    throw new Error(`Upstash ${res.status}: ${body?.error || JSON.stringify(body)}`);
  }
  if (body?.error) {
    throw new Error(`Upstash error: ${body.error}`);
  }
  return body;
}

function hashKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authHeader = req.headers?.authorization;
  const adminKey = req.headers?.['x-admin-key'];

  let userId: string;

  if (adminKey === ADMIN_SECRET) {
    userId = 'admin';
  } else if (authHeader?.startsWith('Bearer ')) {
    const jwt = authHeader.slice(7);
    try {
      const payload = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString());
      userId = payload.sub || payload.iss || 'anonymous';
    } catch {
      return res.status(401).json({ error: 'Invalid token' });
    }
  } else {
    return res.status(401).json({ error: 'Authorization required' });
  }

  const { name, tier } = req.body || {};
  if (!name || typeof name !== 'string') {
    return res.status(400).json({ error: 'Name is required' });
  }

  try {
    const key = 'lp_live_' + randomBytes(48).toString('base64url');
    const keyHash = hashKey(key);
    const record = {
      id: 'key_' + randomBytes(8).toString('hex'),
      keyHash,
      keyPrefix: key.slice(0, 12) + '...',
      name,
      createdAt: new Date().toISOString(),
      tier: tier || 'free',
      requestsToday: 0,
      requestsResetAt: new Date(Date.now() + 86400000).toISOString(),
    };

    console.log('Creating key:', { userId, keyHash: keyHash.slice(0, 8) + '...' });
    
    const hsetResult = await redis(['HSET', `apikeys:${userId}`, keyHash, JSON.stringify(record)]);
    console.log('HSET result:', hsetResult);
    
    const setResult = await redis(['SET', `apikey:${keyHash}`, userId, 'EX', String(365 * 86400)]);
    console.log('SET result:', setResult);

    return res.status(201).json({
      id: record.id,
      key,
      name: record.name,
      tier: record.tier,
      createdAt: record.createdAt,
    });
  } catch (err: any) {
    console.error('Create API key error:', err);
    return res.status(500).json({ error: err?.message || 'Failed to create API key' });
  }
}
