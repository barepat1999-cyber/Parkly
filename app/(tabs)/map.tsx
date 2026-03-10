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
  Button,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import * as Location from 'expo-location';
import MapView, { Marker, Circle, Region } from 'react-native-maps';
import { httpsCallable } from 'firebase/functions';
import { useReportStore } from '../../src/store/ReportStoreContext';
import { ParkingReport, formatTime, formatDateLabel } from '../../src/types/parking';
import { functions } from '../../src/config/firebase';
import { getCurrentLocation } from '../../src/utils/location';
import { distanceMeters, formatDistance } from '../../src/utils/geo';
import { SEED_AREAS } from '../../src/data/seedAreas';
import StripedParkingArea from '../../src/components/StripedParkingArea';
import { getConfidenceCellsInRegion } from '../../src/services/confidenceGrid';
import { groupReportsBySpot, type SpotGroup } from '../../src/utils/spotGrouping';
import type { TimeFilterValue } from '../../src/store/ReportStoreContext';
import type { Zone } from '../../src/types/zone';

const COPENHAGEN_CENTER: Region = {
  latitude: 55.6761,
  longitude: 12.5683,
  latitudeDelta: 0.05,
  longitudeDelta: 0.05,
};

const FILTER_OPTIONS: { value: TimeFilterValue; label: string }[] = [
  { value: '15', label: '15 min' },
  { value: '30', label: '30 min' },
  { value: '60', label: '60 min' },
  { value: 'all', label: 'All' },
];

/** Map display only: reports older than this are hidden (markers, confidence, counts). History unchanged. */
const reportValidityMinutes = 0;

/** Radius in meters for getZonesNear. Reasonable for "nearby" parking. */
const ZONES_FETCH_RADIUS_M = 1500;

function roundCoord(n: number): number {
  return Math.round(n * 10000) / 10000;
}

/** SF simulator default (Apple) */
const SF_LAT = 37.7749;
const SF_LON = -122.4194;
const SIMULATOR_THRESHOLD = 0.01;
function isSimulatorLocation(lat: number, lon: number): boolean {
  return (
    __DEV__ &&
    Math.abs(lat - SF_LAT) < SIMULATOR_THRESHOLD &&
    Math.abs(lon - SF_LON) < SIMULATOR_THRESHOLD
  );
}

const pinColor = (status: ParkingReport['status']) =>
  status === 'available' ? '#4CAF50' : '#F44336';

/** If spot is on top of user location, offset marker so blue dot doesn't trigger modal (tap Parkly marker only). */
const USER_SPOT_OVERLAP_THRESHOLD = 0.00015;
const SPOT_OFFSET_NEAR_USER = 0.00035; // ~35m – marker drawn south-east of user dot

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

export default function MapScreen() {
  const mapRef = useRef<MapView>(null);
  const hasCenteredOnUser = useRef(false);
  const regionRef = useRef<Region>(COPENHAGEN_CENTER);
  const mapCenterReady = useRef(false);
  const { reports, filteredReports, addReport, removeReport, timeFilter, setTimeFilter } =
    useReportStore();
  const [userLocation, setUserLocation] = useState<{
    latitude: number;
    longitude: number;
    accuracy?: number;
  } | null>(null);
  const [selectedSpot, setSelectedSpot] = useState<SpotGroup | null>(null);
  // Default to standard to avoid MapKit satellite.styl console errors on iOS
  const [mapType, setMapType] = useState<'standard' | 'satellite'>('standard');
  const [region, setRegion] = useState<Region>(COPENHAGEN_CENTER);
  const [filterModalVisible, setFilterModalVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [destination, setDestination] = useState<{ latitude: number; longitude: number } | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [mapRefreshAt, setMapRefreshAt] = useState(() => Date.now());
  const [zones, setZones] = useState<Zone[]>([]);
  const [zonesLoading, setZonesLoading] = useState(false);
  const zonesFetchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchZonesNear = useCallback(async (centerLat: number, centerLng: number) => {
    if (!functions) return;
    setZonesLoading(true);
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
      if (__DEV__) console.log('[Map] getZonesNear:', list.length, 'zones at', centerLat.toFixed(4), centerLng.toFixed(4));
    } catch (error) {
      if (__DEV__) console.error('[Map] getZonesNear error:', error);
      setZones([]);
    } finally {
      setZonesLoading(false);
    }
  }, []);

  const handleRegionChangeComplete = useCallback(
    (r: Region) => {
      setRegion(r);
      regionRef.current = r;
      mapCenterReady.current = true;
      // Debounce zone fetch to avoid rapid calls while panning
      if (zonesFetchTimeoutRef.current) clearTimeout(zonesFetchTimeoutRef.current);
      zonesFetchTimeoutRef.current = setTimeout(() => {
        zonesFetchTimeoutRef.current = null;
        const centerLat = r.latitude;
        const centerLng = r.longitude;
        fetchZonesNear(centerLat, centerLng);
      }, 300);
    },
    [fetchZonesNear]
  );

  useEffect(() => {
    getCurrentLocation().then(setUserLocation);
  }, []);

  useEffect(() => {
    return () => {
      if (zonesFetchTimeoutRef.current) clearTimeout(zonesFetchTimeoutRef.current);
    };
  }, []);

  // Refresh map display when app returns to foreground
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') setMapRefreshAt(Date.now());
    });
    return () => sub.remove();
  }, []);

  // Refresh when Map tab appears
  useFocusEffect(
    useCallback(() => {
      setMapRefreshAt(Date.now());
    }, [])
  );

  // Refresh every minute so expired reports disappear
  useEffect(() => {
    const id = setInterval(() => setMapRefreshAt(Date.now()), 60 * 1000);
    return () => clearInterval(id);
  }, []);

  // Center map on user once when location is available (so pins in SF are visible when app runs in simulator)
  useEffect(() => {
    if (!userLocation || !mapRef.current || hasCenteredOnUser.current) return;
    hasCenteredOnUser.current = true;
    mapRef.current.animateToRegion({
      latitude: userLocation.latitude,
      longitude: userLocation.longitude,
      latitudeDelta: 0.01,
      longitudeDelta: 0.01,
    });
  }, [userLocation]);

  const handleReportPress = async (status: 'available' | 'occupied') => {
    let coords = userLocation;
    if (!coords) {
      coords = await getCurrentLocation();
      if (!coords) {
        Alert.alert('Lokation', 'Kunne ikke hente din position – prøv igen om lidt.', [{ text: 'OK' }]);
        return;
      }
      setUserLocation(coords);
    }
    await addReport(status, coords);
    // Refetch zones so new zone from onReportCreated appears
    fetchZonesNear(region.latitude, region.longitude);
  };

  const handleMarkerPress = (group: SpotGroup) => {
    setSelectedSpot(group);
  };

  const handleDeleteLatest = async () => {
    if (!selectedSpot) return;
    await removeReport(selectedSpot.latest.id);
    if (selectedSpot.count <= 1) setSelectedSpot(null);
    else
      setSelectedSpot({
        ...selectedSpot,
        reports: selectedSpot.reports.slice(1),
        latest: selectedSpot.reports[1]!,
        count: selectedSpot.count - 1,
      });
  };

  const handleDeleteAllOnSpot = async () => {
    if (!selectedSpot) return;
    for (const r of selectedSpot.reports) await removeReport(r.id);
    setSelectedSpot(null);
  };

  const handleCenterOnUser = () => {
    if (!userLocation || !mapRef.current) return;
    mapRef.current.animateToRegion({
      latitude: userLocation.latitude,
      longitude: userLocation.longitude,
      latitudeDelta: 0.005,
      longitudeDelta: 0.005,
    });
  };

  const toggleMapType = () => {
    setMapType((t) => (t === 'satellite' ? 'standard' : 'satellite'));
  };

  const handleSearchSubmit = async () => {
    const q = searchQuery.trim();
    if (!q) return;
    Keyboard.dismiss();
    setIsSearching(true);
    setDestination(null);
    try {
      const results = await Location.geocodeAsync(q);
      if (results.length > 0) {
        const { latitude, longitude } = results[0]!;
        setDestination({ latitude, longitude });
        if (mapRef.current) {
          mapRef.current.animateToRegion({
            latitude,
            longitude,
            latitudeDelta: 0.01,
            longitudeDelta: 0.01,
          });
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
  const reportsForConfidence = spotGroups.map((g) => ({
    id: g.key,
    latitude: g.latitude,
    longitude: g.longitude,
    status: g.finalStatus,
    createdAt: g.lastUpdated,
  }));
  const confidenceCells = getConfidenceCellsInRegion(region, reportsForConfidence, 200);

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
      console.log('[Map] nearest free spot', {
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

  const handleNavigateToSpot = () => {
    if (!selectedSpot) return;
    const url = `http://maps.apple.com/?daddr=${selectedSpot.latitude},${selectedSpot.longitude}`;
    Linking.openURL(url);
  };

  if (__DEV__) {
    console.log('[Map] markers render', {
      reportsInFilter: filteredReports.length,
      uniqueSpots: spotGroups.length,
      spots: spotGroups.map((g) => ({
        lat: g.latitude,
        lon: g.longitude,
        count: g.count,
        finalStatus: g.finalStatus,
        debugReason: g.debugReason,
      })),
    });
  }

  const showSimulatorNote =
    userLocation && isSimulatorLocation(userLocation.latitude, userLocation.longitude);

  const refPoint = userLocation ?? destination;

  return (
    <View style={styles.container}>
      <View style={styles.searchBarWrap}>
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
        ref={mapRef}
        style={styles.map}
        initialRegion={COPENHAGEN_CENTER}
        showsUserLocation={!!userLocation}
        showsMyLocationButton={false}
        mapType={Platform.OS === 'ios' ? mapType : 'standard'}
        zoomEnabled
        scrollEnabled
        pitchEnabled={false}
        rotateEnabled={false}
        onRegionChangeComplete={handleRegionChangeComplete}
      >
        {SEED_AREAS.map((area) => (
          <StripedParkingArea key={area.id} area={area} />
        ))}
        {confidenceCells.map((cell, idx) => (
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
        {zones.map((zone) => (
          <Circle
            key={zone.id}
            center={{ latitude: zone.centerLat, longitude: zone.centerLng }}
            radius={80}
            fillColor="rgba(33, 150, 243, 0.2)"
            strokeColor="rgba(33, 150, 243, 0.5)"
            strokeWidth={1}
          />
        ))}
        {spotGroups.map((group) => (
          <SpotMarker
            key={group.key}
            group={group}
            coordinate={getSpotMarkerCoordinate(group, userLocation)}
            onPress={() => handleMarkerPress(group)}
            isHighlighted={nearestFreeSpot?.key === group.key}
          />
        ))}
      </MapView>

      <View style={styles.counterLabel}>
        <Text style={styles.counterLabelText}>
          Rapporter i filter: {filteredReports.length} · Unikke spots: {spotGroups.length}
          {__DEV__ && nearestDistanceMeters != null && ` · Nearest free: ${formatDistance(nearestDistanceMeters)}`}
        </Text>
      </View>

      {refPoint != null && nearestFreeSpot == null && (
        <View style={styles.noFreeLabel}>
          <Text style={styles.noFreeLabelText}>Ingen ledige spots i området</Text>
        </View>
      )}
      {refPoint != null && nearestFreeSpot != null && nearestDistanceMeters != null && (
        <View style={styles.nearestLabel}>
          <Text style={styles.nearestLabelText}>Nærmeste ledige: {formatDistance(nearestDistanceMeters)}</Text>
        </View>
      )}

      {showSimulatorNote && (
        <View style={styles.simulatorNote}>
          <Text style={styles.simulatorNoteText}>Simulator location</Text>
        </View>
      )}

      <TouchableOpacity style={styles.toggleButton} onPress={toggleMapType}>
        <Text style={styles.toggleButtonText}>
          {mapType === 'satellite' ? 'Standard' : 'Satellite'}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.filterButton} onPress={() => setFilterModalVisible(true)}>
        <Text style={styles.filterButtonText}>
          {FILTER_OPTIONS.find((o) => o.value === timeFilter)?.label ?? 'Filter'}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.centerButton} onPress={handleCenterOnUser}>
        <Text style={styles.centerButtonText}>◎</Text>
      </TouchableOpacity>

      <View style={styles.floatingBar}>
        <TouchableOpacity
          style={[styles.reportButton, styles.buttonAvailable]}
          onPress={() => handleReportPress('available')}
        >
          <Text style={styles.reportButtonText}>Ledig plads</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.reportButton, styles.buttonOccupied]}
          onPress={() => handleReportPress('occupied')}
        >
          <Text style={styles.reportButtonText}>Optaget</Text>
        </TouchableOpacity>
      </View>

      {/* Debug overlay: zones count, center, nearest free */}
      <View style={styles.zonesDebugOverlay}>
        <Text style={styles.zonesDebugOverlayText}>
          Zones: {zonesLoading ? '…' : zones.length}
        </Text>
        <Text style={styles.zonesDebugOverlayText}>
          Center: {region.latitude.toFixed(4)}, {region.longitude.toFixed(4)}
        </Text>
        <Text style={styles.zonesDebugOverlayText}>
          Nearest free: {nearestDistanceMeters != null ? formatDistance(nearestDistanceMeters) : '—'}
        </Text>
      </View>

      <Modal
        visible={filterModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setFilterModalVisible(false)}
      >
        <Pressable style={styles.filterOverlay} onPress={() => setFilterModalVisible(false)}>
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
  searchBarWrap: {
    position: 'absolute',
    top: 8,
    left: 16,
    right: 16,
    zIndex: 20,
    flexDirection: 'row',
    alignItems: 'center',
  },
  searchBar: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 10,
    fontSize: 15,
    color: '#333',
    borderWidth: 1,
    borderColor: '#ddd',
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
  markerWrapHighlight: { transform: [{ scale: 1.15 }] },
  markerOuterHighlight: { borderWidth: 3 },
  markerInnerHighlight: { width: 32, height: 32, borderRadius: 16 },
  counterLabel: {
    position: 'absolute',
    top: 52,
    left: 16,
    backgroundColor: 'rgba(0,0,0,0.75)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  counterLabelText: { color: '#fff', fontSize: 11 },
  noFreeLabel: {
    position: 'absolute',
    bottom: 160,
    left: 16,
    right: 16,
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  noFreeLabelText: { color: '#fff', fontSize: 14 },
  nearestLabel: {
    position: 'absolute',
    bottom: 160,
    left: 16,
    backgroundColor: 'rgba(76, 175, 80, 0.9)',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  nearestLabelText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  simulatorNote: {
    position: 'absolute',
    top: 80,
    left: 16,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  simulatorNoteText: { color: '#fff', fontSize: 11 },
  toggleButton: {
    position: 'absolute',
    top: 50,
    right: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  toggleButtonText: { fontSize: 14, fontWeight: '600', color: '#2196F3' },
  filterButton: {
    position: 'absolute',
    top: 50,
    left: 16,
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
  filterButtonText: { fontSize: 14, fontWeight: '600', color: '#333' },
  zonesDebugOverlay: {
    position: 'absolute',
    bottom: 170,
    right: 16,
    backgroundColor: 'rgba(0,0,0,0.75)',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 6,
  },
  zonesDebugOverlayText: { color: '#fff', fontSize: 11 },
  filterOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'flex-start',
    paddingTop: 90,
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
  centerButton: {
    position: 'absolute',
    bottom: 140,
    right: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  centerButtonText: { fontSize: 22, color: '#2196F3' },
  floatingBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    gap: 12,
    padding: 16,
    paddingBottom: 32,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  reportButton: {
    flex: 1,
    padding: 18,
    borderRadius: 10,
    alignItems: 'center',
  },
  reportButtonText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  buttonAvailable: { backgroundColor: '#4CAF50' },
  buttonOccupied: { backgroundColor: '#F44336' },
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
