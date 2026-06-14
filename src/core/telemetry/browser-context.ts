import type { RunnerTelemetryEvent } from '../types/contracts';

const FLOW_ID_KEY = 'localpdf.flow_id';
const ENTRY_URL_KEY = 'localpdf.entry_url';
const ENTRY_PATH_KEY = 'localpdf.entry_path';
const ENTRY_REFERRER_KEY = 'localpdf.entry_referrer';
const ENTRY_REFERRING_DOMAIN_KEY = 'localpdf.entry_referring_domain';
const ENTRY_UTM_SOURCE_KEY = 'localpdf.entry_utm_source';
const ENTRY_UTM_MEDIUM_KEY = 'localpdf.entry_utm_medium';
const ENTRY_UTM_CAMPAIGN_KEY = 'localpdf.entry_utm_campaign';

function safeSessionStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function normalizeHash(hash: string): string {
  const clean = hash.replace(/^#/, '').trim();
  if (!clean) return '';
  return clean.startsWith('/') ? clean : `/${clean}`;
}

export function normalizeCanonicalPath(pathname: string, hash = ''): string {
  if (pathname === '/app' && hash) {
    return `/app${normalizeHash(hash)}`;
  }
  return pathname || '/';
}

export function getOrCreateFlowId(): string {
  const storage = safeSessionStorage();
  const existing = storage?.getItem(FLOW_ID_KEY);
  if (existing) return existing;
  const created = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `flow_${Math.random().toString(36).slice(2, 10)}`;
  storage?.setItem(FLOW_ID_KEY, created);
  return created;
}

export function ensureEntryAttribution(): Record<string, string> | null {
  if (typeof window === 'undefined') return null;
  const storage = safeSessionStorage();
  if (!storage) return null;

  const url = new URL(window.location.href);
  const entryUrl = storage.getItem(ENTRY_URL_KEY) ?? url.href;
  const entryPath = storage.getItem(ENTRY_PATH_KEY) ?? normalizeCanonicalPath(url.pathname, url.hash);
  const referrer = storage.getItem(ENTRY_REFERRER_KEY) ?? document.referrer ?? '$direct';
  const referringDomain = storage.getItem(ENTRY_REFERRING_DOMAIN_KEY)
    ?? (() => {
      try {
        return referrer && referrer !== '$direct' ? new URL(referrer).origin : '$direct';
      } catch {
        return '$direct';
      }
    })();
  const utmSource = storage.getItem(ENTRY_UTM_SOURCE_KEY) ?? url.searchParams.get('utm_source') ?? '';
  const utmMedium = storage.getItem(ENTRY_UTM_MEDIUM_KEY) ?? url.searchParams.get('utm_medium') ?? '';
  const utmCampaign = storage.getItem(ENTRY_UTM_CAMPAIGN_KEY) ?? url.searchParams.get('utm_campaign') ?? '';

  storage.setItem(ENTRY_URL_KEY, entryUrl);
  storage.setItem(ENTRY_PATH_KEY, entryPath);
  storage.setItem(ENTRY_REFERRER_KEY, referrer || '$direct');
  storage.setItem(ENTRY_REFERRING_DOMAIN_KEY, referringDomain || '$direct');
  if (utmSource) storage.setItem(ENTRY_UTM_SOURCE_KEY, utmSource);
  if (utmMedium) storage.setItem(ENTRY_UTM_MEDIUM_KEY, utmMedium);
  if (utmCampaign) storage.setItem(ENTRY_UTM_CAMPAIGN_KEY, utmCampaign);

  return {
    entryUrl,
    entryPath,
    referrer: referrer || '$direct',
    referringDomain: referringDomain || '$direct',
    utmSource,
    utmMedium,
    utmCampaign,
  };
}

export function getTelemetryBrowserContext(): Record<string, string | number | boolean | null> {
  if (typeof window === 'undefined') return {};
  const url = new URL(window.location.href);
  const entry = ensureEntryAttribution();
  return {
    flow_id: getOrCreateFlowId(),
    current_url: url.href,
    current_pathname: url.pathname,
    canonical_path: normalizeCanonicalPath(url.pathname, url.hash),
    route_hash: url.hash || '',
    is_hash_route: Boolean(url.hash),
    entry_url: entry?.entryUrl ?? null,
    entry_path: entry?.entryPath ?? null,
    entry_referrer: entry?.referrer ?? '$direct',
    entry_referring_domain: entry?.referringDomain ?? '$direct',
    entry_utm_source: entry?.utmSource ?? null,
    entry_utm_medium: entry?.utmMedium ?? null,
    entry_utm_campaign: entry?.utmCampaign ?? null,
  };
}


