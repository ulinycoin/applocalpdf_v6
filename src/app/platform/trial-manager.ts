const TRIAL_STORAGE_KEY = 'localpdf_trial_start';
const TRIAL_STATE_KEY = 'localpdf_trial_state';
const TRIAL_DURATION_MS = 3 * 24 * 60 * 60 * 1000; // 3 дня

const DB_NAME = 'localpdf_db';
const STORE_NAME = 'trial_store';
const KEY_START_TIME = 'trial_start_time';

export interface TrialState {
  isActive: boolean;
  startedAt: number | null;
  endsAt: number | null;
  daysRemaining: number;
  hoursRemaining: number;
  isExpiredButNotTracked: boolean;
}

// Инициализация IndexedDB
async function initDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      return reject(new Error('IndexedDB is not supported'));
    }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function dbGet(key: string): Promise<any> {
  try {
    const db = await initDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

async function dbSet(key: string, value: any): Promise<void> {
  try {
    const db = await initDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(value, key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {
    // Игнорируем ошибки записи в приватном режиме браузера
  }
}

// Синхронизация LocalStorage и IndexedDB (вызывается один раз при старте приложения)
export async function syncTrialStateWithIndexedDB(): Promise<void> {
  if (typeof window === 'undefined' || !window.indexedDB) return;

  const localVal = localStorage.getItem(TRIAL_STORAGE_KEY);
  const dbVal = await dbGet(KEY_START_TIME);

  if (dbVal === -1) {
    // Триал уже был сконвертирован/завершен, стираем локальные данные
    if (localVal) {
      localStorage.removeItem(TRIAL_STORAGE_KEY);
      localStorage.removeItem(TRIAL_STATE_KEY);
    }
    return;
  }

  if (localVal && !dbVal) {
    await dbSet(KEY_START_TIME, Number(localVal));
  } else if (!localVal && dbVal) {
    localStorage.setItem(TRIAL_STORAGE_KEY, String(dbVal));
  }
}

// Получить текущее состояние триала
export function getTrialState(): TrialState {
  if (typeof localStorage === 'undefined') {
    return { isActive: false, startedAt: null, endsAt: null, daysRemaining: 0, hoursRemaining: 0, isExpiredButNotTracked: false };
  }

  const stateVal = localStorage.getItem(TRIAL_STATE_KEY);
  const raw = localStorage.getItem(TRIAL_STORAGE_KEY);

  if (stateVal === 'expired') {
    return {
      isActive: false,
      startedAt: raw ? Number(raw) : null,
      endsAt: raw ? Number(raw) + TRIAL_DURATION_MS : null,
      daysRemaining: 0,
      hoursRemaining: 0,
      isExpiredButNotTracked: true,
    };
  }

  if (!raw) {
    return { isActive: false, startedAt: null, endsAt: null, daysRemaining: 0, hoursRemaining: 0, isExpiredButNotTracked: false };
  }

  const startedAt = Number(raw);
  if (Number.isNaN(startedAt)) {
    localStorage.removeItem(TRIAL_STORAGE_KEY);
    return { isActive: false, startedAt: null, endsAt: null, daysRemaining: 0, hoursRemaining: 0, isExpiredButNotTracked: false };
  }

  const endsAt = startedAt + TRIAL_DURATION_MS;
  const now = Date.now();

  if (now >= endsAt) {
    localStorage.setItem(TRIAL_STATE_KEY, 'expired');
    return {
      isActive: false,
      startedAt,
      endsAt,
      daysRemaining: 0,
      hoursRemaining: 0,
      isExpiredButNotTracked: true,
    };
  }

  const remaining = endsAt - now;
  return {
    isActive: true,
    startedAt,
    endsAt,
    daysRemaining: Math.floor(remaining / (24 * 60 * 60 * 1000)),
    hoursRemaining: Math.floor((remaining % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000)),
    isExpiredButNotTracked: false,
  };
}

export function startTrial(): TrialState {
  const now = Date.now();
  localStorage.setItem(TRIAL_STORAGE_KEY, String(now));
  localStorage.removeItem(TRIAL_STATE_KEY);
  dbSet(KEY_START_TIME, now).catch(() => {});
  return getTrialState();
}

export function markTrialTracked(): void {
  localStorage.removeItem(TRIAL_STORAGE_KEY);
  localStorage.removeItem(TRIAL_STATE_KEY);
  dbSet(KEY_START_TIME, -1).catch(() => {}); // Помечаем как закрытый триал
}

export function isTrialActive(): boolean {
  return getTrialState().isActive;
}
