/**
 * After a deploy the previous deployment's hashed chunks are gone, so a lazily imported feature
 * fails with "Failed to fetch dynamically imported module". Vite reports that through a
 * `vite:preloadError` event; reloading once picks up the new manifest and the tab keeps working.
 *
 * The cooldown is what keeps this from becoming a reload loop: if the bundle is genuinely broken,
 * the second failure inside the window surfaces to the user instead of refreshing forever.
 */
export const CHUNK_RELOAD_STORAGE_KEY = 'localpdf_chunk_reload_at';
export const CHUNK_RELOAD_COOLDOWN_MS = 60_000;

interface ChunkReloadTarget {
  addEventListener(type: string, listener: (event: Event) => void): void;
  removeEventListener(type: string, listener: (event: Event) => void): void;
  location: { reload: () => void };
}

interface ChunkReloadOptions {
  target?: ChunkReloadTarget;
  /** `null` when storage is unavailable (private mode, blocked cookies). */
  storage?: Pick<Storage, 'getItem' | 'setItem'> | null;
  now?: () => number;
}

function defaultStorage(): Pick<Storage, 'getItem' | 'setItem'> | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/**
 * Installs the handler and returns its uninstaller. `preventDefault()` marks the failure as handled,
 * which is what tells Vite not to throw it further.
 */
export function installChunkReload(options: ChunkReloadOptions = {}): () => void {
  const target = options.target ?? (window as unknown as ChunkReloadTarget);
  const storage = options.storage === undefined ? defaultStorage() : options.storage;
  const now = options.now ?? Date.now;
  let reloadedInThisPage = false;

  const handlePreloadError = (event: Event) => {
    if (reloadedInThisPage) {
      return;
    }
    let lastReloadAt = Number.NaN;
    try {
      lastReloadAt = Number(storage?.getItem(CHUNK_RELOAD_STORAGE_KEY) ?? Number.NaN);
    } catch { /* unreadable storage is treated as "no previous reload" */ }
    if (Number.isFinite(lastReloadAt) && now() - lastReloadAt < CHUNK_RELOAD_COOLDOWN_MS) {
      return;
    }

    reloadedInThisPage = true;
    try {
      storage?.setItem(CHUNK_RELOAD_STORAGE_KEY, String(now()));
    } catch { /* the reload below still works without the marker */ }
    event.preventDefault();
    target.location.reload();
  };

  target.addEventListener('vite:preloadError', handlePreloadError);
  return () => target.removeEventListener('vite:preloadError', handlePreloadError);
}
