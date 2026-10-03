/**
 * Resolve a file from `public/` against the base path the app is served from.
 *
 * The SPA is mounted at `/app` (`APP_BASE_PATH`), so a root-absolute `/fonts/x.ttf` is a 404 both in
 * the production build and in the dev server — Vite only exposes `public/` under the base path.
 */
export function resolvePublicAssetUrl(relativePath: string, baseOverride?: string): string {
  let base = baseOverride ?? '/';
  if (baseOverride === undefined) {
    try {
      const env = (import.meta as ImportMeta & { env?: { BASE_URL?: string } }).env;
      if (env?.BASE_URL) {
        base = env.BASE_URL;
      }
    } catch {
      // Non-Vite runtime (node tests, plain workers).
    }
  }
  const normalizedBase = base.endsWith('/') ? base : `${base}/`;
  return `${normalizedBase}${relativePath.replace(/^\/+/u, '')}`;
}
