/**
 * Free-tier daily download allowance.
 *
 * Processing is free on every tool: a free user may add any number of files and run any tool.
 * The only thing capped is what leaves the product — files downloaded per day (`FREE_DAILY_FILE_LIMIT`).
 * Pro removes the cap. Never gate tool execution or adding files: that contradicts the business model
 * recorded in the project memory.
 */
export const FREE_DAILY_FILE_LIMIT = 3;

interface DailyFileQuotaRecord {
  date: string;
  downloaded: number;
}

export interface DailyFileQuotaCheck {
  allowed: boolean;
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
  return { date, downloaded: 0 };
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

export function getDailyFileUsage(): number {
  return readRecord().downloaded;
}

export function checkDailyFileQuota(requested = 1): DailyFileQuotaCheck {
  const used = getDailyFileUsage();
  return {
    allowed: requested > 0 && used + requested <= FREE_DAILY_FILE_LIMIT,
    limit: FREE_DAILY_FILE_LIMIT,
    used,
    requested,
    remaining: Math.max(0, FREE_DAILY_FILE_LIMIT - used),
  };
}

export function consumeDailyFileQuota(count = 1): void {
  if (count <= 0) {
    return;
  }
  const record = readRecord();
  record.downloaded += count;
  writeRecord(record);
}

export function dailyFileQuotaMessage(requested = 1): string {
  const left = checkDailyFileQuota(requested).remaining;
  const leftLabel = left === 1 ? '1 download' : `${left} downloads`;

  return left === 0
    ? `Free includes ${FREE_DAILY_FILE_LIMIT} downloads per day and you have used all of them today. Upgrade to Pro for unlimited downloads.`
    : `Free includes ${FREE_DAILY_FILE_LIMIT} downloads per day — ${leftLabel} left today. Upgrade to Pro for unlimited downloads.`;
}

/** Test seam: clears today's counter. */
export function resetDailyFileQuota(): void {
  try {
    globalThis.localStorage?.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
