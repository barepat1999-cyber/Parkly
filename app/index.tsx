import { useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { Redirect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { ONBOARDING_COMPLETED_KEY, PROFILE_COMPLETED_KEY } from '../src/constants/onboarding';

export default function Index() {
  const [onboardingCompleted, setOnboardingCompleted] = useState<boolean | null>(null);
  const [profileCompleted, setProfileCompleted] = useState<boolean | null>(null);
  const [locationGranted, setLocationGranted] = useState<boolean | null>(null);

  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem(ONBOARDING_COMPLETED_KEY),
      AsyncStorage.getItem(PROFILE_COMPLETED_KEY),
    ])
      .then(([onb, prof]) => {
        setOnboardingCompleted(onb === 'true');
        setProfileCompleted(prof === 'true');
      })
      .catch(() => {
        setOnboardingCompleted(false);
        setProfileCompleted(false);
      });
  }, []);

  useEffect(() => {
    if (onboardingCompleted !== true || profileCompleted !== true) {
      setLocationGranted(null);
      return;
    }
    let cancelled = false;
    Location.getForegroundPermissionsAsync()
      .then((r) => {
        if (!cancelled) setLocationGranted(r.status === 'granted');
      })
      .catch(() => {
        if (!cancelled) setLocationGranted(false);
      });
    return () => {
      cancelled = true;
    };
  }, [onboardingCompleted, profileCompleted]);

  if (onboardingCompleted === null || profileCompleted === null) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#14B8A6" />
      </View>
    );
  }

  if (!onboardingCompleted) {
    return <Redirect href="/onboarding" />;
  }

  if (!profileCompleted) {
    return <Redirect href="/profile-setup" />;
  }

  if (locationGranted === null) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#14B8A6" />
      </View>
    );
  }

  if (!locationGranted) {
    return <Redirect href="/location-permission" />;
  }

  return <Redirect href="/(tabs)/map" />;
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
});
