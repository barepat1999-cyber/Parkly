import {
  updateConfidence,
  decayConfidence,
  computeStatus,
  getStatusColor,
} from '../confidence';

describe('updateConfidence', () => {
  it('should increase confidence for free reports', () => {
    const result = updateConfidence(0.5, 'free');
    expect(result).toBeGreaterThan(0.5);
    expect(result).toBeLessThanOrEqual(1.0);
  });

  it('should decrease confidence for occupied reports', () => {
    const result = updateConfidence(0.5, 'occupied');
    expect(result).toBeLessThan(0.5);
    expect(result).toBeGreaterThanOrEqual(0.0);
  });

  it('should respect weight parameter', () => {
    const normal = updateConfidence(0.5, 'free', 1.0);
    const weighted = updateConfidence(0.5, 'free', 2.0);
    expect(weighted).toBeGreaterThan(normal);
  });

  it('should clamp confidence to 0-1 range', () => {
    const maxResult = updateConfidence(1.0, 'free', 10.0);
    expect(maxResult).toBeLessThanOrEqual(1.0);
    
    const minResult = updateConfidence(0.0, 'occupied', 10.0);
    expect(minResult).toBeGreaterThanOrEqual(0.0);
  });
});

describe('decayConfidence', () => {
  it('should decrease confidence over time', () => {
    const result = decayConfidence(1.0, 20);
    expect(result).toBeLessThan(1.0);
    expect(result).toBeGreaterThan(0.0);
  });

  it('should decay more with more time passed', () => {
    const shortTime = decayConfidence(1.0, 10);
    const longTime = decayConfidence(1.0, 40);
    expect(longTime).toBeLessThan(shortTime);
  });

  it('should never go below 0', () => {
    const result = decayConfidence(0.1, 1000);
    expect(result).toBeGreaterThanOrEqual(0.0);
  });
});

describe('computeStatus', () => {
  it('should return likely_free for high confidence and recent update', () => {
    const now = new Date();
    const recent = new Date(now.getTime() - 5 * 60 * 1000); // 5 minutes ago
    const status = computeStatus(0.8, recent, now);
    expect(status).toBe('likely_free');
  });

  it('should return occupied for low confidence', () => {
    const now = new Date();
    const recent = new Date(now.getTime() - 5 * 60 * 1000);
    const status = computeStatus(0.3, recent, now);
    expect(status).toBe('occupied');
  });

  it('should return occupied for old updates', () => {
    const now = new Date();
    const old = new Date(now.getTime() - 25 * 60 * 1000); // 25 minutes ago
    const status = computeStatus(0.8, old, now);
    expect(status).toBe('occupied');
  });

  it('should return uncertain for medium confidence', () => {
    const now = new Date();
    const recent = new Date(now.getTime() - 5 * 60 * 1000);
    const status = computeStatus(0.5, recent, now);
    expect(status).toBe('uncertain');
  });
});

describe('getStatusColor', () => {
  it('should return correct colors for each status', () => {
    expect(getStatusColor('likely_free')).toBe('#4CAF50');
    expect(getStatusColor('uncertain')).toBe('#FFC107');
    expect(getStatusColor('occupied')).toBe('#F44336');
  });
});
