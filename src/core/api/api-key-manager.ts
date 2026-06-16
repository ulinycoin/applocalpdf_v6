import { Redis } from '@upstash/redis';
import { randomBytes, createHash } from 'node:crypto';

let redis: Redis | null = null;

function getRedis(): Redis {
  if (!redis) {
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    if (!url || !token) {
      throw new Error('UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be set');
    }
    redis = new Redis({ url, token });
  }
  return redis;
}

export interface ApiKeyRecord {
  id: string;
  keyHash: string;
  keyPrefix: string;
  name: string;
  createdAt: string;
  lastUsedAt?: string;
  tier: 'free' | 'pro' | 'team';
  requestsToday: number;
  requestsResetAt: string;
}

const KEY_PREFIX = 'lp_live_';
const KEY_LENGTH = 48;
const FREE_DAILY_LIMIT = 10;
const PRO_DAILY_LIMIT = 1000;
const TEAM_DAILY_LIMIT = 5000;

function generateApiKey(): string {
  const bytes = randomBytes(KEY_LENGTH);
  return KEY_PREFIX + bytes.toString('base64url');
}

function hashKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

function getDailyLimit(tier: ApiKeyRecord['tier']): number {
  switch (tier) {
    case 'team': return TEAM_DAILY_LIMIT;
    case 'pro': return PRO_DAILY_LIMIT;
    case 'free': return FREE_DAILY_LIMIT;
  }
}

export async function createApiKey(
  userId: string,
  name: string,
  tier: ApiKeyRecord['tier'] = 'free'
): Promise<{ key: string; record: ApiKeyRecord }> {
  const key = generateApiKey();
  const keyHash = hashKey(key);
  const keyPrefix = key.slice(0, 12) + '...';
  const now = new Date().toISOString();
  const tomorrow = new Date(Date.now() + 86400000).toISOString();

  const record: ApiKeyRecord = {
    id: `key_${randomBytes(8).toString('hex')}`,
    keyHash,
    keyPrefix,
    name,
    createdAt: now,
    tier,
    requestsToday: 0,
    requestsResetAt: tomorrow,
  };

  await getRedis().hset(`apikeys:${userId}`, { [keyHash]: JSON.stringify(record) });
  await getRedis().set(`apikey:${keyHash}`, userId, { ex: 365 * 86400 });

  return { key, record };
}

export async function validateApiKey(
  key: string
): Promise<{ valid: boolean; userId?: string; record?: ApiKeyRecord; error?: string }> {
  if (!key.startsWith(KEY_PREFIX)) {
    return { valid: false, error: 'Invalid key format' };
  }

  const keyHash = hashKey(key);
  const userId = await getRedis().get<string>(`apikey:${keyHash}`);

  if (!userId) {
    return { valid: false, error: 'Key not found' };
  }

  const recordJson = await getRedis().hget<string>(`apikeys:${userId}`, keyHash);
  if (!recordJson) {
    return { valid: false, error: 'Key record not found' };
  }

  const record = JSON.parse(recordJson) as ApiKeyRecord;

  const now = new Date();
  const resetAt = new Date(record.requestsResetAt);
  if (now >= resetAt) {
    record.requestsToday = 0;
    record.requestsResetAt = new Date(now.getTime() + 86400000).toISOString();
    await getRedis().hset(`apikeys:${userId}`, { [keyHash]: JSON.stringify(record) });
  }

  const dailyLimit = getDailyLimit(record.tier);
  if (record.requestsToday >= dailyLimit) {
    return { valid: false, error: 'Daily request limit exceeded' };
  }

  return { valid: true, userId, record };
}

export async function incrementUsage(
  userId: string,
  keyHash: string
): Promise<void> {
  const recordJson = await getRedis().hget<string>(`apikeys:${userId}`, keyHash);
  if (!recordJson) return;

  const record = JSON.parse(recordJson) as ApiKeyRecord;
  record.requestsToday += 1;
  record.lastUsedAt = new Date().toISOString();

  await getRedis().hset(`apikeys:${userId}`, { [keyHash]: JSON.stringify(record) });
}

export async function listApiKeys(
  userId: string
): Promise<ApiKeyRecord[]> {
  const all = await getRedis().hgetall<Record<string, string>>(`apikeys:${userId}`);
  if (!all) return [];

  return Object.values(all).map((json) => JSON.parse(json) as ApiKeyRecord);
}

export async function deleteApiKey(
  userId: string,
  keyHash: string
): Promise<boolean> {
  const exists = await getRedis().hdel(`apikeys:${userId}`, keyHash);
  await getRedis().del(`apikey:${keyHash}`);
  return exists > 0;
}
