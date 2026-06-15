export default async function handler(req: any, res: any) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const fileUrl = req.query.url;
  if (!fileUrl) {
    return res.status(400).json({ error: 'Missing url parameter' });
  }

  try {
    const response = await fetch(fileUrl);
    if (!response.ok) {
      return res.status(response.status).json({ error: `Failed to fetch remote file: ${response.statusText}` });
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Length', buffer.length);
    return res.status(200).send(buffer);
  } catch (error: any) {
    console.error('Download proxy error:', error);
    return res.status(500).json({ error: error?.message || 'Proxy error' });
  }
}
