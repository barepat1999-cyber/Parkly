import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Modal,
  Pressable,
} from 'react-native';
import { useReportStore } from '../../src/store/ReportStoreContext';
import type { TimeFilterValue } from '../../src/store/ReportStoreContext';
import { ParkingReport, formatTime, formatDateLabel } from '../../src/types/parking';

const FILTER_OPTIONS: { value: TimeFilterValue; label: string }[] = [
  { value: '15', label: '15 min' },
  { value: '30', label: '30 min' },
  { value: '60', label: '60 min' },
  { value: 'all', label: 'All' },
];

function getStatusColor(status: ParkingReport['status']): string {
  return status === 'available' ? '#4CAF50' : '#F44336';
}

function getStatusText(status: ParkingReport['status']): string {
  return status === 'available' ? 'Ledig' : 'Optaget';
}

function roundCoord(n: number): number {
  return Math.round(n * 10000) / 10000;
}

export default function HistoryScreen() {
  const { reportsByDay, isReady, timeFilter, setTimeFilter } = useReportStore();
  const [refreshing, setRefreshing] = useState(false);
  const [filterModalVisible, setFilterModalVisible] = useState(false);

  const onRefresh = React.useCallback(async () => {
    setRefreshing(true);
    await new Promise((r) => setTimeout(r, 300));
    setRefreshing(false);
  }, []);

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      <View style={styles.filterRow}>
        <TouchableOpacity style={styles.filterChip} onPress={() => setFilterModalVisible(true)}>
          <Text style={styles.filterChipText}>
            {FILTER_OPTIONS.find((o) => o.value === timeFilter)?.label ?? 'Filter'}
          </Text>
        </TouchableOpacity>
      </View>
      <View style={styles.section}>
        {!isReady || reportsByDay.length === 0 ? (
          <Text style={styles.emptyText}>No reports yet</Text>
        ) : (
          reportsByDay.map((group) => (
            <View key={group.dateKey} style={styles.dayGroup}>
              <Text style={styles.dayLabel}>{group.label}</Text>
              {group.reports.map((report) => (
                <View key={report.id} style={styles.reportItem}>
                  <View style={styles.reportHeader}>
                    <View style={styles.reportTitleBlock}>
                      <Text style={styles.reportTitle}>Spot</Text>
                      <Text style={styles.reportCoords}>
                        {roundCoord(report.latitude)}, {roundCoord(report.longitude)}
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.statusBadge,
                        { backgroundColor: getStatusColor(report.status) },
                      ]}
                    >
                      <Text style={styles.statusBadgeText}>
                        {getStatusText(report.status)}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.reportTime}>
                    {formatDateLabel(report.createdAt)} {formatTime(report.createdAt)}
                  </Text>
                </View>
              ))}
            </View>
          ))
        )}
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
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  filterRow: { flexDirection: 'row', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
  filterChip: {
    backgroundColor: '#fff',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  filterChipText: { fontSize: 14, fontWeight: '600', color: '#333' },
  filterOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'flex-start',
    paddingTop: 100,
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
  section: {
    backgroundColor: '#fff',
    margin: 16,
    marginTop: 8,
    padding: 16,
    borderRadius: 8,
  },
  emptyText: {
    color: '#999',
    fontStyle: 'italic',
    paddingVertical: 8,
  },
  dayGroup: {
    marginBottom: 20,
  },
  dayLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  reportItem: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  reportHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  reportTitleBlock: { flex: 1 },
  reportTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  reportCoords: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  reportTime: {
    fontSize: 12,
    color: '#999',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  statusBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
});
