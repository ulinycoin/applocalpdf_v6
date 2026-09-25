/**
 * Free-tier daily file allowance. Counts what the user actually moves through the product:
 * files brought in (`processed`) and files taken out (`downloaded`). Both are capped at the same
 * number per day, for the free plan only.
 */
export const FREE_DAILY_FILE_LIMIT = 3;

export type DailyFileQuotaKind = 'processed' | 'downloaded';

interface DailyFileQuotaRecord {
  date: string;
  processed: number;
  downloaded: number;
}

export interface DailyFileQuotaCheck {
  allowed: boolean;
  kind: DailyFileQuotaKind;
  limit: number;
  used: number;
  requested: number;
  remaining: number;
}

const STORAGE_KEY = 'localpdf_daily_files';

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function emptyRecord(date: string): DailyFileQuotaRecord {
  return { date, processed: 0, downloaded: 0 };
}

function readRecord(): DailyFileQuotaRecord {
  const date = today();
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (!raw) {
      return emptyRecord(date);
    }
    const parsed = JSON.parse(raw) as Partial<DailyFileQuotaRecord>;
    if (parsed.date !== date) {
      return emptyRecord(date);
    }
    return {
      date,
      processed: Number.isFinite(parsed.processed) ? Number(parsed.processed) : 0,
      downloaded: Number.isFinite(parsed.downloaded) ? Number(parsed.downloaded) : 0,
    };
  } catch {
    return emptyRecord(date);
  }
}

function writeRecord(record: DailyFileQuotaRecord): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(record));
  } catch {
    /* best-effort: private mode or blocked storage must not break the app */
  }
}

export function getDailyFileUsage(kind: DailyFileQuotaKind): number {
  return readRecord()[kind];
}

export function checkDailyFileQuota(kind: DailyFileQuotaKind, requested = 1): DailyFileQuotaCheck {
  const used = getDailyFileUsage(kind);
  const remaining = Math.max(0, FREE_DAILY_FILE_LIMIT - used);
  return {
    allowed: requested > 0 && used + requested <= FREE_DAILY_FILE_LIMIT,
    kind,
    limit: FREE_DAILY_FILE_LIMIT,
    used,
    requested,
    remaining,
  };
}

export function consumeDailyFileQuota(kind: DailyFileQuotaKind, count = 1): void {
  if (count <= 0) {
    return;
  }
  const record = readRecord();
  record[kind] += count;
  writeRecord(record);
}

export function dailyFileQuotaMessage(kind: DailyFileQuotaKind, requested = 1): string {
  const check = checkDailyFileQuota(kind, requested);
  const left = check.remaining;
  const leftLabel = left === 1 ? '1 file' : `${left} files`;

  if (kind === 'processed') {
    return left === 0
      ? `Free includes ${FREE_DAILY_FILE_LIMIT} files per day and you have added all of them today. Upgrade to Pro for unlimited files.`
      : `Free includes ${FREE_DAILY_FILE_LIMIT} files per day — ${leftLabel} left today. Upgrade to Pro for unlimited files.`;
  }

  return left === 0
    ? `Free includes ${FREE_DAILY_FILE_LIMIT} downloads per day and you have used all of them today. Upgrade to Pro for unlimited downloads.`
    : `Free includes ${FREE_DAILY_FILE_LIMIT} downloads per day — ${leftLabel} left today. Upgrade to Pro for unlimited downloads.`;
}

/** Test seam: clears today's counters. */
export function resetDailyFileQuota(): void {
  try {
    globalThis.localStorage?.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
