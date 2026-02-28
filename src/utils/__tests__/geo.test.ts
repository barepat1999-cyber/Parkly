import { distanceMeters, formatDistance } from '../geo';

describe('distanceMeters (Haversine)', () => {
  it('returns 0 when same coordinates', () => {
    const lat = 55.6761;
    const lon = 12.5683;
    expect(distanceMeters(lat, lon, lat, lon)).toBe(0);
  });

  it('returns ~111.2 km per 1 degree latitude at equator', () => {
    const d = distanceMeters(0, 0, 1, 0);
    expect(d).toBeGreaterThan(110_000);
    expect(d).toBeLessThan(112_000);
  });

  it('returns ~111 km per 1 degree longitude at mid-latitude', () => {
    const d = distanceMeters(55, 12, 55, 13);
    expect(d).toBeGreaterThan(60_000);
    expect(d).toBeLessThan(80_000);
  });

  it('returns plausible distance for Copenhagen to nearby point (~500m)', () => {
    const d = distanceMeters(55.6761, 12.5683, 55.6805, 12.5683);
    expect(d).toBeGreaterThan(400);
    expect(d).toBeLessThan(600);
  });

  it('is symmetric: dist(A,B) === dist(B,A)', () => {
    const d1 = distanceMeters(55.67, 12.56, 37.77, -122.42);
    const d2 = distanceMeters(37.77, -122.42, 55.67, 12.56);
    expect(d1).toBe(d2);
  });
});

describe('formatDistance', () => {
  it('formats < 1000m as "NN m"', () => {
    expect(formatDistance(0)).toBe('0 m');
    expect(formatDistance(50)).toBe('50 m');
    expect(formatDistance(999)).toBe('999 m');
  });

  it('formats >= 1000m as "N.N km"', () => {
    expect(formatDistance(1000)).toBe('1.0 km');
    expect(formatDistance(1500)).toBe('1.5 km');
    expect(formatDistance(8815501)).toBe('8815.5 km');
  });
});
