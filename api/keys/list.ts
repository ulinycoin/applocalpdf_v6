/**
 * Lists the API keys of the caller.
 *
 * The Upstash access is inlined on purpose: Vercel's frameworkless builder ships only the entry file of
 * a function, so `import { listApiKeys } from '../../src/core/api/api-key-manager'` compiled fine and
 * then failed at runtime with ERR_MODULE_NOT_FOUND (this route never worked in production).
 */

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

type ApiKeyRecord = {
  id: string;
  keyPrefix: string;
  name: string;
  tier: string;
  createdAt: string;
  lastUsedAt: string | null;
  requestsToday: number;
};

async function redis(command: string[]): Promise<any> {
  if (!UPSTASH_URL || !UPSTASH_TOKEN) {
    throw new Error('Redis not configured');
  }
  const res = await fetch(UPSTASH_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${UPSTASH_TOKEN}`,
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

async function listApiKeys(userId: string): Promise<ApiKeyRecord[]> {
  const all = (await redis(['HGETALL', `apikeys:${userId}`]))?.result;
  if (!all || typeof all !== 'object') return [];
  return Object.values(all).map((json) => JSON.parse(json as string) as ApiKeyRecord);
}

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
      keys: keys.map((k) => ({
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
