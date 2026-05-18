import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Modal,
  Pressable,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { saveUserProfile, hasUserProfile, setLocalProfile } from '../src/services/userProfileService';
import { canUseFirestore } from '../src/config/firebase';
import { ONBOARDING_COMPLETED_KEY, PROFILE_COMPLETED_KEY } from '../src/constants/onboarding';

const SAVE_TIMEOUT_MS = 15000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error('Timeout')), ms)
    ),
  ]);
}

const carData = require('../assets/data/cars.json') as Record<string, string[]>;
const CAR_BRANDS = Object.keys(carData).sort();

function isValidLicensePlate(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length >= 5 && trimmed.length <= 10;
}

export default function ProfileSetupScreen() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [brandSearch, setBrandSearch] = useState('');
  const [carBrand, setCarBrand] = useState('');
  const [carModel, setCarModel] = useState('');
  const [licensePlate, setLicensePlate] = useState('');
  const [modelModalVisible, setModelModalVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [checking, setChecking] = useState(true);

  const filteredBrands = useMemo(() => {
    const q = brandSearch.trim().toLowerCase();
    if (!q) return [];
    return CAR_BRANDS.filter((b) => b.toLowerCase().includes(q));
  }, [brandSearch]);

  const models = carBrand ? (carData[carBrand] ?? []) : [];

  useEffect(() => {
    if (carBrand) setCarModel('');
  }, [carBrand]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const hasProfile = await hasUserProfile();
        if (!cancelled && hasProfile) {
          await AsyncStorage.setItem(PROFILE_COMPLETED_KEY, 'true');
          await AsyncStorage.setItem(ONBOARDING_COMPLETED_KEY, 'true');
          router.replace('/');
          return;
        }
      } catch {
        // Continue to form
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();
    return () => { cancelled = true; };
  }, [router]);

  const handleSubmit = async () => {
    const trimmedName = name.trim();
    const ageNum = parseInt(age, 10);
    const trimmedPlate = licensePlate.trim();

    if (!trimmedName) {
      Alert.alert('Manglende felt', 'Indtast dit navn.');
      return;
    }
    if (!Number.isFinite(ageNum) || ageNum < 1 || ageNum > 120) {
      Alert.alert('Ugyldig alder', 'Indtast en alder mellem 1 og 120.');
      return;
    }
    if (!carBrand) {
      Alert.alert('Manglende felt', 'Vælg bilmærke.');
      return;
    }
    if (!carModel) {
      Alert.alert('Manglende felt', 'Vælg bilmodel.');
      return;
    }
    if (!isValidLicensePlate(trimmedPlate)) {
      Alert.alert('Ugyldig nummerplade', 'Nummerpladen skal være 5–10 tegn.');
      return;
    }

    setSubmitting(true);
    const profileData = {
      name: trimmedName,
      age: ageNum,
      carBrand,
      carModel,
      licensePlate: trimmedPlate,
    };
    try {
      let saved = false;
      if (canUseFirestore()) {
        try {
          await withTimeout(saveUserProfile(profileData), SAVE_TIMEOUT_MS);
          saved = true;
        } catch (firebaseErr) {
          if (__DEV__) console.debug('[ProfileSetup] Firebase save failed, falling back to local:', firebaseErr);
          await setLocalProfile(profileData);
          saved = true;
        }
      } else {
        await setLocalProfile(profileData);
        saved = true;
      }
      if (saved) {
        await AsyncStorage.setItem(PROFILE_COMPLETED_KEY, 'true');
        await AsyncStorage.setItem(ONBOARDING_COMPLETED_KEY, 'true');
        router.replace('/');
      } else {
        throw new Error('Save failed');
      }
    } catch (e) {
      if (__DEV__) console.debug('[ProfileSetup] save failed:', e);
      Alert.alert('Fejl', 'Kunne ikke gemme profil – prøv igen.');
    } finally {
      setSubmitting(false);
    }
  };

  const selectBrand = (brand: string) => {
    setCarBrand(brand);
    setBrandSearch(brand);
  };

  const selectModel = (model: string) => {
    setCarModel(model);
    setModelModalVisible(false);
  };

  if (checking) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#14B8A6" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 60 : 0}
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>Opret profil</Text>
        <Text style={styles.subtitle}>Udfyld dine oplysninger for at komme i gang</Text>

        <Text style={styles.label}>Navn</Text>
        <TextInput
          style={styles.input}
          placeholder="Dit navn"
          placeholderTextColor="#999"
          value={name}
          onChangeText={setName}
          autoCapitalize="words"
          autoCorrect={false}
        />

        <Text style={styles.label}>Alder</Text>
        <TextInput
          style={styles.input}
          placeholder="Fx 25"
          placeholderTextColor="#999"
          value={age}
          onChangeText={setAge}
          keyboardType="number-pad"
          maxLength={3}
        />

        <Text style={styles.label}>Bilmærke</Text>
        <TextInput
          style={styles.input}
          placeholder="Search car brand..."
          placeholderTextColor="#999"
          value={brandSearch}
          onChangeText={(t) => {
            setBrandSearch(t);
            if (!t.trim()) setCarBrand('');
          }}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {filteredBrands.length > 0 && brandSearch !== carBrand && (
          <View style={styles.brandList}>
            {filteredBrands.map((b) => (
              <TouchableOpacity
                key={b}
                style={styles.brandOption}
                onPress={() => selectBrand(b)}
              >
                <Text style={styles.brandOptionText}>{b}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
        {carBrand && (
          <Text style={styles.selectedBrand}>Valgt: {carBrand}</Text>
        )}

        <Text style={styles.label}>Bilmodel</Text>
        <TouchableOpacity
          style={[styles.selectButton, !carBrand && styles.selectButtonDisabled]}
          onPress={() => carBrand && setModelModalVisible(true)}
          disabled={!carBrand}
        >
          <Text
            style={
              carModel ? styles.selectButtonText : styles.selectButtonPlaceholder
            }
          >
            {carModel || (carBrand ? 'Vælg model' : 'Vælg mærke først')}
          </Text>
        </TouchableOpacity>

        <Text style={styles.label}>Nummerplade</Text>
        <TextInput
          style={styles.input}
          placeholder="Fx AB12345"
          placeholderTextColor="#999"
          value={licensePlate}
          onChangeText={(t) => setLicensePlate(t.toUpperCase())}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={10}
        />
        <Text style={styles.hint}>5–10 tegn</Text>

        <TouchableOpacity
          style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={submitting}
        >
          {submitting ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.submitButtonText}>Start med PARKLY</Text>
          )}
        </TouchableOpacity>
      </ScrollView>

      <Modal
        visible={modelModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setModelModalVisible(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setModelModalVisible(false)}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Vælg model ({carBrand})</Text>
            <ScrollView style={styles.modalList}>
              {models.map((m) => (
                <TouchableOpacity
                  key={m}
                  style={styles.modalOption}
                  onPress={() => selectModel(m)}
                >
                  <Text style={styles.modalOptionText}>{m}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  scroll: { flex: 1 },
  scrollContent: {
    padding: 24,
    paddingTop: 60,
    paddingBottom: 40,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#111',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 17,
    color: '#666',
    marginBottom: 32,
  },
  label: {
    fontSize: 15,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
    marginTop: 16,
  },
  input: {
    backgroundColor: '#f5f5f5',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#333',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  brandList: {
    marginTop: 4,
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    maxHeight: 160,
  },
  brandOption: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  brandOptionText: { fontSize: 16, color: '#333' },
  selectedBrand: {
    fontSize: 13,
    color: '#14B8A6',
    marginTop: 6,
    fontWeight: '600',
  },
  selectButton: {
    backgroundColor: '#f5f5f5',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  selectButtonDisabled: { opacity: 0.6 },
  selectButtonText: { fontSize: 16, color: '#333' },
  selectButtonPlaceholder: { fontSize: 16, color: '#999' },
  hint: { fontSize: 12, color: '#999', marginTop: 4, marginLeft: 4 },
  submitButton: {
    backgroundColor: '#14B8A6',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 32,
  },
  submitButtonDisabled: { opacity: 0.7 },
  submitButtonText: { fontSize: 17, fontWeight: '600', color: '#fff' },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 24,
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 12,
    maxHeight: 400,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  modalList: { maxHeight: 320 },
  modalOption: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  modalOptionText: { fontSize: 16, color: '#333' },
});
