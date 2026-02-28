import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  Text,
  Switch,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { User } from '../types';
import { getUser } from '../services/firestore';
import { getCurrentUser, signInAnonymouslyAuth } from '../services/auth';

export default function ProfileScreen() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [locationTrackingEnabled, setLocationTrackingEnabled] = useState(true);

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    const firebaseUser = getCurrentUser();
    if (!firebaseUser) {
      // Sign in anonymously if not logged in
      try {
        await signInAnonymouslyAuth();
        const newFirebaseUser = getCurrentUser();
        if (newFirebaseUser) {
          const userData = await getUser(newFirebaseUser.uid);
          setUser(userData);
        }
      } catch (error) {
        console.error('Error signing in:', error);
      }
    } else {
      const userData = await getUser(firebaseUser.uid);
      setUser(userData);
    }
    setLoading(false);
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4CAF50" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.profileHeader}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {user?.id.charAt(0).toUpperCase() || '?'}
          </Text>
        </View>
        <Text style={styles.userId}>
          {user?.id.substring(0, 8) || 'Anonym bruger'}
        </Text>
      </View>

      <View style={styles.statsSection}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{user?.karma || 0}</Text>
          <Text style={styles.statLabel}>Karma Points</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>
            {user?.createdAt
              ? Math.floor(
                  (Date.now() - user.createdAt.getTime()) / (1000 * 60 * 60 * 24)
                )
              : 0}
          </Text>
          <Text style={styles.statLabel}>Dage medlem</Text>
        </View>
      </View>

      <View style={styles.settingsSection}>
        <Text style={styles.sectionTitle}>Indstillinger</Text>

        <View style={styles.settingItem}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>Notifikationer</Text>
            <Text style={styles.settingDescription}>
              Få besked når nye parkeringspladser er tilgængelige
            </Text>
          </View>
          <Switch
            value={notificationsEnabled}
            onValueChange={setNotificationsEnabled}
            trackColor={{ false: '#ccc', true: '#4CAF50' }}
            thumbColor="#fff"
          />
        </View>

        <View style={styles.settingItem}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>Lokationssporing</Text>
            <Text style={styles.settingDescription}>
              Del din lokation for bedre parkeringsanbefalinger
            </Text>
          </View>
          <Switch
            value={locationTrackingEnabled}
            onValueChange={setLocationTrackingEnabled}
            trackColor={{ false: '#ccc', true: '#4CAF50' }}
            thumbColor="#fff"
          />
        </View>
      </View>

      <View style={styles.upgradeSection}>
        <Text style={styles.upgradeTitle}>Opgradér din konto</Text>
        <Text style={styles.upgradeDescription}>
          Log ind med email for at gemme din historik og få adgang til premium
          funktioner
        </Text>
        <TouchableOpacity style={styles.upgradeButton} disabled>
          <Text style={styles.upgradeButtonText}>Kommer snart</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileHeader: {
    backgroundColor: 'white',
    padding: 24,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#4CAF50',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  avatarText: {
    fontSize: 32,
    color: 'white',
    fontWeight: 'bold',
  },
  userId: {
    fontSize: 14,
    color: '#666',
  },
  statsSection: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#4CAF50',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: '#666',
  },
  settingsSection: {
    backgroundColor: 'white',
    marginTop: 8,
    padding: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 16,
  },
  settingItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  settingInfo: {
    flex: 1,
    marginRight: 16,
  },
  settingLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
    marginBottom: 4,
  },
  settingDescription: {
    fontSize: 12,
    color: '#666',
  },
  upgradeSection: {
    margin: 16,
    padding: 20,
    backgroundColor: '#E3F2FD',
    borderRadius: 8,
    alignItems: 'center',
  },
  upgradeTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1976D2',
    marginBottom: 8,
  },
  upgradeDescription: {
    fontSize: 14,
    color: '#1976D2',
    textAlign: 'center',
    marginBottom: 16,
  },
  upgradeButton: {
    backgroundColor: '#1976D2',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    opacity: 0.6,
  },
  upgradeButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
});
