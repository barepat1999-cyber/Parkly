import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import * as Location from 'expo-location';
import type { LocationObject } from 'expo-location';
import { isValidCoordinate } from '../utils/location';

export type MapDrivingCoords = {
  latitude: number;
  longitude: number;
  accuracy?: number;
};

function lerpAngleDeg(prev: number | null, next: number, t: number): number {
  if (prev == null || Number.isNaN(prev)) return next;
  let diff = next - prev;
  while (diff > 180) diff -= 360;
  while (diff < -180) diff += 360;
  return prev + diff * t;
}

const EMA_POS = 0.34;
const EMA_HEADING = 0.24;
/** Below this speed (m/s), keep last heading to reduce jitter when stationary */
const STATIONARY_SPEED_MS = 0.55;

/**
 * Foreground watch while Map tab is focused: smoothed position + heading for driving UI.
 * Uses expo-location `watchPositionAsync` with `BestForNavigation` and `LocationObject.coords.heading`.
 */
export function useMapDrivingLocation(): {
  coords: MapDrivingCoords | null;
  headingDeg: number | null;
  /** Speed in m/s from last fix (null if unknown). */
  speedMps: number | null;
  /** null = permission check not finished yet (avoids overlay flash) */
  permissionGranted: boolean | null;
  refreshForegroundPermission: () => Promise<void>;
} {
  const [coords, setCoords] = useState<MapDrivingCoords | null>(null);
  const [headingDeg, setHeadingDeg] = useState<number | null>(null);
  const [speedMps, setSpeedMps] = useState<number | null>(null);
  const [permissionGranted, setPermissionGranted] = useState<boolean | null>(null);
  const [watchKey, setWatchKey] = useState(0);

  const smoothLat = useRef<number | null>(null);
  const smoothLon = useRef<number | null>(null);
  const smoothHeading = useRef<number | null>(null);

  const onLocation = useCallback((loc: LocationObject) => {
    const lat = loc.coords.latitude;
    const lon = loc.coords.longitude;
    if (!isValidCoordinate(lat, lon)) return;

    if (smoothLat.current == null || smoothLon.current == null) {
      smoothLat.current = lat;
      smoothLon.current = lon;
    } else {
      smoothLat.current = EMA_POS * lat + (1 - EMA_POS) * smoothLat.current;
      smoothLon.current = EMA_POS * lon + (1 - EMA_POS) * smoothLon.current;
    }

    const speed = loc.coords.speed;
    const headingRaw = loc.coords.heading;
    const moving =
      speed != null && !Number.isNaN(speed) && speed >= STATIONARY_SPEED_MS;

    if (moving && headingRaw != null && headingRaw >= 0) {
      smoothHeading.current = lerpAngleDeg(smoothHeading.current, headingRaw, EMA_HEADING);
    }

    const sp = loc.coords.speed;
    setSpeedMps(sp != null && !Number.isNaN(sp) ? sp : null);

    setCoords({
      latitude: smoothLat.current,
      longitude: smoothLon.current,
      accuracy: loc.coords.accuracy ?? undefined,
    });
    setHeadingDeg(smoothHeading.current);
  }, []);

  const refreshForegroundPermission = useCallback(async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    const ok = status === 'granted';
    setPermissionGranted(ok);
    if (ok) setWatchKey((k) => k + 1);
  }, []);

  useFocusEffect(
    useCallback(() => {
      let sub: Location.LocationSubscription | null = null;
      let cancelled = false;

      (async () => {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (cancelled) return;
        if (status !== 'granted') {
          setPermissionGranted(false);
          return;
        }
        setPermissionGranted(true);

        try {
          sub = await Location.watchPositionAsync(
            {
              accuracy: Location.Accuracy.BestForNavigation,
              timeInterval: 1000,
              distanceInterval: 5,
            },
            (loc) => {
              if (!cancelled) onLocation(loc);
            }
          );
        } catch {
          setPermissionGranted(false);
        }
      })();

      return () => {
        cancelled = true;
        smoothLat.current = null;
        smoothLon.current = null;
        smoothHeading.current = null;
        sub?.remove();
      };
    }, [onLocation, watchKey])
  );

  return { coords, headingDeg, speedMps, permissionGranted, refreshForegroundPermission };
}
