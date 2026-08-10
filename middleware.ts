// Vercel Edge Middleware for LocalPDF AI markdown serving
// - Accept: text/markdown on / and /localpdf -> markdown representation
// - /localpdf + AI crawler UA -> markdown (legacy UA-based behavior)
// - Everything else (browsers, Googlebot, etc.) -> canonical HTML (no cloaking)

// AI crawler user agent patterns to match (legacy UA-based behavior)
const AI_CRAWLER_PATTERNS = [
  // Major AI search/indexing bots
  /ClaudeBot/i,
  /OAI-SearchBot/i,
  /PerplexityBot/i,
  /GPTBot/i,
  /ChatGPT-User/i,

  // Additional AI crawlers commonly encountered
  /Google-Extended/i,
  /Meta-ExternalAgent/i,
  /Amazonbot/i,
  /Bytespider/i,
  /Anthropic-AI/i,
  /Cohere-ai/i,
  /Brave-Search/i,
];

// Check if the user agent matches any known AI crawler
function isAICrawler(userAgent: string): boolean {
  return AI_CRAWLER_PATTERNS.some((pattern) => pattern.test(userAgent));
}

// Check if the client explicitly requests markdown via Accept header
function wantsMarkdown(request: Request): boolean {
  const accept = request.headers.get('accept') || '';
  return accept.includes('text/markdown');
}

// Map route -> markdown asset path
function markdownAssetFor(pathname: string): string | null {
  if (pathname === '/localpdf') return '/localpdf-ai.md';
  if (pathname === '/' || pathname === '') return '/index-ai.md';
  return null;
}

export const config = {
  matcher: ['/', '/localpdf'],
};

export default async function middleware(request: Request): Promise<Response | undefined> {
  const url = new URL(request.url);
  const userAgent = request.headers.get('user-agent') || '';

  const isLocalpdfRoute = url.pathname === '/localpdf';
  const wantsMd = wantsMarkdown(request);

  // Serve markdown when:
  // 1. Client explicitly asks via Accept: text/markdown (any route in matcher), OR
  // 2. /localpdf requested by an identified AI crawler UA (legacy behavior)
  if (!wantsMd && !(isLocalpdfRoute && isAICrawler(userAgent))) {
    return undefined; // continue to static HTML (Astro page)
  }

  const asset = markdownAssetFor(url.pathname);
  if (!asset) {
    return undefined;
  }

  // Fetch and serve the markdown reference
  try {
    const fetchUrl = new URL(request.url);
    fetchUrl.pathname = asset;
    const response = await fetch(fetchUrl.toString(), {
      headers: {
        'User-Agent': userAgent,
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      throw new Error(`Fetch failed: ${response.status}`);
    }

    const markdown = await response.text();

    // Return markdown with required headers (private, no-store + Vary to avoid CDN poisoning)
    return new Response(markdown, {
      status: 200,
      headers: {
        'cache-control': 'private, no-store',
        'vary': 'Accept, User-Agent',
        'content-type': 'text/markdown; charset=utf-8',
        'x-robots-tag': 'noindex',
      },
    });
  } catch {
    // Fetch failure: fallback to static HTML (Astro page)
    return undefined;
  }
}
