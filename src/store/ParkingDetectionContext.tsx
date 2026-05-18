import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Alert, AppState, AppStateStatus } from 'react-native';
import * as Location from 'expo-location';
import type { LocationObject } from 'expo-location';
import type { ParkingSegment } from '../types/parkingSegment';
import type { ActiveParkingSession, ParkingBay, ParkingBayStatus } from '../types/parkingBay';
import {
  ARRIVAL_REJECT_COOLDOWN_MS,
  AUTO_RELEASE_CONSECUTIVE_UPDATES,
  DWELL_BEFORE_ARRIVAL_PROMPT_MS,
  LEAVE_PROMPT_CONSECUTIVE_UPDATES,
  LEAVE_PROMPT_COOLDOWN_MS,
  MIN_GLOBAL_ARRIVAL_PROMPT_GAP_MS,
  PARKING_DETECTION_MOCK_MODE,
} from '../constants/parkingDetection';
import {
  evaluateAutoRelease,
  findNearestBay,
  isLikelyStopped,
  isStationaryDrift,
  isWithinBayRadius,
  shouldPromptLeave,
  distanceToBay,
} from '../services/parkingDetectionManager';
import { segmentToParkingBay, centerlineMidpoint } from '../utils/parkingBayGeometry';
import {
  loadActiveSession,
  saveActiveSession,
  getArrivalCooldownUntil,
  setArrivalCooldownUntil,
} from '../services/parkingSessionManager';
import {
  configureNotificationPresentation,
  ensureNotificationPermissions,
  scheduleArrivalPrompt,
  scheduleLeavePrompt,
  addNotificationResponseListener,
  NOTIF_TYPE_ARRIVAL,
  NOTIF_TYPE_LEAVE,
} from '../services/parkingNotificationManager';
import { setParkingLocationHandler } from '../services/parkingLocationBridge';
import { PARKING_LOCATION_TASK_NAME } from '../tasks/parkingLocationTask';
import type { ParkingDetectionState } from '../types/parkingDetectionState';
import { useReportStore } from './ReportStoreContext';

export type { ParkingDetectionState };

type PermissionState = 'unknown' | 'granted' | 'denied';

type ParkingDetectionContextValue = {
  locationPermission: PermissionState;
  notificationPermission: PermissionState;
  mappedSegments: ParkingSegment[];
  setMappedSegments: (segments: ParkingSegment[]) => void;
  lastLocation: LocationObject | null;
  nearestBay: ParkingBay | null;
  detectionState: ParkingDetectionState;
  activeSession: ActiveParkingSession | null;
  /** Bay status overrides from user confirmation / release */
  bayStatusOverrides: Record<string, ParkingBayStatus>;
  askedArrivalThisStop: boolean;
  askedLeaveForActiveSession: boolean;
  mockModeEnabled: boolean;
  setMockModeEnabled: (v: boolean) => void;
  /** Stroke color for map polylines */
  getBayStrokeColor: (segmentId: string) => string;
  confirmParkingAtBay: (segment: ParkingSegment) => void;
  rejectParkingAtBay: (segment: ParkingSegment) => void;
  confirmLeftParking: () => void;
  stillParked: () => void;
  leaveParkingManually: () => void;
  resetParkingSession: () => void;
  /** Dev: simulate being near first segment */
  mockSimulateNearBay: () => void;
};

const ParkingDetectionContext = createContext<ParkingDetectionContextValue | null>(null);

function logDebug(message: string, payload?: Record<string, unknown>): void {
  if (__DEV__) {
    // eslint-disable-next-line no-console
    console.log(`[ParkingDetection] ${message}`, payload ?? '');
  }
}

export function ParkingDetectionProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const { addReport } = useReportStore();
  const [locationPermission, setLocationPermission] = useState<PermissionState>('unknown');
  const [notificationPermission, setNotificationPermission] = useState<PermissionState>('unknown');
  const [mappedSegments, setMappedSegmentsState] = useState<ParkingSegment[]>([]);
  const [lastLocation, setLastLocation] = useState<LocationObject | null>(null);
  const [nearestBay, setNearestBay] = useState<ParkingBay | null>(null);
  const [detectionState, setDetectionState] = useState<ParkingDetectionState>('idle');
  const [activeSession, setActiveSession] = useState<ActiveParkingSession | null>(null);
  const [bayStatusOverrides, setBayStatusOverrides] = useState<Record<string, ParkingBayStatus>>({});
  const [askedArrivalThisStop, setAskedArrivalThisStop] = useState(false);
  const [askedLeaveForActiveSession, setAskedLeaveForActiveSession] = useState(false);
  const [mockModeEnabled, setMockModeEnabled] = useState(PARKING_DETECTION_MOCK_MODE);

  const dwellStartMsRef = useRef<number | null>(null);
  const dwellAnchorRef = useRef<{ lat: number; lon: number } | null>(null);
  const dwellBayIdRef = useRef<string | null>(null);
  const leaveConsecutiveRef = useRef(0);
  const autoReleaseConsecutiveRef = useRef(0);
  const locationSubRef = useRef<Location.LocationSubscription | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const mappedSegmentsRef = useRef(mappedSegments);
  const activeSessionRef = useRef(activeSession);
  const bayStatusOverridesRef = useRef(bayStatusOverrides);
  const askedLeaveForActiveSessionRef = useRef(false);
  const arrivalPromptedForBayIdRef = useRef<string | null>(null);
  /** Suppresses repeated leave prompts after user taps “still parked”. */
  const leavePromptCooldownUntilMsRef = useRef(0);
  /** Minimum spacing between arrival prompts (any bay). */
  const lastGlobalArrivalPromptAtMsRef = useRef(0);
  const leftTransitionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  mappedSegmentsRef.current = mappedSegments;
  activeSessionRef.current = activeSession;
  bayStatusOverridesRef.current = bayStatusOverrides;
  askedLeaveForActiveSessionRef.current = askedLeaveForActiveSession;

  const setMappedSegments = useCallback((segments: ParkingSegment[]) => {
    setMappedSegmentsState(segments);
  }, []);

  useEffect(() => {
    configureNotificationPresentation();
    let mounted = true;
    (async () => {
      const fg = await Location.getForegroundPermissionsAsync();
      if (!mounted) return;
      setLocationPermission(fg.status === 'granted' ? 'granted' : 'denied');
      const n = await ensureNotificationPermissions();
      if (!mounted) return;
      setNotificationPermission(n ? 'granted' : 'denied');
      const s = await loadActiveSession();
      if (!mounted) return;
      if (s?.isActive) {
        setActiveSession(s);
        setDetectionState('parked');
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      appStateRef.current = next;
      if (next === 'active') {
        Location.getForegroundPermissionsAsync().then((fg) => {
          setLocationPermission(fg.status === 'granted' ? 'granted' : 'denied');
        });
      }
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    bayStatusOverridesRef.current = bayStatusOverrides;
  }, [bayStatusOverrides]);

  useEffect(() => {
    return () => {
      if (leftTransitionTimeoutRef.current) {
        clearTimeout(leftTransitionTimeoutRef.current);
        leftTransitionTimeoutRef.current = null;
      }
    };
  }, []);

  const persistSession = useCallback(async (session: ActiveParkingSession | null) => {
    setActiveSession(session);
    await saveActiveSession(session);
  }, []);

  const confirmParkingInternal = useCallback(
    async (segment: ParkingSegment) => {
      const session: ActiveParkingSession = {
        id: `sess-${Date.now()}`,
        parkingBayId: segment.id,
        startTime: Date.now(),
        isActive: true,
        confidenceScore: 0.7,
      };
      await persistSession(session);
      setBayStatusOverrides((o) => ({ ...o, [segment.id]: 'occupied' }));
      setAskedArrivalThisStop(true);
      askedLeaveForActiveSessionRef.current = false;
      setAskedLeaveForActiveSession(false);
      setDetectionState('parked');
      logDebug('parking confirmed', { bayId: segment.id });
      const anchor = centerlineMidpoint(segment.centerline);
      try {
        await addReport('occupied', anchor);
      } catch (e) {
        if (__DEV__) logDebug('addReport occupied failed', { error: String(e) });
      }
    },
    [persistSession, addReport]
  );

  const rejectParkingInternal = useCallback(async (segment: ParkingSegment) => {
    await setArrivalCooldownUntil(segment.id, Date.now() + ARRIVAL_REJECT_COOLDOWN_MS);
    setAskedArrivalThisStop(true);
    setDetectionState('near_bay');
    logDebug('parking rejected (cooldown set)', { bayId: segment.id });
  }, []);

  const transitionToLeftAfterRelease = useCallback(() => {
    askedLeaveForActiveSessionRef.current = false;
    setAskedLeaveForActiveSession(false);
    leaveConsecutiveRef.current = 0;
    autoReleaseConsecutiveRef.current = 0;
    setDetectionState('left');
    if (leftTransitionTimeoutRef.current) clearTimeout(leftTransitionTimeoutRef.current);
    leftTransitionTimeoutRef.current = setTimeout(() => {
      leftTransitionTimeoutRef.current = null;
      setDetectionState('idle');
    }, 2000);
  }, []);

  const confirmLeftInternal = useCallback(async () => {
    const session = activeSessionRef.current;
    if (!session?.isActive) return;
    const bayId = session.parkingBayId;
    const seg = mappedSegmentsRef.current.find((s) => s.id === bayId);
    const anchor = seg ? centerlineMidpoint(seg.centerline) : null;
    await persistSession(null);
    setBayStatusOverrides((o) => ({ ...o, [bayId]: 'free' }));
    logDebug('parking released (user confirmed leave)', { bayId });
    if (anchor) {
      try {
        await addReport('available', anchor);
      } catch (e) {
        if (__DEV__) logDebug('addReport available (manual leave) failed', { error: String(e) });
      }
    }
    transitionToLeftAfterRelease();
  }, [persistSession, transitionToLeftAfterRelease, addReport]);

  const stillParkedInternal = useCallback(() => {
    askedLeaveForActiveSessionRef.current = false;
    setAskedLeaveForActiveSession(false);
    leaveConsecutiveRef.current = 0;
    leavePromptCooldownUntilMsRef.current = Date.now() + LEAVE_PROMPT_COOLDOWN_MS;
    setDetectionState('parked');
    logDebug('user still parked (leave cooldown started)');
  }, []);

  const confirmParkingInternalRef = useRef(confirmParkingInternal);
  const rejectParkingInternalRef = useRef(rejectParkingInternal);
  const confirmLeftInternalRef = useRef(confirmLeftInternal);
  const stillParkedInternalRef = useRef(stillParkedInternal);
  confirmParkingInternalRef.current = confirmParkingInternal;
  rejectParkingInternalRef.current = rejectParkingInternal;
  confirmLeftInternalRef.current = confirmLeftInternal;
  stillParkedInternalRef.current = stillParkedInternal;

  useEffect(() => {
    const sub = addNotificationResponseListener((response) => {
      const data = response.notification.request.content.data as {
        type?: string;
        bayId?: string;
      };
      if (data?.type === NOTIF_TYPE_ARRIVAL && data.bayId) {
        const seg = mappedSegmentsRef.current.find((s) => s.id === data.bayId);
        if (seg) {
          Alert.alert('Parkly', 'Ser ud til at du parkerer her. Bekræfter du?', [
            { text: 'Nej', style: 'cancel', onPress: () => void rejectParkingInternalRef.current(seg) },
            { text: 'Ja', onPress: () => void confirmParkingInternalRef.current(seg) },
          ]);
        }
      }
      if (data?.type === NOTIF_TYPE_LEAVE) {
        Alert.alert('Parkly', 'Har du forladt pladsen?', [
          { text: 'Nej, stadig parkeret', style: 'cancel', onPress: () => stillParkedInternalRef.current() },
          { text: 'Ja', onPress: () => void confirmLeftInternalRef.current() },
        ]);
      }
    });
    return () => sub.remove();
  }, []);

  const confirmParkingAtBay = useCallback(
    (segment: ParkingSegment) => {
      void confirmParkingInternal(segment);
    },
    [confirmParkingInternal]
  );

  const rejectParkingAtBay = useCallback(
    (segment: ParkingSegment) => {
      void rejectParkingInternal(segment);
    },
    [rejectParkingInternal]
  );

  const confirmLeftParking = useCallback(() => {
    void confirmLeftInternal();
  }, [confirmLeftInternal]);

  const stillParked = useCallback(() => {
    stillParkedInternal();
  }, [stillParkedInternal]);

  const leaveParkingManually = useCallback(() => {
    void confirmLeftInternal();
  }, [confirmLeftInternal]);

  const resetParkingSession = useCallback(async () => {
    await persistSession(null);
    setBayStatusOverrides({});
    setAskedArrivalThisStop(false);
    askedLeaveForActiveSessionRef.current = false;
    setAskedLeaveForActiveSession(false);
    arrivalPromptedForBayIdRef.current = null;
    dwellStartMsRef.current = null;
    dwellAnchorRef.current = null;
    dwellBayIdRef.current = null;
    leaveConsecutiveRef.current = 0;
    autoReleaseConsecutiveRef.current = 0;
    leavePromptCooldownUntilMsRef.current = 0;
    lastGlobalArrivalPromptAtMsRef.current = 0;
    if (leftTransitionTimeoutRef.current) {
      clearTimeout(leftTransitionTimeoutRef.current);
      leftTransitionTimeoutRef.current = null;
    }
    setDetectionState('idle');
    logDebug('reset parking session');
  }, [persistSession]);

  const promptArrival = useCallback(
    async (segment: ParkingSegment) => {
      if (arrivalPromptedForBayIdRef.current === segment.id) return;
      const now = Date.now();
      if (now - lastGlobalArrivalPromptAtMsRef.current < MIN_GLOBAL_ARRIVAL_PROMPT_GAP_MS) {
        logDebug('arrival prompt skipped (global gap)');
        return;
      }
      const cooldown = await getArrivalCooldownUntil(segment.id);
      if (cooldown > now) {
        logDebug('arrival prompt skipped (cooldown)', { bayId: segment.id });
        return;
      }
      arrivalPromptedForBayIdRef.current = segment.id;
      lastGlobalArrivalPromptAtMsRef.current = now;
      setAskedArrivalThisStop(true);
      setDetectionState('suspected_parking');
      logDebug('arrival prompt shown', { bayId: segment.id });

      const title = 'Parkly';
      const body = 'Ser ud til at du parkerer her. Bekræfter du?';
      const runAlert = () => {
        Alert.alert(title, body, [
          { text: 'Nej', style: 'cancel', onPress: () => void rejectParkingInternal(segment) },
          { text: 'Ja', onPress: () => void confirmParkingInternal(segment) },
        ]);
      };

      if (appStateRef.current === 'active') {
        runAlert();
      } else {
        await scheduleArrivalPrompt(segment.id, segment.streetName);
      }
    },
    [confirmParkingInternal, rejectParkingInternal]
  );

  const promptLeave = useCallback(
    async (segment: ParkingSegment) => {
      if (askedLeaveForActiveSessionRef.current) return;
      const now = Date.now();
      if (now < leavePromptCooldownUntilMsRef.current) {
        logDebug('leave prompt skipped (still-parked cooldown)');
        return;
      }
      askedLeaveForActiveSessionRef.current = true;
      setAskedLeaveForActiveSession(true);
      setDetectionState('suspected_leaving');
      logDebug('leave prompt shown', { bayId: segment.id });

      const title = 'Parkly';
      const body = 'Har du forladt pladsen?';
      const runAlert = () => {
        Alert.alert(title, body, [
          { text: 'Nej, stadig parkeret', style: 'cancel', onPress: () => stillParkedInternal() },
          { text: 'Ja', onPress: () => void confirmLeftInternal() },
        ]);
      };

      if (appStateRef.current === 'active') {
        runAlert();
      } else {
        await scheduleLeavePrompt(segment.id, segment.streetName);
      }
    },
    [confirmLeftInternal, stillParkedInternal]
  );

  const promptArrivalRef = useRef(promptArrival);
  const promptLeaveRef = useRef(promptLeave);
  promptArrivalRef.current = promptArrival;
  promptLeaveRef.current = promptLeave;

  const processLocation = useCallback(
    async (loc: LocationObject) => {
      let lat = loc.coords.latitude;
      let lon = loc.coords.longitude;
      const speed = loc.coords.speed;

      const segments = mappedSegmentsRef.current;
      if (mockModeEnabled && segments.length > 0) {
        const mid = centerlineMidpoint(segments[0]!.centerline);
        lat = mid.latitude + 0.00025;
        lon = mid.longitude + 0.00025;
        logDebug('mock position applied', { lat, lon });
      }

      setLastLocation(loc);

      const session = activeSessionRef.current;
      const nearest = findNearestBay(lat, lon, segments);

      if (!nearest || !isWithinBayRadius(nearest.distanceM)) {
        dwellStartMsRef.current = null;
        dwellAnchorRef.current = null;
        dwellBayIdRef.current = null;
        arrivalPromptedForBayIdRef.current = null;
        setAskedArrivalThisStop(false);
        setNearestBay(null);
        if (!session?.isActive) {
          setDetectionState('idle');
        }
        logDebug('user left parking radius or no mapped bay', { distanceM: nearest?.distanceM });

        if (session?.isActive) {
          const seg = segments.find((s) => s.id === session.parkingBayId);
          if (seg) {
            const d = distanceToBay(lat, lon, seg);
            if (shouldPromptLeave(d)) {
              leaveConsecutiveRef.current += 1;
              logDebug('user appears outside leave zone', {
                consecutive: leaveConsecutiveRef.current,
                distanceM: d,
              });
              const canLeavePrompt =
                Date.now() >= leavePromptCooldownUntilMsRef.current &&
                leaveConsecutiveRef.current >= LEAVE_PROMPT_CONSECUTIVE_UPDATES &&
                !askedLeaveForActiveSessionRef.current;
              if (canLeavePrompt) {
                await promptLeaveRef.current(seg);
              }
            } else {
              leaveConsecutiveRef.current = 0;
            }

            const ar = evaluateAutoRelease(d, speed);
            if (ar.shouldRelease) {
              autoReleaseConsecutiveRef.current += 1;
              if (autoReleaseConsecutiveRef.current >= AUTO_RELEASE_CONSECUTIVE_UPDATES) {
                logDebug('parking released (auto-release)', {
                  bayId: session.parkingBayId,
                  confidence: ar.confidence,
                });
                const bayId = session.parkingBayId;
                const segForReport = segments.find((s) => s.id === bayId);
                const anchor = segForReport ? centerlineMidpoint(segForReport.centerline) : null;
                await persistSession(null);
                setBayStatusOverrides((o) => ({
                  ...o,
                  [bayId]: 'free',
                }));
                if (anchor) {
                  try {
                    await addReport('available', anchor);
                  } catch (e) {
                    if (__DEV__) logDebug('addReport available (auto-release) failed', { error: String(e) });
                  }
                }
                transitionToLeftAfterRelease();
              }
            } else {
              autoReleaseConsecutiveRef.current = 0;
            }
          }
        }
        return;
      }

      logDebug('user entered parking radius', {
        bayId: nearest.segment.id,
        distanceM: nearest.distanceM,
      });

      const bay = segmentToParkingBay(
        nearest.segment,
        bayStatusOverridesRef.current[nearest.segment.id] ?? 'unknown',
        activeSessionRef.current?.parkingBayId === nearest.segment.id
      );
      setNearestBay(bay);

      if (session?.isActive && session.parkingBayId === nearest.segment.id) {
        setDetectionState('parked');
        leaveConsecutiveRef.current = 0;
        return;
      }

      const stopped = isLikelyStopped(speed);
      const sameBay = dwellBayIdRef.current === nearest.segment.id;
      if (!sameBay) {
        dwellBayIdRef.current = nearest.segment.id;
        dwellStartMsRef.current = Date.now();
        dwellAnchorRef.current = { lat, lon };
        setDetectionState('near_bay');
        logDebug('near bay (dwell window started)', { bayId: nearest.segment.id });
      } else if (dwellAnchorRef.current) {
        const a = dwellAnchorRef.current;
        if (!isStationaryDrift(a.lat, a.lon, lat, lon)) {
          dwellStartMsRef.current = Date.now();
          dwellAnchorRef.current = { lat, lon };
          setDetectionState('near_bay');
          logDebug('dwell reset (movement)', { bayId: nearest.segment.id });
        }
      }

      const dwellStart = dwellStartMsRef.current;
      if (dwellStart == null || !stopped) {
        return;
      }

      const elapsed = Date.now() - dwellStart;
      if (elapsed < DWELL_BEFORE_ARRIVAL_PROMPT_MS) {
        if (!session?.isActive) setDetectionState('near_bay');
        return;
      }

      logDebug('stationary near bay (threshold met)', {
        bayId: nearest.segment.id,
        elapsedMs: elapsed,
      });
      setDetectionState('suspected_parking');
      await promptArrivalRef.current(nearest.segment);
    },
    [mockModeEnabled, persistSession, transitionToLeftAfterRelease, addReport]
  );

  const processLocationRef = useRef(processLocation);
  processLocationRef.current = processLocation;

  /** Background TaskManager callbacks use this bridge (see parkingLocationTask.ts). */
  useEffect(() => {
    setParkingLocationHandler((loc) => {
      void processLocationRef.current(loc);
    });
    return () => setParkingLocationHandler(null);
  }, []);

  /**
   * Foreground: watchPositionAsync when user only grants When-In-Use.
   * Background: startLocationUpdatesAsync + TaskManager when "Always" is granted (iOS/Android).
   */
  useEffect(() => {
    if (locationPermission !== 'granted') return;

    let cancelled = false;

    const start = async (): Promise<void> => {
      const bgPerm = await Location.requestBackgroundPermissionsAsync();
      if (cancelled) return;

      locationSubRef.current?.remove();
      locationSubRef.current = null;

      try {
        if (await Location.hasStartedLocationUpdatesAsync(PARKING_LOCATION_TASK_NAME)) {
          await Location.stopLocationUpdatesAsync(PARKING_LOCATION_TASK_NAME);
        }
      } catch {
        /* noop */
      }

      if (bgPerm.status === 'granted') {
        try {
          await Location.startLocationUpdatesAsync(PARKING_LOCATION_TASK_NAME, {
            accuracy: Location.Accuracy.Balanced,
            distanceInterval: 15,
            pausesUpdatesAutomatically: false,
            activityType: Location.ActivityType.OtherNavigation,
            showsBackgroundLocationIndicator: true,
            foregroundService: {
              notificationTitle: 'Parkly',
              notificationBody: 'Registrerer parkering i baggrunden.',
            },
          });
          logDebug('location source: background task (Always / Android background)');
        } catch (e) {
          if (__DEV__) console.warn('[ParkingDetection] startLocationUpdatesAsync failed, using watch', e);
          const sub = await Location.watchPositionAsync(
            {
              accuracy: Location.Accuracy.Balanced,
              timeInterval: 4000,
              distanceInterval: 8,
            },
            (loc) => {
              if (!cancelled) void processLocationRef.current(loc);
            }
          );
          locationSubRef.current = sub;
          logDebug('location source: foreground watch (fallback)');
        }
      } else {
        const sub = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Balanced,
            timeInterval: 4000,
            distanceInterval: 8,
          },
          (loc) => {
            if (!cancelled) void processLocationRef.current(loc);
          }
        );
        locationSubRef.current = sub;
        logDebug('location source: foreground watch (When In Use)');
      }
    };

    void start();

    return () => {
      cancelled = true;
      locationSubRef.current?.remove();
      locationSubRef.current = null;
      void Location.stopLocationUpdatesAsync(PARKING_LOCATION_TASK_NAME).catch(() => {});
    };
  }, [locationPermission]);

  const getBayStrokeColor = useCallback(
    (segmentId: string): string => {
      const override = bayStatusOverrides[segmentId];
      if (
        override === 'occupied' ||
        (activeSession?.isActive && activeSession.parkingBayId === segmentId)
      ) {
        return '#C62828';
      }
      if (override === 'free') {
        return '#2E7D32';
      }
      return '#4CAF50';
    },
    [bayStatusOverrides, activeSession]
  );

  const mockSimulateNearBay = useCallback(() => {
    const segments = mappedSegmentsRef.current;
    if (segments.length === 0) {
      Alert.alert('Parkly', 'No mapped segments loaded — open map in Copenhagen first.');
      return;
    }
    setMockModeEnabled(true);
    const mid = centerlineMidpoint(segments[0]!.centerline);
    void processLocation({
      coords: {
        latitude: mid.latitude + 0.0002,
        longitude: mid.longitude + 0.0002,
        altitude: null,
        accuracy: 10,
        altitudeAccuracy: null,
        heading: null,
        speed: 0,
      },
      timestamp: Date.now(),
    } as LocationObject);
  }, [processLocation]);

  const value = useMemo<ParkingDetectionContextValue>(
    () => ({
      locationPermission,
      notificationPermission,
      mappedSegments,
      setMappedSegments,
      lastLocation,
      nearestBay,
      detectionState,
      activeSession,
      bayStatusOverrides,
      askedArrivalThisStop,
      askedLeaveForActiveSession,
      mockModeEnabled,
      setMockModeEnabled,
      getBayStrokeColor,
      confirmParkingAtBay,
      rejectParkingAtBay,
      confirmLeftParking,
      stillParked,
      leaveParkingManually,
      resetParkingSession,
      mockSimulateNearBay,
    }),
    [
      locationPermission,
      notificationPermission,
      mappedSegments,
      setMappedSegments,
      lastLocation,
      nearestBay,
      detectionState,
      activeSession,
      bayStatusOverrides,
      askedArrivalThisStop,
      askedLeaveForActiveSession,
      mockModeEnabled,
      getBayStrokeColor,
      confirmParkingAtBay,
      rejectParkingAtBay,
      confirmLeftParking,
      stillParked,
      leaveParkingManually,
      resetParkingSession,
      mockSimulateNearBay,
    ]
  );

  return (
    <ParkingDetectionContext.Provider value={value}>{children}</ParkingDetectionContext.Provider>
  );
}

export function useParkingDetection(): ParkingDetectionContextValue {
  const ctx = useContext(ParkingDetectionContext);
  if (!ctx) {
    throw new Error('useParkingDetection must be used within ParkingDetectionProvider');
  }
  return ctx;
}
