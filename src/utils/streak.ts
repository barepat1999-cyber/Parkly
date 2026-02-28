/**
 * Pure functions for day streak calculation.
 * Streak = consecutive days with at least one report, counting from today backwards.
 */

/** YYYY-MM-DD from timestamp (ms) */
export function dayKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Consecutive days with at least one report, counting from today backwards. */
export function computeDayStreak(reports: { createdAt: number }[]): number {
  if (reports.length === 0) return 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayMs = today.getTime();
  const daysWithReports = new Set<string>();
  for (const r of reports) {
    const key = dayKey(r.createdAt);
    const d = new Date(r.createdAt);
    d.setHours(0, 0, 0, 0);
    if (d.getTime() <= todayMs) daysWithReports.add(key);
  }
  let current = todayMs;
  let count = 0;
  const oneDay = 24 * 60 * 60 * 1000;
  while (daysWithReports.has(dayKey(current))) {
    count++;
    current -= oneDay;
  }
  return count;
}
