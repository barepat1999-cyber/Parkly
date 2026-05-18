import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useParkingDetection } from '../store/ParkingDetectionContext';
import { parkingStatusHeadline } from '../utils/parkingDetectionLabels';

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

export type ParkingDetectionBannerProps = {
  /** When true, show Confirm / Leave / Reset / Mock and extra diagnostics. */
  debugMode?: boolean;
};

/**
 * Parking session + detection status. Recommendation lives in the Map screen when no session.
 */
export function ParkingDetectionBanner({
  debugMode = false,
}: ParkingDetectionBannerProps): React.ReactElement | null {
  const {
    locationPermission,
    notificationPermission,
    nearestBay,
    detectionState,
    activeSession,
    mappedSegments,
    confirmParkingAtBay,
    leaveParkingManually,
    resetParkingSession,
    mockSimulateNearBay,
  } = useParkingDetection();

  const firstSegment = mappedSegments[0];
  const permOk = locationPermission === 'granted' && notificationPermission === 'granted';
  const headline = parkingStatusHeadline(detectionState);

  const showStatus =
    !permOk ||
    detectionState !== 'idle' ||
    (activeSession?.isActive ?? false);

  if (!showStatus) {
    return null;
  }

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      {!permOk && (
        <Text style={styles.warn}>
          {locationPermission !== 'granted'
            ? 'Slå lokation til for parkeringsdetektion.'
            : 'Slå notifikationer til for påmindelser.'}
        </Text>
      )}

      {headline && permOk && !activeSession?.isActive && (
        <View style={styles.headlineBlock}>
          <View style={styles.statusDotAmber} />
          <Text style={styles.headline} numberOfLines={2}>
            {headline}
          </Text>
        </View>
      )}

      {activeSession?.isActive && (
        <View style={styles.parkedCard}>
          <View style={styles.parkedHeader}>
            <View style={styles.parkedBadge}>
              <View style={styles.parkedBadgeDot} />
              <Text style={styles.parkedBadgeText}>Aktiv parkering</Text>
            </View>
            <Text style={styles.parkedTitle}>Du er parkeret</Text>
            <Text style={styles.trustLine}>Registreret af dig i denne session</Text>
          </View>
          {detectionState === 'suspected_leaving' && (
            <View style={styles.leavingRow}>
              <View style={styles.statusDotAmber} />
              <Text style={styles.leavingHint}>Ser ud til du kører væk…</Text>
            </View>
          )}
          <Text style={styles.timeLine}>
            Startet kl. {formatTime(activeSession.startTime)}
            {nearestBay?.streetName ? ` · ${nearestBay.streetName}` : ''}
          </Text>
          <TouchableOpacity
            style={styles.primaryLeave}
            onPress={leaveParkingManually}
            accessibilityRole="button"
            accessibilityLabel="Jeg er kørt"
          >
            <Text style={styles.primaryLeaveText}>Jeg er kørt</Text>
            <Text style={styles.primaryLeaveHint}>Frigiv pladsen på kortet</Text>
          </TouchableOpacity>
        </View>
      )}

      {debugMode && firstSegment && (
        <View style={styles.devRow}>
          <TouchableOpacity style={styles.devBtn} onPress={() => confirmParkingAtBay(firstSegment)}>
            <Text style={styles.devBtnText}>Confirm</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.devBtn} onPress={leaveParkingManually}>
            <Text style={styles.devBtnText}>Leave</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.devBtn} onPress={() => void resetParkingSession()}>
            <Text style={styles.devBtnText}>Reset</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.devBtn} onPress={mockSimulateNearBay}>
            <Text style={styles.devBtnText}>Mock</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: 'rgba(255, 255, 255, 0.96)',
    marginHorizontal: 0,
    marginBottom: 0,
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(15, 23, 42, 0.08)',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  warn: {
    color: '#991B1B',
    fontSize: 14,
    marginBottom: 8,
    lineHeight: 20,
  },
  headlineBlock: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  statusDotAmber: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#D97706',
    marginTop: 6,
  },
  headline: {
    flex: 1,
    fontSize: 15,
    color: '#0F172A',
    fontWeight: '600',
    lineHeight: 21,
  },
  parkedCard: {},
  parkedHeader: {
    marginBottom: 8,
  },
  parkedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(22, 163, 74, 0.12)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    marginBottom: 10,
  },
  parkedBadgeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#16A34A',
    marginRight: 8,
  },
  parkedBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#15803D',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  parkedTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0F172A',
    letterSpacing: -0.3,
    lineHeight: 26,
  },
  trustLine: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 4,
    lineHeight: 16,
  },
  leavingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
    marginTop: 2,
  },
  leavingHint: {
    flex: 1,
    fontSize: 14,
    color: '#B45309',
    fontWeight: '600',
    lineHeight: 20,
  },
  timeLine: {
    fontSize: 14,
    color: '#475569',
    lineHeight: 20,
  },
  primaryLeave: {
    marginTop: 16,
    alignSelf: 'stretch',
    backgroundColor: '#1E40AF',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
    alignItems: 'center',
    shadowColor: '#1E3A8A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 6,
    elevation: 3,
  },
  primaryLeaveText: {
    fontSize: 16,
    color: '#FFFFFF',
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  primaryLeaveHint: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.85)',
    marginTop: 3,
    fontWeight: '500',
  },
  devRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(15, 23, 42, 0.08)',
  },
  devBtn: {
    backgroundColor: '#FFF7ED',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    marginRight: 8,
    marginBottom: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(234, 88, 12, 0.25)',
  },
  devBtnText: { fontSize: 12, color: '#C2410C', fontWeight: '600' },
});
