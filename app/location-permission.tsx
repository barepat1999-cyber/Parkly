import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Linking,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as Location from 'expo-location';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * Explains why foreground location is required before the system permission dialog.
 * Shown from index when profile is done but location is not granted.
 */
export default function LocationPermissionScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [checking, setChecking] = useState(true);
  const [requesting, setRequesting] = useState(false);
  const [showDeniedHint, setShowDeniedHint] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Location.getForegroundPermissionsAsync().then((r) => {
      if (cancelled) return;
      if (r.status === 'granted') {
        router.replace('/(tabs)/map');
        return;
      }
      setChecking(false);
    });
    return () => {
      cancelled = true;
    };
  }, [router]);

  const handleAllow = async () => {
    setRequesting(true);
    setShowDeniedHint(false);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        router.replace('/(tabs)/map');
        return;
      }
      setShowDeniedHint(true);
    } finally {
      setRequesting(false);
    }
  };

  if (checking) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color="#14B8A6" />
      </View>
    );
  }

  return (
    <View
      style={[
        styles.container,
        { paddingTop: insets.top + 32, paddingBottom: Math.max(insets.bottom, 24) + 16 },
      ]}
    >
      <View style={styles.content}>
        <Text style={styles.title}>Lokation er påkrævet</Text>
        <Text style={styles.body}>
          Parkly bruger din lokation til at vise dig på kortet, finde parkering i nærheden og til
          rapporter. Uden tilladelse kan appen ikke fungere som tænkt.
        </Text>
        {showDeniedHint ? (
          <Text style={styles.hint}>
            Tilladelse blev ikke givet. Du kan prøve igen eller åbne Indstillinger og slå lokation til
            for Parkly.
          </Text>
        ) : null}
      </View>

      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.primaryButton, requesting && styles.buttonDisabled]}
          onPress={handleAllow}
          disabled={requesting}
          activeOpacity={0.85}
        >
          {requesting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryButtonText}>Tillad lokation</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity style={styles.secondaryButton} onPress={() => Linking.openSettings()} activeOpacity={0.85}>
          <Text style={styles.secondaryButtonText}>Åbn Indstillinger</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    paddingHorizontal: 24,
    justifyContent: 'space-between',
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    gap: 16,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: '#111',
    marginBottom: 4,
  },
  body: {
    fontSize: 17,
    lineHeight: 26,
    color: '#444',
  },
  hint: {
    fontSize: 15,
    lineHeight: 22,
    color: '#b45309',
    marginTop: 8,
  },
  actions: {
    gap: 12,
  },
  primaryButton: {
    backgroundColor: '#14B8A6',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  buttonDisabled: {
    opacity: 0.85,
  },
  primaryButtonText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#fff',
  },
  secondaryButton: {
    paddingVertical: 14,
    alignItems: 'center',
  },
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#007AFF',
  },
});
