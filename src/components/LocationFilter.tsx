/**
 * LOCATION FILTER - Multi-lokasi filtering dropdown
 * Supervisor & Admin can filter data by client location
 */
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Modal, FlatList, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants';
import { useTheme } from '../lib/theme';
import { useI18n } from '../lib/i18n';
import { useDataStore } from '../stores/dataStore';

interface Props {
  selectedId: string | null; // null = all locations
  onSelect: (lokasiId: string | null) => void;
  style?: any;
}

export default function LocationFilter({ selectedId, onSelect, style }: Props) {
  const { theme, isDark } = useTheme();
  const { t } = useI18n();
  const lokasi = useDataStore((s) => s.lokasi);
  const [visible, setVisible] = useState(false);

  const selectedName = selectedId
    ? lokasi.find(l => l.id === selectedId)?.nama || 'Unknown'
    : t('general.all_locations');

  return (
    <View style={style}>
      <TouchableOpacity
        style={[styles.trigger, { backgroundColor: theme.bgCard, borderColor: theme.border }]}
        onPress={() => setVisible(true)}
        activeOpacity={0.7}
      >
        <Ionicons name="location-outline" size={16} color={theme.primary} />
        <Text style={[styles.triggerText, { color: theme.text }]} numberOfLines={1}>{selectedName}</Text>
        <Ionicons name="chevron-down" size={14} color={theme.textMuted} />
      </TouchableOpacity>

      <Modal visible={visible} transparent animationType="fade" onRequestClose={() => setVisible(false)}>
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setVisible(false)}>
          <View style={[styles.modal, { backgroundColor: theme.bgCard }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>{t('export.select_location')}</Text>

            {/* All locations option */}
            <TouchableOpacity
              style={[styles.option, !selectedId && styles.optionSelected, !selectedId && { backgroundColor: theme.primarySoft }]}
              onPress={() => { onSelect(null); setVisible(false); }}
            >
              <Ionicons name="globe-outline" size={18} color={!selectedId ? theme.primary : theme.textSecondary} />
              <Text style={[styles.optionText, { color: !selectedId ? theme.primary : theme.text }]}>{t('general.all_locations')}</Text>
              {!selectedId && <Ionicons name="checkmark" size={18} color={theme.primary} />}
            </TouchableOpacity>

            <FlatList
              data={lokasi}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => {
                const isSelected = item.id === selectedId;
                return (
                  <TouchableOpacity
                    style={[styles.option, isSelected && styles.optionSelected, isSelected && { backgroundColor: theme.primarySoft }]}
                    onPress={() => { onSelect(item.id); setVisible(false); }}
                  >
                    <Ionicons name="business-outline" size={18} color={isSelected ? theme.primary : theme.textSecondary} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.optionText, { color: isSelected ? theme.primary : theme.text }]}>{item.nama}</Text>
                      {item.alamat ? <Text style={[styles.optionSub, { color: theme.textMuted }]}>{item.alamat}</Text> : null}
                    </View>
                    {isSelected && <Ionicons name="checkmark" size={18} color={theme.primary} />}
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 8, borderWidth: 1,
  },
  triggerText: { flex: 1, fontSize: 13, fontWeight: '600' },
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center', paddingHorizontal: 24,
  },
  modal: {
    borderRadius: 14, padding: 16, maxHeight: 400,
  },
  modalTitle: { fontSize: 16, fontWeight: '700', marginBottom: 12 },
  option: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 12, paddingHorizontal: 12,
    borderRadius: 8, marginBottom: 4,
  },
  optionSelected: { borderRadius: 8 },
  optionText: { flex: 1, fontSize: 14, fontWeight: '500' },
  optionSub: { fontSize: 11, marginTop: 1 },
});
