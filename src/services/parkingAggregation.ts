import { ParkingSpot, LegacyParkingReport, AggregatedStatus } from '../types/parking';

export function aggregateReports(
  spots: ParkingSpot[],
  reports: LegacyParkingReport[],
  windowMinutes: number = 15
): AggregatedStatus[] {
  const now = Date.now();
  const windowMs = windowMinutes * 60 * 1000;

  return spots.map((spot) => {
    // Filter reports for this spot within time window
    const relevantReports = reports.filter(
      (report) =>
        report.spotId === spot.id &&
        now - report.createdAt <= windowMs
    );

    if (relevantReports.length === 0) {
      return {
        spotId: spot.id,
        status: 'unknown',
        confidence: 0,
      };
    }

    // Calculate score: positive = free, negative = occupied
    let score = 0;
    let newestReportTime = 0;

    for (const report of relevantReports) {
      if (report.status === 'free') {
        score += 1;
      } else {
        score -= 1;
      }
      if (report.createdAt > newestReportTime) {
        newestReportTime = report.createdAt;
      }
    }

    // Determine status
    let status: 'free' | 'occupied' | 'unknown';
    if (score > 0) {
      status = 'free';
    } else if (score < 0) {
      status = 'occupied';
    } else {
      status = 'unknown';
    }

    // Calculate confidence: min(1, countReports / 5)
    const confidence = Math.min(1, relevantReports.length / 5);

    return {
      spotId: spot.id,
      status,
      confidence,
      lastUpdatedAt: newestReportTime,
    };
  });
}
