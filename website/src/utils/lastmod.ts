import manifest from '../data/lastmod.json';

/**
 * Per-URL `lastmod` for the sitemap.
 *
 * A build-date stamp on every URL ("all 35 pages changed this morning") is self-defeating: the
 * value carries no information and search engines learn to ignore it. Instead each route is dated
 * from `src/data/lastmod.json`, which `npm run seo:lastmod` regenerates from the newest commit
 * among the files listed for that route in `src/data/route-sources.json`. Regenerate the manifest
 * in the same commit as any copy change — `npm run audit:seo` warns when it goes stale.
 *
 * The manifest is a build input on purpose: this never reads git, so a production build from a
 * `.git`-less clone emits exactly the dates that were reviewed, not checkout timestamps.
 */

const ROUTE_DATES: Record<string, string> = manifest;

/**
 * Accepts the URL Astro puts in the sitemap item (or a bare pathname) and returns a date-only
 * string. Returns null when the route has no recorded date, in which case the sitemap omits
 * lastmod — an absent value is better than a fabricated one.
 */
export function lastmodForUrl(url: string): string | null {
  let pathname: string;
  try {
    pathname = new URL(url).pathname;
  } catch {
    pathname = url;
  }
  pathname = pathname.replace(/\/+$/, '') || '/';

  const date = ROUTE_DATES[pathname];
  return typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}
