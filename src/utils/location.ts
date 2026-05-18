import * as Location from 'expo-location';
import { Alert } from 'react-native';

const ALERT_TITLE = 'Lokation';
const ALERT_DENIED = 'Lokation er nægtet. Åbn Indstillinger og giv Parkly adgang til din position.';
const ALERT_ERROR = 'Kunne ikke hente din position – prøv igen om lidt.';

export type CurrentLocation = {
  latitude: number;
  longitude: number;
  accuracy?: number;
};

/** Valid lat: -90..90, lon: -180..180. Reject (0,0) and obviously invalid values. */
export function isValidCoordinate(lat: number, lon: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    lat >= -90 &&
    lat <= 90 &&
    lon >= -180 &&
    lon <= 180 &&
    !(Math.abs(lat) < 1e-6 && Math.abs(lon) < 1e-6)
  );
}

export type GetCurrentLocationOptions = {
  /** When true, do not show Alert on failure (e.g. for optional distance display) */
  silent?: boolean;
};

export async function getCurrentLocation(
  options?: GetCurrentLocationOptions
): Promise<CurrentLocation | null> {
  const silent = options?.silent ?? false;
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      if (!silent) Alert.alert(ALERT_TITLE, ALERT_DENIED, [{ text: 'OK' }]);
      return null;
    }
    const loc = await Location.getCurrentPositionAsync({});
    const lat = loc.coords.latitude;
    const lon = loc.coords.longitude;
    if (!isValidCoordinate(lat, lon)) {
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        console.warn('[location] Invalid coords from getCurrentPositionAsync:', lat, lon);
      }
      return null;
    }
    return {
      latitude: lat,
      longitude: lon,
      accuracy: loc.coords.accuracy ?? undefined,
    };
  } catch (e) {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.warn('[location] getCurrentLocation failed:', e);
    }
    if (!silent) Alert.alert(ALERT_TITLE, ALERT_ERROR, [{ text: 'OK' }]);
    return null;
  }
}
