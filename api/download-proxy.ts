export const config = {
  runtime: 'edge',
};

export default async function handler(request: Request) {
  // Handle preflight OPTIONS request
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  const { searchParams } = new URL(request.url);
  const fileUrl = searchParams.get('url');

  if (!fileUrl) {
    return new Response(JSON.stringify({ error: 'Missing url parameter' }), {
      status: 400,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }

  try {
    const response = await fetch(fileUrl);
    if (!response.ok) {
      return new Response(JSON.stringify({ error: `Failed to fetch remote file: ${response.statusText}` }), {
        status: response.status,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    // Stream the body directly to avoid buffering and size limit issues
    const headers = new Headers();
    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
    headers.set('Content-Type', 'application/octet-stream');
    
    const contentLen = response.headers.get('content-length');
    if (contentLen) {
      headers.set('Content-Length', contentLen);
    }

    return new Response(response.body, {
      status: 200,
      headers,
    });
  } catch (error: any) {
    console.error('Download proxy error:', error);
    return new Response(JSON.stringify({ error: error?.message || 'Proxy error' }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }
}

