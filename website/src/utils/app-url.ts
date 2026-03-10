export function getAppUrl(hash?: string) {
  const configuredBase = import.meta.env.PUBLIC_APP_URL?.trim();
  const base = configuredBase || (import.meta.env.DEV ? 'http://127.0.0.1:3000/app' : '/app');

  if (!hash) {
    return base;
  }

  return `${base}#${hash}`;
}
