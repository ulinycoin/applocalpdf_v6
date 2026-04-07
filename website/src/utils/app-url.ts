import { APP_BASE_PATH, buildAppPath, getAppOriginUrl, resolveAppRoute } from '../../../shared/app-routes';

export function getAppUrl(target?: string) {
  const configuredBase = import.meta.env.PUBLIC_APP_URL?.trim();
  const targetRoute = target ? resolveAppRoute(target).replace(/^\//, '') : '';

  if (import.meta.env.DEV) {
    return getAppOriginUrl(target);
  }

  if (target) {
    if (configuredBase) {
      const base = configuredBase.endsWith('/') ? configuredBase.slice(0, -1) : configuredBase;
      const appBase = base.endsWith(APP_BASE_PATH) ? base : `${base}${APP_BASE_PATH}`;
      return `${appBase}?tool=${encodeURIComponent(targetRoute)}`;
    }

    return `${APP_BASE_PATH}?tool=${encodeURIComponent(targetRoute)}`;
  }

  if (configuredBase) {
    const base = configuredBase.endsWith('/') ? configuredBase.slice(0, -1) : configuredBase;
    if (base.endsWith(APP_BASE_PATH)) {
      return base;
    }
    return `${base}${buildAppPath(target)}`;
  }

  return buildAppPath(target);
}
