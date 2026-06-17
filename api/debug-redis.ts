const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

export default async function handler(req: any, res: any) {
  try {
    // Test SET
    const setResult = await fetch(UPSTASH_URL!, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${UPSTASH_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(['SET', 'debug-test', 'hello-world']),
    });
    const setJson = await setResult.json();

    // Test GET
    const getResult = await fetch(UPSTASH_URL!, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${UPSTASH_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(['GET', 'debug-test']),
    });
    const getJson = await getResult.json();

    return res.status(200).json({
      set: setJson,
      get: getJson,
      hasUrl: !!UPSTASH_URL,
      hasToken: !!UPSTASH_TOKEN,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message });
  }
}
