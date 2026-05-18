import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { Marker } from 'react-native-maps';

type Props = {
  latitude: number;
  longitude: number;
  headingDeg: number | null;
  accuracyMeters?: number;
};

/**
 * Calm navigation puck: accuracy halo, white shell, blue core, white “you” dot, forward chevron.
 * Anchor at disc center so GPS fix matches the road position.
 */
export function DrivingUserMarker({
  latitude,
  longitude,
  headingDeg,
  accuracyMeters,
}: Props): React.ReactElement {
  const rotation = headingDeg != null && headingDeg >= 0 ? headingDeg : 0;

  const haloScale = useMemo(() => {
    if (accuracyMeters == null || accuracyMeters <= 0) return 1;
    return 1 + Math.min(accuracyMeters / 200, 0.4);
  }, [accuracyMeters]);

  const a11yLabel =
    accuracyMeters != null && accuracyMeters > 0
      ? `Din position, cirka ${Math.round(accuracyMeters)} meters nøjagtighed`
      : 'Din position';

  return (
    <Marker
      coordinate={{ latitude, longitude }}
      anchor={{ x: 0.5, y: 0.5 }}
      rotation={rotation}
      flat
      zIndex={2000}
      tracksViewChanges={false}
    >
      <View style={styles.root} accessibilityLabel={a11yLabel}>
        <View
          style={[
            styles.halo,
            {
              transform: [{ scale: haloScale }],
              opacity: accuracyMeters != null && accuracyMeters > 50 ? 0.4 : 0.26,
            },
          ]}
        />
        <View style={styles.discOuter}>
          <View style={styles.discInner}>
            <View style={styles.chevron} />
            <View style={styles.youDot} />
          </View>
        </View>
      </View>
    </Marker>
  );
}

const DISC = 46;

const styles = StyleSheet.create({
  root: {
    width: DISC + 14,
    height: DISC + 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  halo: {
    position: 'absolute',
    width: DISC + 10,
    height: DISC + 10,
    borderRadius: (DISC + 10) / 2,
    backgroundColor: 'rgba(59, 130, 246, 0.38)',
  },
  discOuter: {
    width: DISC,
    height: DISC,
    borderRadius: DISC / 2,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#FFFFFF',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.18,
    shadowRadius: 7,
    elevation: 6,
  },
  discInner: {
    width: DISC - 8,
    height: DISC - 8,
    borderRadius: (DISC - 8) / 2,
    backgroundColor: '#2563EB',
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 7,
  },
  chevron: {
    width: 0,
    height: 0,
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderBottomWidth: 13,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: 'rgba(255, 255, 255, 0.96)',
    marginBottom: 2,
  },
  youDot: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: '#FFFFFF',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.95)',
  },
});
