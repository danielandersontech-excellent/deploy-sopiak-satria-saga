import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Radius } from '../../constants';
import { Card, Badge, Button } from '../../components';
import { useDataStore } from '../../stores/dataStore';
import { useI18n } from '../../lib/i18n';
import { useTheme } from '../../lib/theme';

export default function SetupCheckpointScreen({ navigation }: any) {
  const { t } = useI18n();
  const { theme, isDark } = useTheme();
  const checkpoints = useDataStore((s) => s.checkpoints);
  const addCheckpoint = useDataStore((s) => s.addCheckpoint);
  const updateCheckpoint = useDataStore((s) => s.updateCheckpoint);
  const deleteCheckpoint = useDataStore((s) => s.deleteCheckpoint);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newArea, setNewArea] = useState('');
  const [newLokasi, setNewLokasi] = useState('');
  const [search, setSearch] = useState('');
  const filtered = search ? checkpoints.filter((c) => c.nama.toLowerCase().includes(search.toLowerCase())) : checkpoints;

  const handleAdd = () => {
    if (!newName.trim()) return Alert.alert('Error', 'Nama checkpoint wajib diisi');
    addCheckpoint({ nama: newName, area: newArea || 'Area Baru', lokasi: newLokasi || 'Lokasi baru', latitude: 0.5071, longitude: 101.4478, radius: 15, qrCode: `QR-${newName.toUpperCase().replace(/\s/g, '-')}`, status: 'active' });
    setShowAdd(false); setNewName(''); setNewArea(''); setNewLokasi('');
    Alert.alert('✅ Berhasil', 'Checkpoint baru ditambahkan');
  };

  const handleToggle = (id: string, current: string) => {
    updateCheckpoint(id, { status: current === 'active' ? 'inactive' : 'active' });
  };

  const handleDelete = (id: string, nama: string) => {
    Alert.alert('Hapus Checkpoint?', `Hapus "${nama}"?`, [
      { text: 'Batal', style: 'cancel' },
      { text: 'Hapus', style: 'destructive', onPress: () => deleteCheckpoint(id) },
    ]);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}><Ionicons name="arrow-back" size={24} color={Colors.textPrimary} /></TouchableOpacity>
        <Text style={styles.headerTitle}>Setup Checkpoint</Text>
        <TouchableOpacity onPress={() => setShowAdd(true)}><Ionicons name="add-circle" size={28} color={Colors.primary} /></TouchableOpacity>
      </View>
      <View style={styles.searchRow}><Ionicons name="search" size={18} color={Colors.textMuted} /><TextInput style={styles.searchInput} placeholder="Cari checkpoint..." placeholderTextColor={Colors.textMuted} value={search} onChangeText={setSearch} /></View>
      <Text style={styles.countText}>{filtered.length} checkpoint</Text>
      <ScrollView contentContainerStyle={styles.content}>
        {filtered.map((cp) => (
          <Card key={cp.id} style={styles.cpCard}>
            <View style={styles.cpRow}>
              <View style={[styles.cpDot, { backgroundColor: cp.status === 'active' ? Colors.success : Colors.textMuted }]} />
              <View style={{ flex: 1 }}>
                <Text style={styles.cpName}>{cp.nama}</Text>
                <Text style={styles.cpMeta}>{cp.area} • {cp.lokasi}</Text>
                <Text style={styles.cpCode}>QR: {cp.qrCode}</Text>
              </View>
              <Badge text={cp.status === 'active' ? 'Aktif' : 'Nonaktif'} variant={cp.status === 'active' ? 'success' : 'default'} />
            </View>
            <View style={styles.cpActions}>
              <Button title={cp.status === 'active' ? 'Nonaktifkan' : 'Aktifkan'} variant="outline" size="small" onPress={() => handleToggle(cp.id, cp.status)} style={{ flex: 1 }} />
              <Button title="Hapus" variant="outline" size="small" onPress={() => handleDelete(cp.id, cp.nama)} style={{ flex: 1 }} textStyle={{ color: Colors.danger }} />
            </View>
          </Card>
        ))}
        <View style={{ height: 32 }} />
      </ScrollView>
      <Modal visible={showAdd} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Tambah Checkpoint</Text>
            <Text style={styles.fLabel}>Nama *</Text>
            <TextInput style={styles.fInput} value={newName} onChangeText={setNewName} placeholder="Nama checkpoint" placeholderTextColor={Colors.textMuted} />
            <Text style={styles.fLabel}>Area</Text>
            <TextInput style={styles.fInput} value={newArea} onChangeText={setNewArea} placeholder="Area A / B / C" placeholderTextColor={Colors.textMuted} />
            <Text style={styles.fLabel}>Lokasi Detail</Text>
            <TextInput style={styles.fInput} value={newLokasi} onChangeText={setNewLokasi} placeholder="Deskripsi lokasi" placeholderTextColor={Colors.textMuted} />
            <View style={styles.modalActions}>
              <Button title="Batal" variant="outline" size="medium" onPress={() => setShowAdd(false)} style={{ flex: 1 }} />
              <Button title="Tambah" variant="primary" size="medium" onPress={handleAdd} style={{ flex: 1 }} />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgLight },
  header: { flexDirection: 'row', alignItems: 'center', paddingTop: 50, paddingBottom: 12, paddingHorizontal: Spacing.base, backgroundColor: Colors.bgWhite, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  headerTitle: { ...Typography.h3, color: Colors.textPrimary, flex: 1, textAlign: 'center' },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: Spacing.base, marginVertical: 8, backgroundColor: Colors.bgGray, borderRadius: Radius.md, paddingHorizontal: 12, height: 42 },
  searchInput: { flex: 1, ...Typography.body, color: Colors.textPrimary },
  countText: { ...Typography.caption, color: Colors.textMuted, paddingHorizontal: Spacing.base, marginBottom: 4 },
  content: { paddingHorizontal: Spacing.base },
  cpCard: { marginBottom: 8 },
  cpRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  cpDot: { width: 10, height: 10, borderRadius: 5, marginTop: 6 },
  cpName: { ...Typography.bodyBold, color: Colors.textPrimary },
  cpMeta: { ...Typography.caption, color: Colors.textMuted },
  cpCode: { ...Typography.caption, color: Colors.primary, fontWeight: '600', marginTop: 2 },
  cpActions: { flexDirection: 'row', gap: 8, marginTop: 10 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24 },
  modalTitle: { ...Typography.h3, color: Colors.textPrimary, marginBottom: 16 },
  fLabel: { ...Typography.smallBold, color: Colors.textSecondary, marginBottom: 4, marginTop: 10 },
  fInput: { borderWidth: 1.5, borderColor: Colors.border, borderRadius: Radius.md, paddingHorizontal: 14, height: 44, ...Typography.body, color: Colors.textPrimary },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 20 },
});
