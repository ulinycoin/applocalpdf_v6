import { APP_BASE_PATH, buildAppPath, getAppOriginUrl, resolveAppRoute } from '../../../shared/app-routes';

export function getAppUrl(target?: string, params?: Record<string, string>) {
  const configuredBase = import.meta.env.PUBLIC_APP_URL?.trim();
  let url: string;
  if (configuredBase) {
    const base = configuredBase.endsWith('/') ? configuredBase.slice(0, -1) : configuredBase;
    if (base.endsWith(APP_BASE_PATH)) {
      url = `${base}${resolveAppRoute(target)}`;
    } else {
      url = `${base}${buildAppPath(target)}`;
    }
  } else {
    url = import.meta.env.DEV ? getAppOriginUrl(target) : buildAppPath(target);
  }

  if (params && Object.keys(params).length > 0) {
    const qs = new URLSearchParams(params).toString();
    url = `${url}?${qs}`;
  }

  return url;
}
