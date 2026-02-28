import { computeFinalStatus, SPOT_STATUS_OVERRIDE_PARAMS } from '../spotStatusOverride';
import type { ParkingReport } from '../../types/parking';

function report(status: 'available' | 'occupied', minutesAgo: number, id = 'r'): ParkingReport {
  const now = Date.now();
  return {
    id: `${id}-${status}-${minutesAgo}`,
    latitude: 55.67,
    longitude: 12.57,
    status,
    createdAt: now - minutesAgo * 60 * 1000,
  };
}

describe('computeFinalStatus', () => {
  const now = Date.now();

  it('returns latest-wins when single report', () => {
    const reports = [report('available', 1)];
    const result = computeFinalStatus(reports, now);
    expect(result.finalStatus).toBe('available');
    expect(result.debugReason).toBe('latest-wins');
  });

  it('returns latest-wins when no override rules trigger', () => {
    const reports = [
      report('available', 1),
      report('occupied', 3),
    ];
    const result = computeFinalStatus(reports, now);
    expect(result.finalStatus).toBe('available');
    expect(result.debugReason).toBe('latest-wins');
  });

  it('returns occupied-override when 2+ occupied in 10 min', () => {
    const reports = [
      report('available', 1),
      report('occupied', 3),
      report('occupied', 5),
    ];
    const result = computeFinalStatus(reports, now);
    expect(result.finalStatus).toBe('occupied');
    expect(result.debugReason).toBe('occupied-override');
  });

  it('returns free-override when 2+ free in 5 min (overrules occupied)', () => {
    const reports = [
      report('occupied', 1),
      report('available', 2),
      report('available', 3),
    ];
    const result = computeFinalStatus(reports, now);
    expect(result.finalStatus).toBe('available');
    expect(result.debugReason).toBe('free-override');
  });

  it('free-override has priority over occupied-override', () => {
    const reports = [
      report('occupied', 1),
      report('occupied', 3),
      report('available', 2),
      report('available', 4),
    ];
    const result = computeFinalStatus(reports, now);
    expect(result.finalStatus).toBe('available');
    expect(result.debugReason).toBe('free-override');
  });

  it('ignores reports outside occupied window', () => {
    const reports = [
      report('available', 1),
      report('occupied', 12),
      report('occupied', 15),
    ];
    const result = computeFinalStatus(reports, now);
    expect(result.finalStatus).toBe('available');
    expect(result.debugReason).toBe('latest-wins');
  });

  it('ignores reports outside free window', () => {
    const reports = [
      report('occupied', 1),
      report('available', 6),
      report('available', 7),
    ];
    const result = computeFinalStatus(reports, now);
    expect(result.finalStatus).toBe('occupied');
    expect(result.debugReason).toBe('latest-wins');
  });

  it('returns occupied for empty reports', () => {
    const result = computeFinalStatus([], now);
    expect(result.finalStatus).toBe('occupied');
    expect(result.debugReason).toBe('latest-wins');
  });
});
