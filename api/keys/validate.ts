import { createHash } from 'node:crypto';

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

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
  const apiKey = req.headers?.['x-api-key'];
  if (!apiKey) {
    return res.status(400).json({ error: 'x-api-key header required' });
  }

  if (!apiKey.startsWith('lp_live_')) {
    return res.status(401).json({ error: 'Invalid key format' });
  }

  try {
    const keyHash = hashKey(apiKey);
    const userIdResult = await redis(['GET', `apikey:${keyHash}`]);
    const userId = userIdResult?.result;

    if (!userId) {
      return res.status(401).json({ error: 'Key not found' });
    }

    const recordResult = await redis(['HGET', `apikeys:${userId}`, keyHash]);
    const recordJson = recordResult?.result;
    if (!recordJson) {
      return res.status(401).json({ error: 'Key record not found' });
    }

    const record = JSON.parse(recordJson);

    await redis(['HSET', `apikeys:${userId}`, keyHash, JSON.stringify({
      ...record,
      requestsToday: record.requestsToday + 1,
      lastUsedAt: new Date().toISOString(),
    })]);

    return res.status(200).json({
      valid: true,
      tier: record.tier,
      requestsToday: record.requestsToday + 1,
    });
  } catch (err: any) {
    console.error('Validate API key error:', err);
    return res.status(500).json({ error: err?.message || 'Validation failed' });
  }
}
