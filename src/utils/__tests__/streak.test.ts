import { computeDayStreak, dayKey } from '../streak';

describe('computeDayStreak', () => {
  it('returns 0 when no reports', () => {
    expect(computeDayStreak([])).toBe(0);
  });

  it('returns 1 when reports only today', () => {
    const now = Date.now();
    expect(computeDayStreak([{ createdAt: now }])).toBe(1);
  });

  it('returns 2 when today + yesterday (not 2 days ago)', () => {
    const now = new Date();
    const todayMs = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const yesterdayMs = todayMs - 24 * 60 * 60 * 1000;
    const twoDaysAgoMs = todayMs - 2 * 24 * 60 * 60 * 1000;
    const reports = [
      { createdAt: todayMs + 1000 },
      { createdAt: yesterdayMs + 1000 },
    ];
    expect(computeDayStreak(reports)).toBe(2);
    const reportsWithGap = [
      { createdAt: todayMs + 1000 },
      { createdAt: twoDaysAgoMs + 1000 },
    ];
    expect(computeDayStreak(reportsWithGap)).toBe(1);
  });
});

describe('dayKey', () => {
  it('returns YYYY-MM-DD format', () => {
    const d = new Date(2025, 2, 15);
    expect(dayKey(d.getTime())).toBe('2025-03-15');
  });
});
