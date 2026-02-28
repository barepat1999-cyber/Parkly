import { ReportType } from '../types';

/**
 * Updates confidence based on a new report
 * @param prevConfidence Previous confidence value (0.0 - 1.0)
 * @param reportType Type of report ('free' or 'occupied')
 * @param reporterWeight Weight of the reporter (default 1.0, can be adjusted based on user karma)
 * @returns New confidence value (0.0 - 1.0)
 */
export function updateConfidence(
  prevConfidence: number,
  reportType: ReportType,
  reporterWeight: number = 1.0
): number {
  const clampedPrev = Math.max(0, Math.min(1, prevConfidence));
  const clampedWeight = Math.max(0, Math.min(2, reporterWeight)); // Max 2x weight

  if (reportType === 'free') {
    // Free reports increase confidence
    // Formula: move towards 1.0 based on weight
    const increment = (1 - clampedPrev) * 0.2 * clampedWeight;
    return Math.min(1.0, clampedPrev + increment);
  } else {
    // Occupied reports decrease confidence
    // Formula: move towards 0.0 based on weight
    const decrement = clampedPrev * 0.3 * clampedWeight;
    return Math.max(0.0, clampedPrev - decrement);
  }
}

/**
 * Decays confidence over time
 * @param confidence Current confidence value (0.0 - 1.0)
 * @param minutesSinceUpdate Minutes since last update
 * @returns Decayed confidence value
 */
export function decayConfidence(
  confidence: number,
  minutesSinceUpdate: number
): number {
  const clampedConfidence = Math.max(0, Math.min(1, confidence));
  
  // Exponential decay: confidence decreases faster as time passes
  // After 20 minutes, confidence is halved
  // After 40 minutes, confidence is quartered
  const decayRate = 0.5; // Half-life in terms of decay factor
  const halfLifeMinutes = 20;
  
  const decayFactor = Math.pow(decayRate, minutesSinceUpdate / halfLifeMinutes);
  return clampedConfidence * decayFactor;
}

/**
 * Computes spot status based on confidence and time since last update
 * @param confidence Current confidence value (0.0 - 1.0)
 * @param lastUpdated Timestamp of last update
 * @param now Current timestamp
 * @returns Spot status
 */
export function computeStatus(
  confidence: number,
  lastUpdated: Date,
  now: Date = new Date()
): 'likely_free' | 'uncertain' | 'occupied' {
  const minutesSinceUpdate = (now.getTime() - lastUpdated.getTime()) / (1000 * 60);
  const decayedConfidence = decayConfidence(confidence, minutesSinceUpdate);

  if (decayedConfidence >= 0.65 && minutesSinceUpdate <= 10) {
    return 'likely_free';
  } else if (decayedConfidence < 0.4 || minutesSinceUpdate > 20) {
    return 'occupied';
  } else {
    return 'uncertain';
  }
}

/**
 * Gets color for a spot status
 */
export function getStatusColor(status: 'likely_free' | 'uncertain' | 'occupied'): string {
  switch (status) {
    case 'likely_free':
      return '#4CAF50'; // Green
    case 'uncertain':
      return '#FFC107'; // Yellow/Amber
    case 'occupied':
      return '#F44336'; // Red
    default:
      return '#9E9E9E'; // Gray
  }
}
