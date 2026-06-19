const STORAGE_PREFIX = 'localpdf_usage_';

export function getDailyUsage(toolId: string): number {
  try {
    const key = `${STORAGE_PREFIX}${toolId}`;
    const raw = localStorage.getItem(key);
    if (!raw) return 0;
    const { date, count } = JSON.parse(raw);
    const today = new Date().toISOString().slice(0, 10);
    return date === today ? count : 0;
  } catch {
    return 0;
  }
}

export function incrementDailyUsage(toolId: string): void {
  try {
    const key = `${STORAGE_PREFIX}${toolId}`;
    const today = new Date().toISOString().slice(0, 10);
    localStorage.setItem(key, JSON.stringify({ date: today, count: getDailyUsage(toolId) + 1 }));
  } catch {
    /* best-effort */
  }
}

export const FREE_TOOL_DAILY_LIMITS: Record<string, number> = {
  'compress-pdf': 3,
  'pdf-to-jpg': 3,
  'extract-images': 3,
  'text': 3,
  'annotate': 3,
  'sign': 3,
  'whiteout': 3,
  'watermark': 3,
  'forms': 3,
  'protect': 3,
  'auto-toc': 3,
};
