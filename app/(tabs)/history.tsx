import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import * as Location from 'expo-location';
import { getCurrentLocation, isValidCoordinate } from '../../src/utils/location';
import {
  subscribeUserReports,
  ensureAuth,
  toParkingReport,
} from '../../src/services/reportService';
import { canUseFirestore } from '../../src/config/firebase';
import { distanceMeters, formatDistance } from '../../src/utils/geo';

function formatMinutesAgo(ts: number, now: number): string {
  const min = Math.floor((now - ts) / 60000);
  if (min < 1) return 'just now';
  if (min === 1) return '1 min ago';
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(min / 60);
  if (h === 1) return '1 hour ago';
  return `${h} hours ago`;
}

type HistoryReport = {
  id: string;
  latitude: number;
  longitude: number;
  status: 'available' | 'occupied';
  createdAt: number;
};

export default function HistoryScreen() {
  const [reports, setReports] = useState<HistoryReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [userLocation, setUserLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [streetNames, setStreetNames] = useState<Record<string, string>>({});

  const loadUserReports = useCallback(() => {
    if (!canUseFirestore()) {
      setReports([]);
      setLoading(false);
      return () => {};
    }
    let unsub: (() => void) | null = null;
    ensureAuth()
      .then((uid) => {
        unsub = subscribeUserReports(uid, (firestoreReports) => {
          const list = firestoreReports.map((r) => {
            const p = toParkingReport(r);
            return {
              id: p.id,
              latitude: p.latitude,
              longitude: p.longitude,
              status: p.status,
              createdAt: p.createdAt,
            };
          });
          setReports(list);
          setLoading(false);
        }, { limitCount: 20 });
      })
      .catch((e) => {
        if (__DEV__) console.warn('[History] ensureAuth/subscribe failed:', e);
        setReports([]);
        setLoading(false);
      });
    return () => {
      unsub?.();
    };
  }, []);

  useEffect(() => {
    const cleanup = loadUserReports();
    return cleanup;
  }, [loadUserReports]);

  useFocusEffect(
    useCallback(() => {
      loadUserReports();
    }, [loadUserReports])
  );

  useEffect(() => {
    getCurrentLocation({ silent: true })
      .then((loc) => {
        if (loc && isValidCoordinate(loc.latitude, loc.longitude)) {
          setUserLocation({ latitude: loc.latitude, longitude: loc.longitude });
        }
      })
      .catch((e) => {
        if (__DEV__) console.warn('[History] getCurrentLocation failed:', e);
      });
  }, []);

  useEffect(() => {
    if (reports.length === 0) return;
    reports.slice(0, 5).forEach((r) => {
      Location.reverseGeocodeAsync({
        latitude: r.latitude,
        longitude: r.longitude,
      })
        .then((results) => {
          if (results.length > 0) {
            const addr = results[0];
            const street = addr?.street ?? addr?.name ?? addr?.streetNumber;
            if (street) {
              setStreetNames((prev) => ({ ...prev, [r.id]: street }));
            }
          }
        })
        .catch((e) => {
          if (__DEV__) console.warn('[History] reverseGeocode failed:', e);
        });
    });
  }, [reports]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    setStreetNames({});
    loadUserReports();
    try {
      await new Promise((r) => setTimeout(r, 400));
    } finally {
      setRefreshing(false);
    }
  }, [loadUserReports]);

  const now = Date.now();

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      <View style={styles.section}>
        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color="#2196F3" />
          </View>
        ) : reports.length === 0 ? (
          <Text style={styles.emptyText}>No reports yet</Text>
        ) : (
          reports.map((report) => {
            const distance =
              userLocation != null
                ? distanceMeters(
                    userLocation.latitude,
                    userLocation.longitude,
                    report.latitude,
                    report.longitude
                  )
                : null;
            return (
              <View key={report.id} style={styles.card}>
                <Text style={styles.cardTitle}>
                  {report.status === 'available' ? 'Free spot' : 'Taken spot'}
                </Text>
                <Text style={styles.cardSubtitle}>
                  {streetNames[report.id] ??
                    (distance != null ? formatDistance(distance) : '—')}
                </Text>
                <Text style={styles.cardTime}>
                  {formatMinutesAgo(report.createdAt, now)}
                </Text>
              </View>
            );
          })
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  section: {
    margin: 16,
    marginTop: 16,
  },
  loadingWrap: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  emptyText: {
    color: '#999',
    fontStyle: 'italic',
    paddingVertical: 24,
    fontSize: 15,
  },
  card: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 10,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#333',
    marginBottom: 4,
  },
  cardSubtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 2,
  },
  cardTime: {
    fontSize: 12,
    color: '#999',
  },
});
