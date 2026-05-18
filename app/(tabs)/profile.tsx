import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useReportStore } from '../../src/store/ReportStoreContext';
import { ONBOARDING_COMPLETED_KEY, PROFILE_COMPLETED_KEY } from '../../src/constants/onboarding';

export default function ProfileScreen() {
  const router = useRouter();
  const { dayStreak, totalReports, clearAll } = useReportStore();
  const [loading, setLoading] = useState(false);

  const handleResetOnboarding = async () => {
    try {
      await AsyncStorage.removeItem(ONBOARDING_COMPLETED_KEY);
      await AsyncStorage.removeItem(PROFILE_COMPLETED_KEY);
      router.replace('/');
    } catch (e) {
      if (__DEV__) console.debug('[Profile] reset onboarding failed:', e);
      Alert.alert('Error', 'Could not reset onboarding.');
    }
  };

  const handleReset = () => {
    Alert.alert(
      'Reset local data',
      'Er du sikker på at du vil slette alle rapporter?',
      [
        { text: 'Annuller', style: 'cancel' },
        {
          text: 'Slet',
          style: 'destructive',
          onPress: async () => {
            setLoading(true);
            try {
              await clearAll();
            } catch (e) {
              if (__DEV__) console.warn('[Profile] clearAll failed:', e);
              Alert.alert('Fejl', 'Kunne ikke slette – prøv igen.');
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{dayStreak}</Text>
          <Text style={styles.statLabel}>Day Streak</Text>
          <Text style={styles.statDescription}>
            Consecutive days with reports
          </Text>
        </View>

        <View style={styles.statCard}>
          <Text style={styles.statValue}>{totalReports}</Text>
          <Text style={styles.statLabel}>Total Reports</Text>
          <Text style={styles.statDescription}>
            All-time reports made
          </Text>
        </View>

        <TouchableOpacity
          style={styles.resetButton}
          onPress={handleReset}
          disabled={loading}
        >
          <Text style={styles.resetButtonText}>Reset local data</Text>
        </TouchableOpacity>

        {__DEV__ && (
          <TouchableOpacity
            style={[styles.resetButton, { marginTop: 8 }]}
            onPress={handleResetOnboarding}
          >
            <Text style={[styles.resetButtonText, { color: '#14B8A6' }]}>
              Reset onboarding
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  content: {
    padding: 16,
    paddingTop: 8,
  },
  statCard: {
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 12,
    marginBottom: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  statValue: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#2196F3',
    marginBottom: 8,
  },
  statLabel: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 4,
  },
  statDescription: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
  resetButton: {
    marginTop: 8,
    padding: 16,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#ddd',
    alignItems: 'center',
  },
  resetButtonText: {
    fontSize: 16,
    color: '#F44336',
    fontWeight: '600',
  },
});
