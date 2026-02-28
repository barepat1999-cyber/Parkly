import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE, Region } from 'react-native-maps';
import * as Location from 'expo-location';
import * as Linking from 'expo-linking';
import { Spot, SpotStatus } from '../types';
import { getSpotsInRadius, createReport, updateSpotStatus, createSpot, incrementUserKarma } from '../services/firestore';
import { getCurrentUser } from '../services/auth';
import { getStatusColor, computeStatus } from '../domain/confidence';
import { syncProviderSpots } from '../services/providers';

export default function MapScreen() {
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [spots, setSpots] = useState<Spot[]>([]);
  const [selectedSpot, setSelectedSpot] = useState<Spot | null>(null);
  const [loading, setLoading] = useState(true);
  const [reporting, setReporting] = useState(false);
  const mapRef = useRef<MapView>(null);

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Tilladelse nødvendig', 'Parkly har brug for din lokation.');
        return;
      }

      const loc = await Location.getCurrentPositionAsync({});
      setLocation(loc);
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (location) {
      loadSpots();
      syncProviderSpots().then(() => loadSpots());
    }
  }, [location]);

  const loadSpots = async () => {
    if (!location) return;
    
    try {
      const loadedSpots = await getSpotsInRadius(
        location.coords.latitude,
        location.coords.longitude,
        5
      );
      
      // Recompute status for each spot based on current time
      const now = new Date();
      const spotsWithCurrentStatus = loadedSpots.map((spot) => ({
        ...spot,
        status: computeStatus(spot.confidence, spot.lastUpdated, now),
      }));
      
      setSpots(spotsWithCurrentStatus);
    } catch (error) {
      console.error('Error loading spots:', error);
    }
  };

  const handleMarkerPress = (spot: Spot) => {
    setSelectedSpot(spot);
  };

  const handleReport = async (reportType: 'free' | 'occupied') => {
    const user = getCurrentUser();
    if (!user) {
      Alert.alert('Fejl', 'Du skal være logget ind.');
      return;
    }

    if (!selectedSpot && !location) {
      Alert.alert('Fejl', 'Ingen position tilgængelig.');
      return;
    }

    setReporting(true);

    try {
      const reportLat = selectedSpot?.lat || location!.coords.latitude;
      const reportLng = selectedSpot?.lng || location!.coords.longitude;
      let spotId = selectedSpot?.id;

      // Optimistic update
      if (selectedSpot) {
        const newStatus: SpotStatus = reportType === 'free' ? 'likely_free' : 'occupied';
        const optimisticSpot: Spot = {
          ...selectedSpot,
          status: newStatus,
        };
        setSelectedSpot(optimisticSpot);
        setSpots((prev) =>
          prev.map((s) => (s.id === selectedSpot.id ? optimisticSpot : s))
        );
      }

      if (spotId) {
        // Update existing spot
        await updateSpotStatus(spotId, reportType);
        await createReport(user.uid, spotId, reportType, reportLat, reportLng);
      } else {
        // Create new spot
        const now = new Date();
        spotId = await createSpot({
          lat: reportLat,
          lng: reportLng,
          type: 'street',
          source: 'crowd',
          status: reportType === 'free' ? 'likely_free' : 'occupied',
          confidence: reportType === 'free' ? 0.7 : 0.3,
          lastUpdated: now,
        });

        await createReport(user.uid, spotId, reportType, reportLat, reportLng);
      }

      // If we created a new spot, add it to the local state
      if (!selectedSpot && spotId) {
        const now = new Date();
        const newStatus: SpotStatus = reportType === 'free' ? 'likely_free' : 'occupied';
        const newSpot: Spot = {
          id: spotId,
          lat: reportLat,
          lng: reportLng,
          type: 'street',
          source: 'crowd',
          status: newStatus,
          confidence: reportType === 'free' ? 0.7 : 0.3,
          lastUpdated: now,
        };

        setSelectedSpot(newSpot);
        setSpots((prev) => [...prev, newSpot]);
      }

      // Increment user karma for reporting
      await incrementUserKarma(user.uid, 1);

      // Reload spots to get updated data
      await loadSpots();
      
      Alert.alert('Tak!', 'Din rapport er modtaget.');
    } catch (error) {
      console.error('Error reporting:', error);
      Alert.alert('Fejl', 'Kunne ikke sende rapport. Prøv igen.');
      
      // Rollback optimistic update
      if (selectedSpot) {
        await loadSpots();
      }
    } finally {
      setReporting(false);
    }
  };

  const handleNavigate = () => {
    if (!selectedSpot) return;

    const url = Platform.OS === 'ios'
      ? `maps://maps.apple.com/?daddr=${selectedSpot.lat},${selectedSpot.lng}`
      : `google.navigation:q=${selectedSpot.lat},${selectedSpot.lng}`;

    Linking.openURL(url).catch(() => {
      // Fallback to web maps
      const webUrl = `https://www.google.com/maps/dir/?api=1&destination=${selectedSpot.lat},${selectedSpot.lng}`;
      Linking.openURL(webUrl);
    });
  };

  if (loading || !location) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4CAF50" />
        <Text style={styles.loadingText}>Indlæser kort...</Text>
      </View>
    );
  }

  const initialRegion: Region = {
    latitude: location.coords.latitude,
    longitude: location.coords.longitude,
    latitudeDelta: 0.01,
    longitudeDelta: 0.01,
  };

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={PROVIDER_GOOGLE}
        initialRegion={initialRegion}
        showsUserLocation
        showsMyLocationButton
      >
        {spots.map((spot) => (
          <Marker
            key={spot.id}
            coordinate={{ latitude: spot.lat, longitude: spot.lng }}
            pinColor={getStatusColor(spot.status)}
            onPress={() => handleMarkerPress(spot)}
          />
        ))}
      </MapView>

      {selectedSpot && (
        <View style={styles.bottomSheet}>
          <View style={styles.bottomSheetHeader}>
            <Text style={styles.spotTitle}>
              {selectedSpot.type === 'garage' ? 'P-hus' : 'Gadeparkering'}
            </Text>
            <TouchableOpacity onPress={() => setSelectedSpot(null)}>
              <Text style={styles.closeButton}>✕</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.spotInfo}>
            <View style={[styles.statusBadge, { backgroundColor: getStatusColor(selectedSpot.status) }]}>
              <Text style={styles.statusText}>
                {selectedSpot.status === 'likely_free' && 'Ledig'}
                {selectedSpot.status === 'uncertain' && 'Usikker'}
                {selectedSpot.status === 'occupied' && 'Optaget'}
              </Text>
            </View>

            {selectedSpot.pricePerHour && (
              <Text style={styles.priceText}>
                {selectedSpot.pricePerHour} kr/t
              </Text>
            )}

            {selectedSpot.availableSpaces !== undefined && (
              <Text style={styles.spacesText}>
                {selectedSpot.availableSpaces} ledige pladser
              </Text>
            )}

            <Text style={styles.confidenceText}>
              Troværdighed: {Math.round(selectedSpot.confidence * 100)}%
            </Text>
          </View>

          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.actionButton, styles.freeButton]}
              onPress={() => handleReport('free')}
              disabled={reporting}
            >
              <Text style={styles.actionButtonText}>
                {reporting ? 'Sender...' : 'Jeg forlader pladsen (Ledig)'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionButton, styles.occupiedButton]}
              onPress={() => handleReport('occupied')}
              disabled={reporting}
            >
              <Text style={styles.actionButtonText}>Optaget</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionButton, styles.navigateButton]}
              onPress={handleNavigate}
            >
              <Text style={styles.actionButtonText}>Navigér</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#666',
  },
  bottomSheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'white',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  bottomSheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  spotTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  closeButton: {
    fontSize: 24,
    color: '#666',
  },
  spotInfo: {
    marginBottom: 20,
  },
  statusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginBottom: 10,
  },
  statusText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 14,
  },
  priceText: {
    fontSize: 16,
    color: '#333',
    marginBottom: 5,
  },
  spacesText: {
    fontSize: 16,
    color: '#333',
    marginBottom: 5,
  },
  confidenceText: {
    fontSize: 14,
    color: '#666',
    marginTop: 5,
  },
  actions: {
    gap: 10,
  },
  actionButton: {
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  freeButton: {
    backgroundColor: '#4CAF50',
  },
  occupiedButton: {
    backgroundColor: '#F44336',
  },
  navigateButton: {
    backgroundColor: '#2196F3',
  },
  actionButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
});
