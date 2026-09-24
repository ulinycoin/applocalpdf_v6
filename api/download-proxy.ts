export const config = {
  runtime: 'edge',
};

/**
 * The proxy exists only so the browser can read back an encrypted share payload from tmpfiles.org
 * without hitting CORS. It must never fetch arbitrary hosts: an open proxy turns into an
 * unauthenticated relay for third-party traffic under our domain.
 */
const ALLOWED_HOSTS = new Set(['tmpfiles.org', 'www.tmpfiles.org', 'file.tmpfiles.org']);

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function resolveAllowedTarget(rawUrl: string): URL | null {
  let target: URL;
  try {
    target = new URL(rawUrl);
  } catch {
    return null;
  }
  if (target.protocol !== 'https:') {
    return null;
  }
  if (!ALLOWED_HOSTS.has(target.hostname.toLowerCase())) {
    return null;
  }
  return target;
}

function jsonResponse(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

export default async function handler(request: Request) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: CORS_HEADERS });
  }

  const { searchParams } = new URL(request.url);
  const fileUrl = searchParams.get('url');

  if (!fileUrl) {
    return jsonResponse(400, { error: 'Missing url parameter' });
  }

  const target = resolveAllowedTarget(fileUrl);
  if (!target) {
    return jsonResponse(403, { error: 'Host is not allowed' });
  }

  try {
    const response = await fetch(target.toString());
    if (!response.ok) {
      return jsonResponse(response.status, { error: `Failed to fetch remote file: ${response.statusText}` });
    }

    // Stream the body directly to avoid buffering and size limit issues
    const headers = new Headers(CORS_HEADERS);
    headers.set('Content-Type', 'application/octet-stream');

    const contentLen = response.headers.get('content-length');
    if (contentLen) {
      headers.set('Content-Length', contentLen);
    }

    return new Response(response.body, { status: 200, headers });
  } catch (error: any) {
    console.error('Download proxy error:', error);
    return jsonResponse(500, { error: error?.message || 'Proxy error' });
  }
}
