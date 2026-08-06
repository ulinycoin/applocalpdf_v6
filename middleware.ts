// Vercel Edge Middleware for LocalPDF AI crawler markdown serving
// Matches /localpdf route and serves markdown to identified AI crawlers

// AI crawler user agent patterns to match
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

export const config = {
  matcher: ['/localpdf'],
};

export default async function middleware(request: Request): Promise<Response | undefined> {
  const userAgent = request.headers.get('user-agent') || '';

  // Non-AI UAs: continue to static HTML (Astro page)
  if (!isAICrawler(userAgent)) {
    return undefined;
  }

  // AI crawler detected: fetch and serve the markdown reference
  try {
    const url = new URL(request.url);
    url.pathname = '/localpdf-ai.md';
    const response = await fetch(url.toString(), {
      headers: {
        'User-Agent': userAgent,
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      throw new Error(`Fetch failed: ${response.status}`);
    }

    const markdown = await response.text();

    // Return markdown with required headers
    return new Response(markdown, {
      status: 200,
      headers: {
        'cache-control': 'private, no-store',
        'vary': 'User-Agent',
        'content-type': 'text/markdown; charset=utf-8',
        'x-robots-tag': 'noindex',
      },
    });
  } catch {
    // Fetch failure: fallback to static HTML (Astro page)
    return undefined;
  }
}