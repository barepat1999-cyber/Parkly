import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Linking,
  Keyboard,
  Alert,
  AppState,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import * as Location from 'expo-location';
import MapView, {
  Marker,
  Circle,
  Region,
  Callout,
  Polyline,
  Camera,
} from 'react-native-maps';
import type { Details } from 'react-native-maps';
import { useMapDrivingLocation } from '../../src/hooks/useMapDrivingLocation';
import { minDistanceMetersToPolylineVertices } from '../../src/utils/mapPolylineDistance';
import { hexToRgba } from '../../src/utils/colorAlpha';
import { httpsCallable } from 'firebase/functions';
import { useReportStore } from '../../src/store/ReportStoreContext';
import { ParkingReport, formatTime, formatDateLabel } from '../../src/types/parking';
import { functions } from '../../src/config/firebase';
import { getCurrentLocation, isValidCoordinate } from '../../src/utils/location';
import { canReportAtSpot, recordReportAtSpot } from '../../src/storage/reportSpamProtection';
import { distanceMeters, formatDistance } from '../../src/utils/geo';
import { getParkingSegmentsInRegion } from '../../src/services/parkingInventoryService';
import type { ParkingSegment } from '../../src/types/parkingSegment';
import { STATIC_COPENHAGEN_SEGMENTS } from '../../src/data/copenhagenSegments';
import { getConfidenceCellsInRegion } from '../../src/services/confidenceGrid';
import { getHeatmapCellsInRegion } from '../../src/services/heatmapService';
import { groupReportsBySpot, type SpotGroup } from '../../src/utils/spotGrouping';
import type { TimeFilterValue } from '../../src/store/ReportStoreContext';
import type { Zone } from '../../src/types/zone';
import {
  createConfirmation,
  hasUserConfirmed,
  getConfirmationCounts,
} from '../../src/services/confirmationService';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useParkingDetection } from '../../src/store/ParkingDetectionContext';
import { ParkingDetectionBanner } from '../../src/components/ParkingDetectionBanner';
import { useMapDebugMode } from '../../src/hooks/useMapDebugMode';

/** Only fallback in the entire app – used when live location unavailable */
const COPENHAGEN_FALLBACK: Region = {
  latitude: 55.6761,
  longitude: 12.5683,
  latitudeDelta: 0.02,
  longitudeDelta: 0.02,
};

/** Client-side fallback: when we have few segments in Copenhagen, merge in static street data. */
function ensureCopenhagenSegments(segments: ParkingSegment[], region: Region): ParkingSegment[] {
  if (segments.length >= 20) return segments;
  const { latitude: lat, longitude: lon, latitudeDelta: dLat, longitudeDelta: dLng } = region;
  if (lat < 55.6 || lat > 55.75 || lon < 12.45 || lon > 12.65) return segments;
  const south = lat - dLat / 2;
  const north = lat + dLat / 2;
  const west = lon - dLng / 2;
  const east = lon + dLng / 2;
  const seen = new Set(segments.map((s) => s.id));
  const out = [...segments];
  for (const seg of STATIC_COPENHAGEN_SEGMENTS) {
    const first = seg.centerline[0];
    if (!first || seen.has(seg.id)) continue;
    if (first.latitude >= south && first.latitude <= north && first.longitude >= west && first.longitude <= east) {
      out.push(seg);
      seen.add(seg.id);
    }
  }
  return out;
}

/**
 * Parking map overlay: Polyline only — 2+ points from coordinates, else centerline, else synthetic second point.
 */
function getParkingPolylineCoords(segment: ParkingSegment): { latitude: number; longitude: number }[] | null {
  let c =
    segment.coordinates.length > 0 ? [...segment.coordinates] : [];
  if (c.length < 2 && segment.centerline.length >= 2) {
    c = [...segment.centerline];
  }
  if (c.length === 1) {
    const p = c[0]!;
    return [p, { latitude: p.latitude + 0.0005, longitude: p.longitude + 0.0005 }];
  }
  if (c.length < 2) return null;
  return c;
}

function getParkingSegmentEmphasis(
  segment: ParkingSegment,
  user: { latitude: number; longitude: number } | null
): { strokeWidth: number; zIndex: number; colorAlpha: number } {
  if (!user) return { strokeWidth: 5, zIndex: 6, colorAlpha: 1 };
  const coords = getParkingPolylineCoords(segment);
  if (!coords) return { strokeWidth: 5, zIndex: 6, colorAlpha: 1 };
  const d = minDistanceMetersToPolylineVertices(user.latitude, user.longitude, coords);
  if (d < 110) return { strokeWidth: 8, zIndex: 18, colorAlpha: 1 };
  if (d < 300) return { strokeWidth: 6.5, zIndex: 12, colorAlpha: 0.9 };
  return { strokeWidth: 4.5, zIndex: 4, colorAlpha: 0.76 };
}

function strokeColorWithEmphasis(baseHex: string, alpha: number): string {
  if (alpha >= 0.995) return baseHex;
  if (baseHex.startsWith('#') && baseHex.length === 7) return hexToRgba(baseHex, alpha);
  return baseHex;
}

const FILTER_OPTIONS: { value: TimeFilterValue; label: string }[] = [
  { value: '15', label: '15 min' },
  { value: '30', label: '30 min' },
  { value: '60', label: '60 min' },
  { value: 'all', label: 'All' },
];

/** Map display only: reports older than this are hidden (markers, confidence, counts). History unchanged. */
const reportValidityMinutes = 0;

/** Last seen free: hide markers older than this. */
const LAST_SEEN_FREE_EXPIRY_MINUTES = 5;

/** Radius in meters for getZonesNear. Reasonable for "nearby" parking. */
const ZONES_FETCH_RADIUS_M = 1500;

/** Within this distance (m), show "Was this spot still free?" confirmation popup. */
const PROXIMITY_CONFIRM_M = 50;

/** Urban driving zoom (~3–4 blocks). Map center is shifted slightly north so the user sits lower (more road ahead). */
const DRIVING_LAT_DELTA = 0.0042;
const DRIVING_LON_DELTA = 0.00285;
/** Fraction of latitudeDelta to add north to map center (user appears below center). */
const DRIVING_CENTER_OFFSET_NORTH = 0.22;
/** Match useMapDrivingLocation: below this speed, keep last map heading (reduces jitter). */
const STATIONARY_SPEED_MS_MAP = 0.55;
/** Subtle 3D tilt for driving feel (camera API). */
const DRIVING_MAP_PITCH = 11;
const DRIVING_MAP_ALTITUDE_IOS = 560;
const DRIVING_MAP_ZOOM_ANDROID = 17.2;
/** Camera animation duration (ms). */
const DRIVING_CAMERA_DURATION_MS = 780;

function buildDrivingRegion(lat: number, lon: number): Region {
  return {
    latitude: lat + DRIVING_LAT_DELTA * DRIVING_CENTER_OFFSET_NORTH,
    longitude: lon,
    latitudeDelta: DRIVING_LAT_DELTA,
    longitudeDelta: DRIVING_LON_DELTA,
  };
}

function getExpectedFollowMapCenter(
  userLat: number,
  userLon: number,
  latDelta: number
): { latitude: number; longitude: number } {
  return {
    latitude: userLat + latDelta * DRIVING_CENTER_OFFSET_NORTH,
    longitude: userLon,
  };
}

function lerpHeadingDeg(prev: number, next: number, t: number): number {
  let diff = next - prev;
  while (diff > 180) diff -= 360;
  while (diff < -180) diff += 360;
  return prev + diff * t;
}

/**
 * Camera for follow mode: user slightly below center, mild pitch, heading when moving.
 * Persists last heading while stationary so the map does not snap north.
 */
function buildDrivingCamera(
  userLat: number,
  userLon: number,
  headingDeg: number | null,
  speedMps: number | null,
  lastHeadingRef: { current: number | null },
  cameraHeadingSmoothRef: { current: number | null }
): Camera {
  const center = getExpectedFollowMapCenter(userLat, userLon, DRIVING_LAT_DELTA);
  const moving =
    speedMps != null && !Number.isNaN(speedMps) && speedMps >= STATIONARY_SPEED_MS_MAP;

  let targetHeading = lastHeadingRef.current ?? 0;
  if (moving && headingDeg != null && headingDeg >= 0) {
    targetHeading = headingDeg;
    lastHeadingRef.current = headingDeg;
  }

  const prevSm = cameraHeadingSmoothRef.current;
  if (prevSm == null || !Number.isFinite(prevSm)) {
    cameraHeadingSmoothRef.current = targetHeading;
  } else {
    cameraHeadingSmoothRef.current = lerpHeadingDeg(prevSm, targetHeading, moving ? 0.28 : 0.14);
  }
  const heading = cameraHeadingSmoothRef.current ?? targetHeading;

  if (Platform.OS === 'ios') {
    return {
      center,
      heading,
      pitch: DRIVING_MAP_PITCH,
      altitude: DRIVING_MAP_ALTITUDE_IOS,
    };
  }
  return {
    center,
    heading,
    pitch: DRIVING_MAP_PITCH,
    zoom: DRIVING_MAP_ZOOM_ANDROID,
  };
}

function roundCoord(n: number): number {
  return Math.round(n * 10000) / 10000;
}

/** Format "X min ago" for last seen */
function formatMinutesAgo(ts: number, now: number): string {
  const min = Math.floor((now - ts) / 60000);
  if (min < 1) return 'just now';
  if (min === 1) return '1 min ago';
  return `${min} min ago`;
}

/** Only use live location if it's in Denmark – rejects Cupertino/simulator defaults */
function isInDenmark(lat: number, lon: number): boolean {
  return lat >= 54 && lat <= 58 && lon >= 8 && lon <= 16;
}

/** Show "Simulator location" when user is far from Copenhagen (>50km) */
function isSimulatorOrRemoteLocation(lat: number, lon: number): boolean {
  return __DEV__ && distanceMeters(55.6761, 12.5683, lat, lon) > 50_000;
}

const pinColor = (status: ParkingReport['status']) =>
  status === 'available' ? '#4CAF50' : '#F44336';

/** If spot is on top of user location, offset marker so blue dot doesn't trigger modal (tap Parkly marker only). */
const USER_SPOT_OVERLAP_THRESHOLD = 0.00015;
const SPOT_OFFSET_NEAR_USER = 0.00035; // ~35m – marker drawn south-east of user dot

/** Report ID for confirmation: the most recent report that said "free" at this spot. */
function getFreeReportId(group: SpotGroup): string | null {
  const freeReport = group.reports.find((r) => r.status === 'available');
  return freeReport?.id ?? null;
}

function getSpotMarkerCoordinate(
  group: SpotGroup,
  userLocation: { latitude: number; longitude: number } | null
): { latitude: number; longitude: number } {
  if (!userLocation) return { latitude: group.latitude, longitude: group.longitude };
  const dLat = Math.abs(group.latitude - userLocation.latitude);
  const dLon = Math.abs(group.longitude - userLocation.longitude);
  if (dLat < USER_SPOT_OVERLAP_THRESHOLD && dLon < USER_SPOT_OVERLAP_THRESHOLD) {
    return {
      latitude: group.latitude + SPOT_OFFSET_NEAR_USER,
      longitude: group.longitude + SPOT_OFFSET_NEAR_USER,
    };
  }
  return { latitude: group.latitude, longitude: group.longitude };
}

function SpotMarker({
  group,
  coordinate,
  onPress,
  isHighlighted,
}: {
  group: SpotGroup;
  coordinate: { latitude: number; longitude: number };
  onPress: () => void;
  isHighlighted?: boolean;
}) {
  const fill = pinColor(group.finalStatus);
  return (
    <Marker
      coordinate={coordinate}
      onPress={onPress}
      tracksViewChanges={false}
      zIndex={isHighlighted ? 11 : 10}
    >
      <View style={[styles.markerWrap, isHighlighted && styles.markerWrapHighlight]}>
        <View style={[styles.markerOuter, { borderColor: '#fff' }, isHighlighted && styles.markerOuterHighlight]}>
          <View style={[styles.markerInner, { backgroundColor: fill }, isHighlighted && styles.markerInnerHighlight]} />
        </View>
      </View>
    </Marker>
  );
}

function LastSeenFreeMarker({
  group,
  coordinate,
  onPress,
  isHighlighted,
}: {
  group: SpotGroup;
  coordinate: { latitude: number; longitude: number };
  onPress: () => void;
  isHighlighted?: boolean;
}) {
  return (
    <Marker
      coordinate={coordinate}
      onPress={onPress}
      tracksViewChanges={false}
      zIndex={isHighlighted ? 10 : 9}
    >
      <View style={styles.lastSeenFreeMarker}>
        <View style={styles.lastSeenFreeDot} />
      </View>
      <Callout tooltip>
        <View style={styles.lastSeenFreeCallout}>
          <Text style={styles.lastSeenFreeCalloutText}>Last seen free</Text>
        </View>
      </Callout>
    </Marker>
  );
}

export default function MapScreen() {
  const insets = useSafeAreaInsets();
  const { debugMode, setDebugMode } = useMapDebugMode();
  const {
    coords: userLocation,
    headingDeg,
    speedMps,
    permissionGranted,
    refreshForegroundPermission,
  } = useMapDrivingLocation();
  const lastDrivingHeadingRef = useRef<number | null>(null);
  const cameraHeadingSmoothRef = useRef<number | null>(null);
  const mapRef = useRef<MapView>(null);
  const mapCenterReady = useRef(false);
  const regionRef = useRef<Region>(COPENHAGEN_FALLBACK);
  const programmaticCameraUntilRef = useRef(0);
  const [followUserMode, setFollowUserMode] = useState(true);
  const followUserModeRef = useRef(true);
  const lastFollowCameraAtRef = useRef(0);
  const lastFollowAnchorRef = useRef<{ lat: number; lon: number } | null>(null);
  /** Always start with Copenhagen – never Cupertino or other defaults */
  const [initialRegion] = useState<Region>(() => COPENHAGEN_FALLBACK);
  const { reports, filteredReports, addReport, removeReport, timeFilter, setTimeFilter } =
    useReportStore();
  const [selectedSpot, setSelectedSpot] = useState<SpotGroup | null>(null);
  // Default to standard to avoid MapKit satellite.styl console errors on iOS
  const [mapType, setMapType] = useState<'standard' | 'satellite'>('standard');
  const [region, setRegion] = useState<Region>(COPENHAGEN_FALLBACK);
  const [filterModalVisible, setFilterModalVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [destination, setDestination] = useState<{ latitude: number; longitude: number } | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [mapRefreshAt, setMapRefreshAt] = useState(() => Date.now());
  const [zones, setZones] = useState<Zone[]>([]);
  const zonesFetchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [confirmationPopup, setConfirmationPopup] = useState<{
    group: SpotGroup;
    reportId: string;
  } | null>(null);
  const [confirmationCounts, setConfirmationCounts] = useState<Record<string, number>>({});
  const [confirmationSubmitting, setConfirmationSubmitting] = useState(false);
  const [heatmapVisible, setHeatmapVisible] = useState(false);
  const [inventoryVisible, setInventoryVisible] = useState(true);
  const [inventorySegments, setInventorySegments] = useState<ParkingSegment[]>([]);
  const [selectedSegment, setSelectedSegment] = useState<ParkingSegment | null>(null);
  const { setMappedSegments, getBayStrokeColor, activeSession: parkingActiveSession } = useParkingDetection();

  useEffect(() => {
    setMappedSegments(inventorySegments);
  }, [inventorySegments, setMappedSegments]);

  const fetchZonesNear = useCallback(async (centerLat: number, centerLng: number) => {
    if (!functions || !isValidCoordinate(centerLat, centerLng)) return;
    try {
      const callable = httpsCallable(functions, 'getZonesNear');
      const res = await callable({
        lat: centerLat,
        lng: centerLng,
        radiusMeters: ZONES_FETCH_RADIUS_M,
      });
      const data = res.data as { zones: Zone[] };
      const list = data?.zones ?? [];
      setZones(list);
      if (__DEV__) console.debug('[Map] getZonesNear:', list.length, 'zones at', centerLat.toFixed(4), centerLng.toFixed(4));
    } catch (error) {
      if (__DEV__) console.debug('[Map] getZonesNear error:', error);
      setZones([]);
    }
  }, []);

  const handleRegionChangeComplete = useCallback(
    (r: Region, details?: Details) => {
      if (
        !isValidCoordinate(r.latitude, r.longitude) ||
        !Number.isFinite(r.latitudeDelta) ||
        !Number.isFinite(r.longitudeDelta) ||
        r.latitudeDelta <= 0 ||
        r.longitudeDelta <= 0
      ) {
        if (__DEV__) console.warn('[Map] Ignoring invalid region from map:', r);
        return;
      }
      if (r.latitude < 50 || r.longitude < 8 || r.longitude > 16) {
        if (__DEV__) console.warn('[Map] Rejecting stale/default region (outside Denmark):', r.latitude, r.longitude);
        setRegion(COPENHAGEN_FALLBACK);
        regionRef.current = COPENHAGEN_FALLBACK;
        mapRef.current?.animateToRegion(COPENHAGEN_FALLBACK);
        return;
      }

      const now = Date.now();
      const isProgrammatic = now < programmaticCameraUntilRef.current;
      if (
        !isProgrammatic &&
        followUserModeRef.current &&
        details?.isGesture === true
      ) {
        setFollowUserMode(false);
      }
      if (
        !isProgrammatic &&
        followUserModeRef.current &&
        userLocation &&
        isInDenmark(userLocation.latitude, userLocation.longitude)
      ) {
        const expected = getExpectedFollowMapCenter(
          userLocation.latitude,
          userLocation.longitude,
          r.latitudeDelta
        );
        const drift = distanceMeters(r.latitude, r.longitude, expected.latitude, expected.longitude);
        /** User panned away from follow framing (works on iOS where isGesture is often missing). */
        if (drift > 55) {
          setFollowUserMode(false);
        }
      }

      setRegion(r);
      regionRef.current = r;
      mapCenterReady.current = true;
      if (zonesFetchTimeoutRef.current) clearTimeout(zonesFetchTimeoutRef.current);
      zonesFetchTimeoutRef.current = setTimeout(() => {
        zonesFetchTimeoutRef.current = null;
        fetchZonesNear(r.latitude, r.longitude);
        getParkingSegmentsInRegion(r)
          .then((segments) => setInventorySegments(ensureCopenhagenSegments(segments, r)))
          .catch(() => setInventorySegments([]));
      }, 300);
    },
    [fetchZonesNear, userLocation]
  );

  const effectiveRegion = region;
  const hasInDenmarkLocation = !!(userLocation && isInDenmark(userLocation.latitude, userLocation.longitude));

  useEffect(() => {
    followUserModeRef.current = followUserMode;
  }, [followUserMode]);

  const drivingFollowDidRunRef = useRef(false);
  useEffect(() => {
    if (!followUserMode || !userLocation || !isInDenmark(userLocation.latitude, userLocation.longitude)) {
      return;
    }
    const now = Date.now();
    const anchor = lastFollowAnchorRef.current;
    const moved =
      !anchor ||
      distanceMeters(userLocation.latitude, userLocation.longitude, anchor.lat, anchor.lon) > 12;
    if (drivingFollowDidRunRef.current && !moved && now - lastFollowCameraAtRef.current < 1250) {
      return;
    }
    drivingFollowDidRunRef.current = true;
    lastFollowCameraAtRef.current = now;
    lastFollowAnchorRef.current = {
      lat: userLocation.latitude,
      lon: userLocation.longitude,
    };
    programmaticCameraUntilRef.current = now + DRIVING_CAMERA_DURATION_MS + 200;
    const cam = buildDrivingCamera(
      userLocation.latitude,
      userLocation.longitude,
      headingDeg,
      speedMps,
      lastDrivingHeadingRef,
      cameraHeadingSmoothRef
    );
    mapRef.current?.animateCamera(cam, { duration: DRIVING_CAMERA_DURATION_MS });
  }, [userLocation, followUserMode, headingDeg, speedMps]);

  useEffect(() => {
    return () => {
      if (zonesFetchTimeoutRef.current) clearTimeout(zonesFetchTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    if (!debugMode) setHeatmapVisible(false);
  }, [debugMode]);

  // Refresh map display when app returns to foreground
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') setMapRefreshAt(Date.now());
    });
    return () => sub.remove();
  }, []);

  // Refresh when Map tab appears + initial fetch of parking segments
  useFocusEffect(
    useCallback(() => {
      setMapRefreshAt(Date.now());
      const r = regionRef.current;
      getParkingSegmentsInRegion(r)
        .then((segments) => setInventorySegments(ensureCopenhagenSegments(segments, r)))
        .catch(() => setInventorySegments([]));
    }, [])
  );

  // Refresh every 30s so last-seen-free markers (5 min expiry) disappear promptly
  useEffect(() => {
    const id = setInterval(() => setMapRefreshAt(Date.now()), 30 * 1000);
    return () => clearInterval(id);
  }, []);

  /* Map initializes from location – no separate center effect */

  const handleReportPress = async (status: 'available' | 'occupied') => {
    try {
      let coords = userLocation;
      if (!coords) {
        coords = await getCurrentLocation({ silent: true });
        if (!coords || !isValidCoordinate(coords.latitude, coords.longitude)) {
          Alert.alert('Lokation', 'Kunne ikke hente din position – prøv igen om lidt.', [{ text: 'OK' }]);
          return;
        }
      }
      const allowed = await canReportAtSpot(coords.latitude, coords.longitude);
      if (!allowed) {
        Alert.alert('', 'You already reported this spot recently.');
        return;
      }
      await addReport(status, coords);
      await recordReportAtSpot(coords.latitude, coords.longitude);
      fetchZonesNear(effectiveRegion.latitude, effectiveRegion.longitude);
    } catch (e) {
      if (__DEV__) console.warn('[Map] handleReportPress failed:', e);
      Alert.alert('Fejl', 'Kunne ikke opdatere – prøv igen.');
    }
  };

  const handleMarkerPress = (group: SpotGroup) => {
    setSelectedSpot(group);
  };

  const handleDeleteLatest = async () => {
    if (!selectedSpot) return;
    try {
      await removeReport(selectedSpot.latest.id);
      if (selectedSpot.count <= 1) setSelectedSpot(null);
      else
        setSelectedSpot({
          ...selectedSpot,
          reports: selectedSpot.reports.slice(1),
          latest: selectedSpot.reports[1]!,
          count: selectedSpot.count - 1,
        });
    } catch (e) {
      if (__DEV__) console.warn('[Map] handleDeleteLatest failed:', e);
      Alert.alert('Fejl', 'Kunne ikke slette – prøv igen.');
    }
  };

  const handleDeleteAllOnSpot = async () => {
    if (!selectedSpot) return;
    try {
      for (const r of selectedSpot.reports) await removeReport(r.id);
      setSelectedSpot(null);
    } catch (e) {
      if (__DEV__) console.warn('[Map] handleDeleteAllOnSpot failed:', e);
      Alert.alert('Fejl', 'Kunne ikke slette – prøv igen.');
    }
  };

  const handleCenterOnUser = async () => {
    setFollowUserMode(true);
    const now = Date.now();
    programmaticCameraUntilRef.current = now + DRIVING_CAMERA_DURATION_MS + 200;

    if (
      userLocation &&
      isValidCoordinate(userLocation.latitude, userLocation.longitude) &&
      isInDenmark(userLocation.latitude, userLocation.longitude)
    ) {
      const cam = buildDrivingCamera(
        userLocation.latitude,
        userLocation.longitude,
        headingDeg,
        speedMps,
        lastDrivingHeadingRef,
        cameraHeadingSmoothRef
      );
      mapRef.current?.animateCamera(cam, { duration: DRIVING_CAMERA_DURATION_MS });
      lastFollowAnchorRef.current = { lat: userLocation.latitude, lon: userLocation.longitude };
      lastFollowCameraAtRef.current = Date.now();
      return;
    }

    const loc = await getCurrentLocation({ silent: true });
    const r: Region =
      loc && isValidCoordinate(loc.latitude, loc.longitude) && isInDenmark(loc.latitude, loc.longitude)
        ? buildDrivingRegion(loc.latitude, loc.longitude)
        : COPENHAGEN_FALLBACK;
    if (__DEV__) {
      if (loc) console.log('[Map] Recenter: live location fetched', loc.latitude.toFixed(5), loc.longitude.toFixed(5));
      else console.log('[Map] Recenter: live unavailable, using Copenhagen fallback');
    }
    if (loc && isInDenmark(loc.latitude, loc.longitude)) {
      lastFollowAnchorRef.current = { lat: loc.latitude, lon: loc.longitude };
      const cam = buildDrivingCamera(
        loc.latitude,
        loc.longitude,
        headingDeg,
        speedMps,
        lastDrivingHeadingRef,
        cameraHeadingSmoothRef
      );
      mapRef.current?.animateCamera(cam, { duration: DRIVING_CAMERA_DURATION_MS });
    } else {
      setRegion(r);
      regionRef.current = r;
      mapRef.current?.animateToRegion(r, DRIVING_CAMERA_DURATION_MS);
    }
    lastFollowCameraAtRef.current = Date.now();
  };

  const toggleMapType = () => {
    setMapType((t) => (t === 'satellite' ? 'standard' : 'satellite'));
  };

  const toggleHeatmap = () => {
    setHeatmapVisible((v) => !v);
  };

  const toggleInventory = () => {
    setInventoryVisible((v) => !v);
  };

  const handleSearchSubmit = async () => {
    const q = searchQuery.trim();
    if (!q) return;
    Keyboard.dismiss();
    setIsSearching(true);
    setDestination(null);
    setFollowUserMode(false);
    try {
      const results = await Location.geocodeAsync(q);
      if (results.length > 0) {
        const { latitude, longitude } = results[0]!;
        if (!isValidCoordinate(latitude, longitude)) {
          if (__DEV__) console.warn('[Map] Geocode returned invalid coords:', latitude, longitude);
          return;
        }
        setDestination({ latitude, longitude });
        const targetRegion: Region = {
          latitude,
          longitude,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        };
        programmaticCameraUntilRef.current = Date.now() + 700;
        setRegion(targetRegion);
        regionRef.current = targetRegion;
        if (mapRef.current) {
          mapRef.current.animateToRegion(targetRegion, 500);
        }
      }
    } catch (e) {
      if (__DEV__) console.warn('[Map] geocode failed', e);
    } finally {
      setIsSearching(false);
    }
  };

  const reportsForMap = useMemo(() => {
    if (reportValidityMinutes === 0) return filteredReports;
    const cutoff = Date.now() - reportValidityMinutes * 60 * 1000;
    return filteredReports.filter((r) => r.createdAt >= cutoff);
  }, [filteredReports, mapRefreshAt]);

  const spotGroups = groupReportsBySpot(reportsForMap);

  // Fetch confirmation counts for free spots (for confidence scoring) – must be after spotGroups
  const freeSpotReportIds = useMemo(() => {
    const ids: string[] = [];
    for (const g of spotGroups) {
      if (g.finalStatus === 'available') {
        const rid = getFreeReportId(g);
        if (rid) ids.push(rid);
      }
    }
    return ids;
  }, [spotGroups]);

  useEffect(() => {
    if (freeSpotReportIds.length === 0) {
      setConfirmationCounts({});
      return;
    }
    getConfirmationCounts(freeSpotReportIds)
      .then((counts) => setConfirmationCounts(counts ?? {}))
      .catch((e) => {
        if (__DEV__) console.debug('[Map] getConfirmationCounts failed:', e);
        setConfirmationCounts({});
      });
  }, [freeSpotReportIds.join(',')]);

  // Proximity check: show confirmation popup when within 50m of a free spot
  useEffect(() => {
    if (!userLocation || confirmationPopup) return;
    const freeSpots = spotGroups.filter((g) => g.finalStatus === 'available');
    const withinRange = freeSpots
      .map((g) => {
        const reportId = getFreeReportId(g);
        if (!reportId) return null;
        const meters = distanceMeters(
          userLocation.latitude,
          userLocation.longitude,
          g.latitude,
          g.longitude
        );
        return { group: g, reportId, meters };
      })
      .filter((x): x is NonNullable<typeof x> => x != null && x.meters <= PROXIMITY_CONFIRM_M)
      .sort((a, b) => a.meters - b.meters);

    if (withinRange.length === 0) return;
    const checkAndShow = async () => {
      try {
        for (const { group, reportId } of withinRange) {
          const already = await hasUserConfirmed(reportId);
          if (!already) {
            setConfirmationPopup({ group, reportId });
            return;
          }
        }
      } catch (e) {
        if (__DEV__) console.warn('[Map] proximity check failed:', e);
      }
    };
    checkAndShow();
  }, [userLocation, spotGroups, confirmationPopup]);

  const refPoint = userLocation ?? destination;

  const { lastSeenFreeSpots, regularSpots } = useMemo(() => {
    const cutoff = mapRefreshAt - LAST_SEEN_FREE_EXPIRY_MINUTES * 60 * 1000;
    const lastSeen: SpotGroup[] = [];
    const regular: SpotGroup[] = [];
    for (const g of spotGroups) {
      if (g.finalStatus === 'available' && g.lastUpdated >= cutoff) {
        lastSeen.push(g);
      } else {
        regular.push(g);
      }
    }
    return { lastSeenFreeSpots: lastSeen, regularSpots: regular };
  }, [spotGroups, mapRefreshAt]);
  const reportsForConfidence = spotGroups.map((g) => ({
    id: g.key,
    latitude: g.latitude,
    longitude: g.longitude,
    status: g.finalStatus,
    createdAt: g.lastUpdated,
  }));
  const confidenceCells = getConfidenceCellsInRegion(effectiveRegion, reportsForConfidence, 200);

  /** Heatmap: score = free/total per cluster, updates when region changes. Capped at 50 for stability. */
  const heatmapCells = useMemo(
    () => getHeatmapCellsInRegion(effectiveRegion, reportsForMap ?? [], 50),
    [effectiveRegion, reportsForMap]
  );

  const { nearestFreeSpot, nearestDistanceMeters } = useMemo(() => {
    const refPoint = userLocation ?? destination;
    if (!refPoint) return { nearestFreeSpot: null as SpotGroup | null, nearestDistanceMeters: null as number | null };
    const free = spotGroups.filter((g) => g.finalStatus === 'available');
    if (free.length === 0) return { nearestFreeSpot: null, nearestDistanceMeters: null };
    const withDist = free.map((g) => ({
      group: g,
      meters: distanceMeters(refPoint.latitude, refPoint.longitude, g.latitude, g.longitude),
    }));
    withDist.sort((a, b) => a.meters - b.meters);
    const nearest = withDist[0]!;
    if (__DEV__) {
      console.debug('[Map] nearest free spot', {
        userLat: refPoint.latitude,
        userLon: refPoint.longitude,
        spotLat: nearest.group.latitude,
        spotLon: nearest.group.longitude,
        meters: nearest.meters,
        formatted: formatDistance(nearest.meters),
      });
    }
    return { nearestFreeSpot: nearest.group, nearestDistanceMeters: nearest.meters };
  }, [userLocation, destination, spotGroups]);

  const bestNextMove = useMemo(() => {
    const ref = refPoint ?? { latitude: effectiveRegion.latitude, longitude: effectiveRegion.longitude };
    const now = mapRefreshAt;
    const maxDistM = 1500;

    /** Confidence from report + confirmations: 1 report=60%, 1 conf=85%, 2=90%, 3+=95% */
    const confidenceFromConfirmations = (reportId: string): number => {
      const counts = confirmationCounts ?? {};
      const conf = counts[reportId] ?? 0;
      if (conf >= 3) return 0.95;
      if (conf >= 2) return 0.9;
      if (conf >= 1) return 0.85;
      return 0.6;
    };

    const freeSpots = spotGroups.filter((g) => g.finalStatus === 'available');
    const freeCandidates = freeSpots.map((g) => {
      const meters = distanceMeters(ref.latitude, ref.longitude, g.latitude, g.longitude);
      const reportId = getFreeReportId(g);
      const baseConfidence = reportId
        ? confidenceFromConfirmations(reportId)
        : 0.6;
      const isRecent = g.lastUpdated >= now - LAST_SEEN_FREE_EXPIRY_MINUTES * 60 * 1000;
      const confidence = isRecent
        ? Math.max(baseConfidence, 0.9)
        : Math.max(0.3, baseConfidence - (now - g.lastUpdated) / (30 * 60 * 1000));
      const score = confidence / (1 + meters / 500);
      return { type: 'spot' as const, group: g, meters, confidence, lastSeenMs: g.lastUpdated, score };
    });

    const zoneCandidates = zones
      .filter((z) => distanceMeters(ref.latitude, ref.longitude, z.centerLat, z.centerLng) <= maxDistM)
      .map((z) => {
        const meters = distanceMeters(ref.latitude, ref.longitude, z.centerLat, z.centerLng);
        const conf = Math.min(1, (z.confidenceScore ?? 0) / 3);
        const score = conf / (1 + meters / 500);
        return { type: 'zone' as const, zone: z, meters, confidence: conf, score };
      });

    const all = [...freeCandidates, ...zoneCandidates].filter((c) => c.meters <= maxDistM);
    all.sort((a, b) => b.score - a.score);
    const best = all[0];
    const isStrong = best && best.score >= 0.15;
    return { best, isStrong };
  }, [spotGroups, zones, refPoint, effectiveRegion.latitude, effectiveRegion.longitude, mapRefreshAt, confirmationCounts]);

  const handleNavigateToSpot = () => {
    if (!selectedSpot) return;
    const url = `http://maps.apple.com/?daddr=${selectedSpot.latitude},${selectedSpot.longitude}`;
    Linking.openURL(url).catch((e) => {
      if (__DEV__) console.warn('[Map] Linking.openURL failed:', e);
      Alert.alert('Fejl', 'Kunne ikke åbne kort.');
    });
  };

  const handleConfirmFree = async () => {
    if (!confirmationPopup || confirmationSubmitting) return;
    setConfirmationSubmitting(true);
    try {
      await createConfirmation(confirmationPopup.reportId, 'free');
      setConfirmationPopup(null);
      setConfirmationCounts((prev) => ({
        ...prev,
        [confirmationPopup.reportId]: (prev[confirmationPopup.reportId] ?? 0) + 1,
      }));
      fetchZonesNear(effectiveRegion.latitude, effectiveRegion.longitude);
    } catch (e) {
      if (__DEV__) console.warn('[Map] confirm free failed:', e);
      Alert.alert('Fejl', 'Kunne ikke bekræfte – prøv igen.');
    } finally {
      setConfirmationSubmitting(false);
    }
  };

  const handleSpotTaken = async () => {
    if (!confirmationPopup || confirmationSubmitting) return;
    setConfirmationSubmitting(true);
    try {
      const { latitude, longitude } = confirmationPopup.group;
      const allowed = await canReportAtSpot(latitude, longitude);
      if (!allowed) {
        Alert.alert('', 'You already reported this spot recently.');
        return;
      }
      await addReport('occupied', { latitude, longitude });
      await recordReportAtSpot(latitude, longitude);
      await createConfirmation(confirmationPopup.reportId, 'taken');
      setConfirmationPopup(null);
      fetchZonesNear(effectiveRegion.latitude, effectiveRegion.longitude);
    } catch (e) {
      if (__DEV__) console.warn('[Map] spot taken failed:', e);
      Alert.alert('Fejl', 'Kunne ikke opdatere – prøv igen.');
    } finally {
      setConfirmationSubmitting(false);
    }
  };

  const showSimulatorNote =
    userLocation && isSimulatorOrRemoteLocation(userLocation.latitude, userLocation.longitude);

  /** Draw farther parking lines first so nearby segments stay visually on top. */
  const inventorySegmentsRenderOrder = useMemo(() => {
    if (!userLocation) return inventorySegments;
    return [...inventorySegments].sort((a, b) => {
      const ca = getParkingPolylineCoords(a);
      const cb = getParkingPolylineCoords(b);
      const da = ca
        ? minDistanceMetersToPolylineVertices(userLocation.latitude, userLocation.longitude, ca)
        : 0;
      const db = cb
        ? minDistanceMetersToPolylineVertices(userLocation.latitude, userLocation.longitude, cb)
        : 0;
      return db - da;
    });
  }, [inventorySegments, userLocation]);

  const showInventoryPolylines = !debugMode || inventoryVisible;
  const showConfidenceOverlay = debugMode && !heatmapVisible;
  const showZoneCircles = debugMode;
  const hasParkingSession = !!parkingActiveSession?.isActive;
  const showRecommendationCard = !hasParkingSession;

  /** Space above home indicator — compact bar so the map stays dominant */
  const reportActionReserve =
    8 + 10 + 6 + 46 + 8 + Math.max(insets.bottom, 12) + 4;
  const sheetBottomOffset = reportActionReserve;
  const centerButtonBottom = sheetBottomOffset + 118;

  return (
    <View style={styles.container}>
      <View style={[styles.searchBarWrap, { top: insets.top + 8 }]}>
        <TextInput
          style={styles.searchBar}
          placeholder="Søg destination…"
          placeholderTextColor="#999"
          value={searchQuery}
          onChangeText={setSearchQuery}
          onSubmitEditing={handleSearchSubmit}
          returnKeyType="search"
          editable={!isSearching}
        />
        {isSearching && (
          <View style={styles.searchBarLoader}>
            <ActivityIndicator size="small" color="#2196F3" />
          </View>
        )}
      </View>
      <MapView
        key={hasInDenmarkLocation ? 'live' : 'copenhagen'}
        ref={mapRef}
        style={styles.map}
        initialRegion={initialRegion}
        showsUserLocation={permissionGranted === true}
        showsMyLocationButton={false}
        {...(Platform.OS === 'ios' ? { tintColor: '#007AFF' as const } : {})}
        mapType={Platform.OS === 'ios' ? mapType : 'standard'}
        zoomEnabled
        scrollEnabled
        pitchEnabled={false}
        rotateEnabled={false}
        onMapReady={() => {
          if (!hasInDenmarkLocation) {
            mapRef.current?.animateToRegion(COPENHAGEN_FALLBACK);
            // iOS MapKit emits spurious onRegionChange with Cupertino/Apple Park on mount – recover after ~400ms
            setTimeout(() => {
              if (regionRef.current.latitude >= 54 && regionRef.current.latitude <= 58) return;
              mapRef.current?.animateToRegion(COPENHAGEN_FALLBACK);
            }, 400);
          }
        }}
        onRegionChangeComplete={handleRegionChangeComplete}
      >
        {showInventoryPolylines &&
          inventorySegmentsRenderOrder.map((segment) => {
            const coords = getParkingPolylineCoords(segment);
            if (!coords || coords.length < 2) return null;
            const baseStroke = getBayStrokeColor(segment.id);
            const emphasis = getParkingSegmentEmphasis(segment, userLocation);
            const strokeColor = strokeColorWithEmphasis(baseStroke, emphasis.colorAlpha);
            return (
              <Polyline
                key={`${segment.id}-${baseStroke}-${emphasis.strokeWidth}`}
                coordinates={coords}
                strokeColor={strokeColor}
                strokeWidth={emphasis.strokeWidth}
                lineCap="round"
                lineJoin="round"
                tappable
                onPress={() => setSelectedSegment(segment)}
                zIndex={emphasis.zIndex}
              />
            );
          })}
        {debugMode &&
          heatmapVisible &&
          heatmapCells.map((cell) => (
            <Circle
              key={`heatmap-${cell.latitude}-${cell.longitude}`}
              center={{ latitude: cell.latitude, longitude: cell.longitude }}
              radius={80}
              fillColor={
                cell.score >= 0.6
                  ? 'rgba(76, 175, 80, 0.3)'
                  : cell.score >= 0.3
                    ? 'rgba(255, 193, 7, 0.3)'
                    : 'rgba(244, 67, 54, 0.3)'
              }
              strokeColor="transparent"
            />
          ))}
        {showConfidenceOverlay &&
          confidenceCells.map((cell, idx) => (
            <Circle
              key={`cell-${cell.latitude}-${cell.longitude}-${idx}`}
              center={{ latitude: cell.latitude, longitude: cell.longitude }}
              radius={50}
              fillColor={
                cell.confidence >= 0.6
                  ? 'rgba(76, 175, 80, 0.15)'
                  : cell.confidence >= 0.4
                    ? 'rgba(255, 193, 7, 0.14)'
                    : 'rgba(244, 67, 54, 0.15)'
              }
              strokeColor="transparent"
            />
          ))}
        {showZoneCircles &&
          zones.map((zone) => (
            <Circle
              key={zone.id}
              center={{ latitude: zone.centerLat, longitude: zone.centerLng }}
              radius={80}
              fillColor="rgba(33, 150, 243, 0.2)"
              strokeColor="rgba(33, 150, 243, 0.5)"
              strokeWidth={1}
            />
          ))}
        {lastSeenFreeSpots.map((group) => (
          <LastSeenFreeMarker
            key={group.key}
            group={group}
            coordinate={getSpotMarkerCoordinate(group, userLocation)}
            onPress={() => handleMarkerPress(group)}
            isHighlighted={nearestFreeSpot?.key === group.key}
          />
        ))}
        {regularSpots.map((group) => (
          <SpotMarker
            key={group.key}
            group={group}
            coordinate={getSpotMarkerCoordinate(group, userLocation)}
            onPress={() => handleMarkerPress(group)}
            isHighlighted={nearestFreeSpot?.key === group.key}
          />
        ))}
      </MapView>

      {permissionGranted === false && (
        <View
          style={[
            styles.locationGate,
            { paddingTop: insets.top + 28, paddingBottom: Math.max(insets.bottom, 20) + 12 },
          ]}
        >
          <Text style={styles.locationGateTitle}>Lokation er påkrævet</Text>
          <Text style={styles.locationGateBody}>
            Parkly virker ikke uden adgang til din position. Tryk knappen nedenfor, eller åbn
            Indstillinger og giv Parkly adgang.
          </Text>
          <TouchableOpacity
            style={styles.locationGatePrimary}
            onPress={() => void refreshForegroundPermission()}
            activeOpacity={0.85}
          >
            <Text style={styles.locationGatePrimaryText}>Tillad lokation</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => void Linking.openSettings()} activeOpacity={0.85}>
            <Text style={styles.locationGateSecondary}>Åbn Indstillinger</Text>
          </TouchableOpacity>
        </View>
      )}

      {debugMode && __DEV__ && (
        <View style={[styles.counterLabel, { top: insets.top + 104 }]}>
          <Text style={styles.counterLabelText}>
            Rapporter: {filteredReports.length} · Spots: {spotGroups.length}
            {nearestDistanceMeters != null && ` · Nærmeste: ${formatDistance(nearestDistanceMeters)}`}
          </Text>
        </View>
      )}

      {debugMode && __DEV__ && showSimulatorNote && (
        <View style={[styles.simulatorNote, { top: insets.top + 104, right: 16 }]}>
          <Text style={styles.simulatorNoteText}>Simulator-lokation</Text>
        </View>
      )}

      {debugMode && Platform.OS === 'ios' && (
        <TouchableOpacity style={[styles.toggleButton, { top: insets.top + 52 }]} onPress={toggleMapType}>
          <Text style={styles.toggleButtonText}>
            {mapType === 'satellite' ? 'Standard' : 'Satellit'}
          </Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity
        style={[styles.filterButton, { top: insets.top + 52 }]}
        onPress={() => setFilterModalVisible(true)}
      >
        <Text style={styles.filterButtonText}>
          {FILTER_OPTIONS.find((o) => o.value === timeFilter)?.label ?? 'Filter'}
        </Text>
      </TouchableOpacity>

      {debugMode && (
        <View style={[styles.mapOverlayButtons, { top: insets.top + 118 }]}>
          <TouchableOpacity
            style={[styles.heatmapButton, heatmapVisible && styles.heatmapButtonActive]}
            onPress={toggleHeatmap}
          >
            <Text style={styles.heatmapButtonText}>Heatmap</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.inventoryButton, inventoryVisible && styles.inventoryButtonActive]}
            onPress={toggleInventory}
          >
            <Text style={styles.inventoryButtonText}>Gadeparkering</Text>
          </TouchableOpacity>
        </View>
      )}

      <TouchableOpacity
        style={[
          styles.centerButton,
          followUserMode && hasInDenmarkLocation && styles.centerButtonFollowing,
          { bottom: centerButtonBottom },
        ]}
        onPress={handleCenterOnUser}
        onLongPress={
          __DEV__
            ? () => {
                const next = !debugMode;
                setDebugMode(next);
                Alert.alert(
                  'Kort-debug',
                  next
                    ? 'Debug-tilstand er slået til (lag, heatmap, testknapper). Langt tryk igen for at slå fra.'
                    : 'Debug-tilstand er slået fra.'
                );
              }
            : undefined
        }
        delayLongPress={550}
        accessibilityLabel={
          followUserMode && hasInDenmarkLocation ? 'Følger din position. Tryk for at centrere igen.' : 'Centrér på dig og følg kørsel'
        }
        accessibilityHint={__DEV__ ? 'Langt tryk for at slå kort-debug til eller fra' : undefined}
      >
        <Text
          style={[
            styles.centerButtonText,
            followUserMode && hasInDenmarkLocation && styles.centerButtonTextFollowing,
          ]}
        >
          ◎
        </Text>
      </TouchableOpacity>

      <View style={[styles.sheetColumn, { bottom: sheetBottomOffset, gap: 10 }]}>
        {confirmationPopup && (
          <View style={styles.confirmationPopup}>
            <Text style={styles.confirmationKicker}>Bekræftelse</Text>
            <Text style={styles.confirmationPopupTitle}>Var pladsen stadig ledig?</Text>
            <Text style={styles.confirmationPopupHint}>
              Dit svar hjælper andre med at stole på kortet.
            </Text>
            <View style={styles.confirmationPopupButtons}>
              <TouchableOpacity
                style={[styles.confirmationButton, styles.confirmationButtonFree]}
                onPress={handleConfirmFree}
                disabled={confirmationSubmitting}
              >
                <Text style={styles.confirmationButtonText}>Ja, ledig</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmationButton, styles.confirmationButtonTaken]}
                onPress={handleSpotTaken}
                disabled={confirmationSubmitting}
              >
                <Text style={styles.confirmationButtonText}>Nej, optaget</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {showRecommendationCard && (
          <View
            style={[
              styles.recommendationCard,
              hasInDenmarkLocation && styles.recommendationCardDriving,
            ]}
          >
            <View style={styles.recommendationTop}>
              <Text style={styles.recommendationLabel}>
                {hasInDenmarkLocation ? 'Nær dig' : 'Næste skridt'}
              </Text>
              <Text style={styles.recommendationTrust}>
                {hasInDenmarkLocation ? 'Rapporter + zoner' : 'Baseret på rapporter og zoner'}
              </Text>
            </View>
            {bestNextMove.isStrong && bestNextMove.best ? (
              <>
                <Text style={styles.recommendationDistance} numberOfLines={1}>
                  {formatDistance(bestNextMove.best.meters)}{' '}
                  <Text style={styles.recommendationDistanceUnit}>til forslag</Text>
                </Text>
                <Text style={styles.recommendationMeta} numberOfLines={hasInDenmarkLocation ? 2 : 4}>
                  {Math.round((bestNextMove.best.confidence ?? 0) * 100)}% chance
                  {bestNextMove.best.type === 'spot'
                    ? ` · Ledig set ${formatMinutesAgo(bestNextMove.best.lastSeenMs, mapRefreshAt)}`
                    : ''}
                </Text>
              </>
            ) : (
              <Text
                style={styles.recommendationFallback}
                numberOfLines={hasInDenmarkLocation ? 3 : 5}
              >
                {refPoint == null
                  ? hasInDenmarkLocation
                    ? 'Panér eller søg for at se forslag.'
                    : 'Panér til et område eller slå lokation til for forslag heromkring.'
                  : hasInDenmarkLocation
                    ? 'Svagt signal her — zoom eller kør lidt videre.'
                    : 'Ikke nok signale i nærheden lige nu — prøv et andet område på kortet.'}
              </Text>
            )}
            {refPoint != null && nearestFreeSpot != null && nearestDistanceMeters != null && (
              <View style={styles.recommendationHintRow}>
                <View style={styles.recommendationHintDot} />
                <Text style={styles.recommendationHint} numberOfLines={2}>
                  Seneste ledig-rapport {formatDistance(nearestDistanceMeters)} væk
                </Text>
              </View>
            )}
          </View>
        )}

        <ParkingDetectionBanner debugMode={debugMode} />
      </View>

      <View
        style={[
          styles.floatingBar,
          {
            paddingBottom: Math.max(insets.bottom, 10) + 4,
            paddingTop: 8,
          },
        ]}
      >
        <Text style={styles.actionBarLabel}>Del status</Text>
        <View style={styles.reportRow}>
          <TouchableOpacity
            style={[styles.reportChip, styles.reportChipAvailable]}
            onPress={() => handleReportPress('available')}
            activeOpacity={0.85}
          >
            <Text style={styles.reportChipTitle}>Ledig plads</Text>
            <Text style={styles.reportChipSub}>Bruger-rapport</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.reportChip, styles.reportChipOccupied]}
            onPress={() => handleReportPress('occupied')}
            activeOpacity={0.85}
          >
            <Text style={styles.reportChipTitle}>Optaget</Text>
            <Text style={styles.reportChipSub}>Bruger-rapport</Text>
          </TouchableOpacity>
        </View>
      </View>

      <Modal
        visible={filterModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setFilterModalVisible(false)}
      >
        <Pressable
          style={[styles.filterOverlay, { paddingTop: insets.top + 88 }]}
          onPress={() => setFilterModalVisible(false)}
        >
          <View style={styles.filterDropdown}>
            {FILTER_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.value}
                style={[styles.filterOption, timeFilter === opt.value && styles.filterOptionActive]}
                onPress={() => {
                  setTimeFilter(opt.value);
                  setFilterModalVisible(false);
                }}
              >
                <Text style={styles.filterOptionText}>{opt.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </Pressable>
      </Modal>

      <Modal
        visible={!!selectedSegment}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedSegment(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {selectedSegment && (
              <>
                <View style={styles.modalHeaderRow}>
                  <View style={styles.modalHeaderSpacer} />
                  <TouchableOpacity
                    hitSlop={{ top: 12, right: 12, bottom: 12, left: 12 }}
                    onPress={() => setSelectedSegment(null)}
                    style={styles.modalCloseX}
                  >
                    <Text style={styles.modalCloseXText}>✕</Text>
                  </TouchableOpacity>
                </View>
                <Text style={styles.modalTitle}>
                  {selectedSegment.streetName}
                </Text>
                <View style={styles.segmentStats}>
                  {selectedSegment.zoneType && (
                    <Text style={styles.segmentStatRow}>
                      Zone: <Text style={styles.segmentStatValue}>{selectedSegment.zoneType}</Text>
                    </Text>
                  )}
                  <Text style={styles.segmentStatRow}>
                    Antal pladser: <Text style={styles.segmentStatValue}>{selectedSegment.totalSpots}</Text>
                  </Text>
                  <Text style={styles.segmentStatRow}>
                    Estimeret ledige: <Text style={[styles.segmentStatValue, { color: '#4CAF50' }]}>
                      {selectedSegment.estimatedFreeSpots}
                    </Text>
                  </Text>
                  <Text style={styles.segmentStatRow}>
                    Estimeret optagne: <Text style={[styles.segmentStatValue, { color: '#F44336' }]}>
                      {selectedSegment.estimatedOccupiedSpots}
                    </Text>
                  </Text>
                  {selectedSegment.confidence != null && (
                    <Text style={styles.segmentStatRow}>
                      Troværdighed: <Text style={styles.segmentStatValue}>
                        {Math.round(selectedSegment.confidence * 100)}%
                      </Text>
                    </Text>
                  )}
                  <Text style={styles.segmentStatRow}>
                    Opdateret: <Text style={styles.segmentStatValue}>
                      {formatMinutesAgo(selectedSegment.lastUpdated, mapRefreshAt)}
                    </Text>
                  </Text>
                </View>
                <TouchableOpacity
                  style={[styles.button, styles.buttonClose]}
                  onPress={() => setSelectedSegment(null)}
                >
                  <Text style={styles.buttonText}>Luk</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>

      <Modal
        visible={!!selectedSpot}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedSpot(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {selectedSpot && (
              <>
                <View style={styles.modalHeaderRow}>
                  <View style={styles.modalHeaderSpacer} />
                  <TouchableOpacity
                    hitSlop={{ top: 12, right: 12, bottom: 12, left: 12 }}
                    onPress={() => setSelectedSpot(null)}
                    style={styles.modalCloseX}
                  >
                    <Text style={styles.modalCloseXText}>✕</Text>
                  </TouchableOpacity>
                </View>
                <Text style={styles.modalTitle}>
                  {selectedSpot.finalStatus === 'available' ? 'Ledig plads' : 'Optaget'}
                </Text>
                <Text style={styles.timeText}>
                  {formatDateLabel(selectedSpot.latest.createdAt)} {formatTime(selectedSpot.latest.createdAt)}
                </Text>
                <Text style={styles.coordsText}>
                  {roundCoord(selectedSpot.latitude)}, {roundCoord(selectedSpot.longitude)}
                  {selectedSpot.count > 1 && ` · ${selectedSpot.count} rapporter`}
                </Text>

                <TouchableOpacity
                  style={[styles.button, styles.buttonNavigate]}
                  onPress={handleNavigateToSpot}
                >
                  <Text style={styles.buttonTextNavigate}>Navigér hertil</Text>
                </TouchableOpacity>

                <Text style={styles.recentListTitle}>Seneste rapporter</Text>
                <ScrollView style={styles.recentListScroll}>
                  {selectedSpot.reports.slice(0, 5).map((r) => (
                    <View key={r.id} style={styles.recentListRow}>
                      <Text style={[styles.recentListStatus, { color: pinColor(r.status) }]}>
                        {r.status === 'available' ? 'Ledig' : 'Optaget'}
                      </Text>
                      <Text style={styles.recentListTime}>{formatTime(r.createdAt)}</Text>
                    </View>
                  ))}
                </ScrollView>

                <TouchableOpacity
                  style={[styles.button, styles.buttonDeleteLatest]}
                  onPress={handleDeleteLatest}
                >
                  <Text style={styles.buttonTextLatest}>Slet seneste</Text>
                </TouchableOpacity>
                {selectedSpot.count > 1 && (
                  <TouchableOpacity
                    style={[styles.button, styles.buttonDeleteAll]}
                    onPress={handleDeleteAllOnSpot}
                  >
                    <Text style={styles.buttonText}>Slet alle på dette sted ({selectedSpot.count})</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={[styles.button, styles.buttonClose]}
                  onPress={() => setSelectedSpot(null)}
                >
                  <Text style={styles.buttonText}>Luk</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  locationGate: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255, 255, 255, 0.97)',
    zIndex: 999,
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 16,
  },
  locationGateTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111',
  },
  locationGateBody: {
    fontSize: 16,
    lineHeight: 24,
    color: '#444',
  },
  locationGatePrimary: {
    backgroundColor: '#14B8A6',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  locationGatePrimaryText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#fff',
  },
  locationGateSecondary: {
    fontSize: 16,
    fontWeight: '600',
    color: '#007AFF',
    textAlign: 'center',
    paddingVertical: 12,
  },
  searchBarWrap: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 20,
    flexDirection: 'row',
    alignItems: 'center',
  },
  searchBar: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    paddingHorizontal: 15,
    paddingVertical: 12,
    borderRadius: 14,
    fontSize: 16,
    color: '#0F172A',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(15, 23, 42, 0.08)',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 3,
    elevation: 1,
  },
  searchBarLoader: { position: 'absolute', right: 14 },
  map: { flex: 1 },
  markerWrap: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 4,
  },
  markerOuter: {
    borderWidth: 2,
    borderRadius: 14,
    padding: 2,
    backgroundColor: 'transparent',
  },
  markerInner: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  lastSeenFreeMarker: {
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#4CAF50',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 6,
    elevation: 4,
  },
  lastSeenFreeDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#4CAF50',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.9)',
  },
  lastSeenFreeCallout: {
    backgroundColor: 'rgba(0,0,0,0.85)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  lastSeenFreeCalloutText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  markerWrapHighlight: { transform: [{ scale: 1.15 }] },
  markerOuterHighlight: { borderWidth: 3 },
  markerInnerHighlight: { width: 32, height: 32, borderRadius: 16 },
  counterLabel: {
    position: 'absolute',
    left: 16,
    maxWidth: '72%',
    backgroundColor: 'rgba(0,0,0,0.75)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  counterLabelText: { color: '#fff', fontSize: 11 },
  simulatorNote: {
    position: 'absolute',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  simulatorNoteText: { color: '#fff', fontSize: 11 },
  sheetColumn: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 14,
    pointerEvents: 'box-none',
  },
  recommendationCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(15, 23, 42, 0.07)',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  recommendationCardDriving: {
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  recommendationTop: {
    marginBottom: 6,
  },
  recommendationLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  recommendationTrust: {
    fontSize: 12,
    color: '#94A3B8',
    lineHeight: 16,
  },
  recommendationDistance: {
    fontSize: 19,
    fontWeight: '700',
    color: '#1D4ED8',
    letterSpacing: -0.5,
    lineHeight: 24,
  },
  recommendationDistanceUnit: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748B',
    letterSpacing: 0,
  },
  recommendationMeta: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 5,
    lineHeight: 16,
  },
  recommendationFallback: {
    fontSize: 13,
    color: '#64748B',
    lineHeight: 18,
  },
  recommendationHintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(15, 23, 42, 0.07)',
  },
  recommendationHintDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#16A34A',
    marginRight: 8,
  },
  recommendationHint: {
    flex: 1,
    fontSize: 12,
    color: '#15803D',
    fontWeight: '600',
    lineHeight: 16,
  },
  toggleButton: {
    position: 'absolute',
    right: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.98)',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(15, 23, 42, 0.1)',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  toggleButtonText: { fontSize: 13, fontWeight: '600', color: '#2563EB' },
  filterButton: {
    position: 'absolute',
    left: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.98)',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(15, 23, 42, 0.1)',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  filterButtonText: { fontSize: 13, fontWeight: '600', color: '#0F172A' },
  filterOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'flex-start',
    paddingLeft: 16,
    alignItems: 'flex-start',
  },
  filterDropdown: {
    backgroundColor: '#fff',
    borderRadius: 8,
    minWidth: 120,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  filterOption: { paddingVertical: 12, paddingHorizontal: 16 },
  filterOptionActive: { backgroundColor: '#E3F2FD' },
  filterOptionText: { fontSize: 15, color: '#333' },
  mapOverlayButtons: {
    position: 'absolute',
    left: 16,
    flexDirection: 'column',
    zIndex: 30,
  },
  heatmapButton: {
    marginBottom: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.98)',
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(15, 23, 42, 0.08)',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  heatmapButtonActive: {
    backgroundColor: '#E8F5E9',
    borderWidth: 1,
    borderColor: '#4CAF50',
  },
  heatmapButtonText: { fontSize: 13, fontWeight: '600', color: '#333' },
  inventoryButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  inventoryButtonActive: {
    backgroundColor: '#E0F2F1',
    borderWidth: 1,
    borderColor: '#14B8A6',
  },
  inventoryButtonText: { fontSize: 13, fontWeight: '600', color: '#333' },
  centerButton: {
    position: 'absolute',
    right: 16,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.98)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(15, 23, 42, 0.1)',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  centerButtonText: { fontSize: 22, color: '#2563EB' },
  centerButtonFollowing: {
    backgroundColor: '#EFF6FF',
    borderColor: '#93C5FD',
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
  centerButtonTextFollowing: { color: '#1D4ED8' },
  confirmationKicker: {
    fontSize: 11,
    fontWeight: '700',
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 0.7,
    textAlign: 'center',
    marginBottom: 6,
  },
  confirmationPopup: {
    backgroundColor: 'rgba(255, 255, 255, 0.98)',
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(15, 23, 42, 0.08)',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
  },
  confirmationPopupTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 6,
    textAlign: 'center',
    letterSpacing: -0.2,
  },
  confirmationPopupHint: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 16,
  },
  confirmationPopupButtons: {
    flexDirection: 'row',
    gap: 10,
  },
  confirmationButton: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: 'center',
  },
  confirmationButtonFree: { backgroundColor: '#16A34A' },
  confirmationButtonTaken: { backgroundColor: '#DC2626' },
  confirmationButtonText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  floatingBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 20,
    flexDirection: 'column',
    paddingHorizontal: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.97)',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(15, 23, 42, 0.08)',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 8,
  },
  actionBarLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
    marginBottom: 6,
    letterSpacing: 0.15,
  },
  reportRow: {
    flexDirection: 'row',
    gap: 8,
  },
  reportChip: {
    flex: 1,
    minHeight: 46,
    paddingVertical: 9,
    paddingHorizontal: 10,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reportChipAvailable: {
    backgroundColor: '#16A34A',
    shadowColor: '#15803D',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  reportChipOccupied: {
    backgroundColor: '#DC2626',
    shadowColor: '#B91C1C',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  reportChipTitle: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
    letterSpacing: -0.2,
  },
  reportChipSub: {
    color: 'rgba(255, 255, 255, 0.88)',
    fontSize: 10,
    fontWeight: '500',
    marginTop: 1,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 40,
    paddingTop: 8,
    maxHeight: '80%',
  },
  modalHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  modalHeaderSpacer: { width: 32 },
  modalCloseX: { padding: 8 },
  modalCloseXText: { fontSize: 22, color: '#666', fontWeight: '300' },
  modalTitle: { fontSize: 24, fontWeight: 'bold', marginBottom: 8 },
  segmentStats: { marginBottom: 16 },
  segmentStatRow: { fontSize: 15, color: '#333', marginBottom: 6 },
  segmentStatValue: { fontWeight: '600', color: '#111' },
  timeText: { fontSize: 14, color: '#666', marginBottom: 4 },
  coordsText: { fontSize: 12, color: '#999', marginBottom: 12 },
  recentListTitle: { fontSize: 14, fontWeight: '600', marginBottom: 6 },
  recentListScroll: { maxHeight: 120, marginBottom: 16 },
  recentListRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  recentListStatus: { fontSize: 13, fontWeight: '600' },
  recentListTime: { fontSize: 12, color: '#666' },
  button: { padding: 16, borderRadius: 8, alignItems: 'center', marginBottom: 8 },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  buttonTextLatest: { color: '#5d4037', fontWeight: '600', fontSize: 14 },
  buttonDeleteLatest: { backgroundColor: '#E0E0E0' },
  buttonDeleteAll: { backgroundColor: '#F44336' },
  buttonClose: { backgroundColor: '#757575' },
  buttonNavigate: { backgroundColor: '#2196F3' },
  buttonTextNavigate: { color: '#fff', fontWeight: '600', fontSize: 14 },
});
