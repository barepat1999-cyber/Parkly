import AsyncStorage from '@react-native-async-storage/async-storage';

const LAST_REPORT_KEY = '@parkly/last_report';
const COOLDOWN_MS = 60 * 1000;

function toSpotKey(lat: number, lon: number): string {
  return `${Math.round(lat * 10000) / 10000},${Math.round(lon * 10000) / 10000}`;
}

/** Check if user can report at this spot. Returns true if allowed. */
export async function canReportAtSpot(lat: number, lon: number): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(LAST_REPORT_KEY);
    if (!raw) return true;
    const { spotKey: lastSpot, timestamp } = JSON.parse(raw) as {
      spotKey?: string;
      timestamp?: number;
    };
    if (!lastSpot || !timestamp) return true;
    const key = toSpotKey(lat, lon);
    if (lastSpot !== key) return true;
    return Date.now() - timestamp >= COOLDOWN_MS;
  } catch {
    return true;
  }
}

/** Record that user reported at this spot. Call after successful report. */
export async function recordReportAtSpot(lat: number, lon: number): Promise<void> {
  await AsyncStorage.setItem(
    LAST_REPORT_KEY,
    JSON.stringify({ spotKey: toSpotKey(lat, lon), timestamp: Date.now() })
  );
}
