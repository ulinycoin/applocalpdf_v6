/**
 * Device identity for LemonSqueezy license activations.
 *
 * LemonSqueezy only counts a device when a license is activated through its License API, and each key
 * allows three. The instance name is what the founder sees in the dashboard, so it carries a readable
 * browser/OS label plus a short slice of the stored device id.
 */

const DEVICE_ID_KEY = 'localpdf_device_id';

function readStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function getDeviceId(): string {
  const storage = readStorage();
  if (!storage) {
    return 'unknown-device';
  }

  const existing = storage.getItem(DEVICE_ID_KEY);
  if (existing && existing.trim()) {
    return existing.trim();
  }

  const generated = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `dev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

  try {
    storage.setItem(DEVICE_ID_KEY, generated);
  } catch {
    // Storage can be full or blocked; a per-session id still lets the activation succeed.
  }
  return generated;
}

function describeUserAgent(userAgent: string): { browser: string; platform: string } {
  const browser = /Edg\//.test(userAgent)
    ? 'Edge'
    : /OPR\//.test(userAgent)
      ? 'Opera'
      : /Chrome\//.test(userAgent)
        ? 'Chrome'
        : /Firefox\//.test(userAgent)
          ? 'Firefox'
          : /Safari\//.test(userAgent)
            ? 'Safari'
            : 'Browser';

  const platform = /Android/.test(userAgent)
    ? 'Android'
    : /iPhone|iPad|iPod/.test(userAgent)
      ? 'iOS'
      : /Mac OS X|Macintosh/.test(userAgent)
        ? 'macOS'
        : /Windows/.test(userAgent)
          ? 'Windows'
          : /Linux/.test(userAgent)
            ? 'Linux'
            : 'Unknown OS';

  return { browser, platform };
}

export function getDeviceInstanceName(): string {
  const userAgent = typeof navigator === 'undefined' ? '' : navigator.userAgent;
  const { browser, platform } = describeUserAgent(userAgent);
  return `LocalPDF · ${browser} on ${platform} · ${getDeviceId().slice(0, 6)}`;
}

/** Reads the activation instance this token was issued for; empty for tokens issued before devices. */
export function readInstanceIdFromToken(token: string | null | undefined): string {
  if (!token || typeof token !== 'string') {
    return '';
  }
  const parts = token.split('.');
  if (parts.length !== 3) {
    return '';
  }
  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const payload = JSON.parse(atob(padded));
    return typeof payload?.ins === 'string' ? payload.ins : '';
  } catch {
    return '';
  }
}
