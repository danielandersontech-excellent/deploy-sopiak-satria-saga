/**
 * SETUP CHECKPOINT - v2 (Bug-Fix Pass)
 *
 * FIXES (v2):
 *  ðŸš¨ Hardcoded latitude: 0.5071, longitude: 101.4478 (Pekanbaru!) for ALL new
 *     checkpoints â€” now uses user-entered values with validation.
 *  ðŸš¨ No lokasi_id assigned â€” checkpoint had no foreign key to lokasi.
 *     Now requires lokasi selection from dropdown and passes lokasi_id to API.
 *  ðŸš¨ Used store.addCheckpoint which doesn't pass lokasi_id. Now calls
 *     dataApi.checkpoints.create() directly + syncs local state.
 *
 *  âœ… Dark mode + i18n (was importing both but using neither).
 *  âœ… Modal `onRequestClose` for Android back button.
 *  âœ… Lat/lng/radius input fields added.
 *  âœ… Coordinate range validation (-90..90, -180..180).
 *  âœ… Radius validation (5-200m).
 *  âœ… QR code uniqueness via timestamp suffix.
 *  âœ… Edit mode for checkpoint (was only status toggle).
 *  âœ… Empty state.
 *  âœ… Pull-to-refresh.
 *  âœ… Submitting state.
 */
import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert,
  Modal, KeyboardAvoidingView, Platform, RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Radius } from '../../constants';
import { Card, Badge, Button } from '../../components';
import { useDataStore } from '../../stores/dataStore';
import { dataApi } from '../../lib/apiClient';
import { useI18n } from '../../lib/i18n';
import { useTheme } from '../../lib/theme';

function getField(obj: any, ...keys: string[]): any {
  if (!obj) return undefined;
  for (const k of keys) if (obj[k] !== undefined && obj[k] !== null) return obj[k];
  return undefined;
}

function isValidLatLng(lat: number, lng: number): boolean {
  if (isNaN(lat) || isNaN(lng)) return false;
  return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

export default function SetupCheckpointScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const { t, lang } = useI18n();
  const { theme, isDark } = useTheme();
  const checkpoints = useDataStore((s) => s.checkpoints);
  const lokasi = useDataStore((s) => s.lokasi);
  const updateCheckpoint = useDataStore((s) => s.updateCheckpoint);
  const deleteCheckpoint = useDataStore((s) => s.deleteCheckpoint);
  const loadAllData = useDataStore((s) => s.loadAllData);

  // === Modal state (used for both add and edit) ===
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [fName, setFName] = useState('');
  const [fArea, setFArea] = useState('');
  const [fLokasiId, setFLokasiId] = useState('');
  const [fLat, setFLat] = useState('');
  const [fLng, setFLng] = useState('');
  const [fRadius, setFRadius] = useState('15');
  const [fStatus, setFStatus] = useState<'active' | 'inactive'>('active');

  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const filtered = search
    ? checkpoints.filter(
        (c) =>
          c.nama.toLowerCase().includes(search.toLowerCase()) ||
          (c.area || '').toLowerCase().includes(search.toLowerCase())
      )
    : checkpoints;

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await loadAllData?.(); } catch {}
    finally { setRefreshing(false); }
  }, [loadAllData]);

  const openAddModal = () => {
    if (lokasi.length === 0) {
      Alert.alert(
        lang === 'en' ? 'No Locations' : 'Belum Ada Lokasi',
        lang === 'en'
          ? 'Please create a location first before adding checkpoints.'
          : 'Silakan buat lokasi terlebih dahulu sebelum menambah checkpoint.'
      );
      return;
    }
    setEditingId(null);
    setFName('');
    setFArea('');
    setFLokasiId(lokasi[0]?.id || '');
    // default coords from first lokasi's first pos, or empty
    const refPos = lokasi[0]?.posList?.[0];
    setFLat(refPos?.latitude != null ? String(refPos.latitude) : '');
    setFLng(refPos?.longitude != null ? String(refPos.longitude) : '');
    setFRadius('15');
    setFStatus('active');
    setShowModal(true);
  };

  const openEditModal = (cp: any) => {
    setEditingId(cp.id);
    setFName(cp.nama || '');
    setFArea(cp.area || '');
    // Find lokasi by name (data store stores cp.lokasi as name)
    const lok = lokasi.find((l) => l.nama === cp.lokasi);
    setFLokasiId(lok?.id || lokasi[0]?.id || '');
    setFLat(cp.latitude != null ? String(cp.latitude) : '');
    setFLng(cp.longitude != null ? String(cp.longitude) : '');
    setFRadius(cp.radius != null ? String(cp.radius) : '15');
    setFStatus(cp.status === 'active' ? 'active' : 'inactive');
    setShowModal(true);
  };

  // ðŸš¨ CRITICAL FIX: Call API directly with lokasi_id + sync local state
  const handleSave = async () => {
    if (submitting) return;

    if (!fName.trim()) {
      return Alert.alert('Error', lang === 'en' ? 'Checkpoint name is required' : 'Nama checkpoint wajib diisi');
    }
    if (!fLokasiId) {
      return Alert.alert('Error', lang === 'en' ? 'Location is required' : 'Lokasi wajib dipilih');
    }
    const lat = parseFloat(fLat);
    const lng = parseFloat(fLng);
    if (!fLat || !fLng || !isValidLatLng(lat, lng)) {
      return Alert.alert(
        'Error',
        lang === 'en'
          ? 'Invalid GPS coordinates (lat: -90..90, lng: -180..180)'
          : 'Koordinat GPS tidak valid (lat: -90..90, lng: -180..180)'
      );
    }
    const radius = parseInt(fRadius, 10);
    if (isNaN(radius) || radius < 5 || radius > 200) {
      return Alert.alert(
        'Error',
        lang === 'en' ? 'Radius must be 5-200 meters' : 'Radius harus 5-200 meter'
      );
    }

    const lok = lokasi.find((l) => l.id === fLokasiId);
    const lokasiName = lok?.nama || '-';

    setSubmitting(true);
    try {
      if (editingId) {
        // === UPDATE ===
        await dataApi.checkpoints.update(editingId, {
          nama: fName.trim(),
          area: fArea.trim() || 'Area',
          lokasi_id: fLokasiId,
          latitude: lat,
          longitude: lng,
          radius,
          status: fStatus,
        });
        // Sync via store helper for fields it supports
        updateCheckpoint(editingId, {
          nama: fName.trim(),
          area: fArea.trim() || 'Area',
          radius,
          status: fStatus,
        } as any);
        // Also sync lat/lng/lokasi which store doesn't handle
        useDataStore.setState((s) => ({
          checkpoints: s.checkpoints.map((c) =>
            c.id === editingId
              ? { ...c, latitude: lat, longitude: lng, lokasi: lokasiName }
              : c
          ),
        }));

        Alert.alert('âœ…', lang === 'en' ? 'Checkpoint updated' : 'Checkpoint berhasil diperbarui');
      } else {
        // === CREATE ===
        const qrCode = `QR-${fName.trim().toUpperCase().replace(/\s+/g, '-').replace(/[^A-Z0-9-]/g, '')}-${Date.now().toString(36).toUpperCase()}`;
        const created: any = await dataApi.checkpoints.create({
          nama: fName.trim(),
          area: fArea.trim() || 'Area',
          lokasi_id: fLokasiId,
          latitude: lat,
          longitude: lng,
          radius,
          qr_code: qrCode,
          status: fStatus,
        });

        // Sync to store
        useDataStore.setState((s) => ({
          checkpoints: [
            ...s.checkpoints,
            {
              id: String(getField(created, 'id', '_id') || `tmp-${Date.now()}`),
              nama: fName.trim(),
              area: fArea.trim() || 'Area',
              lokasi: lokasiName,
              latitude: lat,
              longitude: lng,
              radius,
              qrCode,
              status: fStatus,
            },
          ],
        }));

        Alert.alert(
          'âœ… ' + (lang === 'en' ? 'Success' : 'Berhasil'),
          lang === 'en' ? 'Checkpoint created' : 'Checkpoint baru ditambahkan'
        );
      }
      setShowModal(false);
    } catch (e: any) {
      console.log('[Checkpoint] save err:', e);
      Alert.alert(
        'Error',
        e?.message || (lang === 'en' ? 'Failed to save checkpoint' : 'Gagal menyimpan checkpoint')
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggle = (id: string, current: string) => {
    updateCheckpoint(id, { status: current === 'active' ? 'inactive' : 'active' });
  };

  const handleDelete = (id: string, nama: string) => {
    Alert.alert(
      lang === 'en' ? 'Delete Checkpoint?' : 'Hapus Checkpoint?',
      lang === 'en' ? `Delete "${nama}"?` : `Hapus "${nama}"?`,
      [
        { text: lang === 'en' ? 'Cancel' : 'Batal', style: 'cancel' },
        {
          text: lang === 'en' ? 'Delete' : 'Hapus',
          style: 'destructive',
          onPress: () => deleteCheckpoint(id),
        },
      ]
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }, { backgroundColor: theme.bgCard, borderBottomColor: theme.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]}>
          {lang === 'en' ? 'Setup Checkpoint' : 'Setup Checkpoint'}
        </Text>
        <TouchableOpacity onPress={openAddModal}>
          <Ionicons name="add-circle" size={28} color={Colors.primary} />
        </TouchableOpacity>
      </View>

      <View style={[styles.searchRow, { backgroundColor: isDark ? theme.bgInput : Colors.bgGray }]}>
        <Ionicons name="search" size={18} color={theme.textMuted} />
        <TextInput
          style={[styles.searchInput, { color: theme.text }]}
          placeholder={lang === 'en' ? 'Search checkpoint...' : 'Cari checkpoint...'}
          placeholderTextColor={theme.textMuted}
          value={search}
          onChangeText={setSearch}
        />
      </View>
      <Text style={[styles.countText, { color: theme.textMuted }]}>
        {filtered.length} checkpoint
      </Text>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
      >
        {filtered.map((cp) => (
          <Card key={cp.id} style={styles.cpCard}>
            <View style={styles.cpRow}>
              <View
                style={[
                  styles.cpDot,
                  { backgroundColor: cp.status === 'active' ? Colors.success : Colors.textMuted },
                ]}
              />
              <View style={{ flex: 1 }}>
                <Text style={[styles.cpName, { color: theme.text }]}>{cp.nama}</Text>
                <Text style={[styles.cpMeta, { color: theme.textMuted }]}>
                  {cp.area || '-'} â€¢ {cp.lokasi || '-'}
                </Text>
                <Text style={[styles.cpDetail, { color: theme.textMuted }]}>
                  {cp.latitude != null && cp.longitude != null
                    ? `${Number(cp.latitude).toFixed(4)}, ${Number(cp.longitude).toFixed(4)} â€¢ ${cp.radius || 15}m`
                    : `Radius ${cp.radius || 15}m`}
                </Text>
                <Text style={[styles.cpCode, { color: Colors.primary }]}>QR: {cp.qrCode}</Text>
              </View>
              <Badge
                text={cp.status === 'active' ? (lang === 'en' ? 'Active' : 'Aktif') : (lang === 'en' ? 'Inactive' : 'Nonaktif')}
                variant={cp.status === 'active' ? 'success' : 'default'}
              />
            </View>
            <View style={styles.cpActions}>
              <Button
                title={lang === 'en' ? 'Edit' : 'Edit'}
                variant="outline"
                size="small"
                icon="create-outline"
                onPress={() => openEditModal(cp)}
                style={{ flex: 1 }}
              />
              <Button
                title={cp.status === 'active' ? (lang === 'en' ? 'Disable' : 'Nonaktifkan') : (lang === 'en' ? 'Enable' : 'Aktifkan')}
                variant="outline"
                size="small"
                onPress={() => handleToggle(cp.id, cp.status)}
                style={{ flex: 1 }}
              />
              <Button
                title={lang === 'en' ? 'Delete' : 'Hapus'}
                variant="outline"
                size="small"
                onPress={() => handleDelete(cp.id, cp.nama)}
                style={{ flex: 1 }}
                textStyle={{ color: Colors.danger }}
              />
            </View>
          </Card>
        ))}

        {filtered.length === 0 && (
          <View style={styles.empty}>
            <Ionicons name="location-outline" size={48} color={theme.textMuted} />
            <Text style={[styles.emptyText, { color: theme.textMuted }]}>
              {search
                ? (lang === 'en' ? 'No checkpoint matches' : 'Tidak ada checkpoint yang cocok')
                : (lang === 'en' ? 'No checkpoints yet' : 'Belum ada checkpoint')}
            </Text>
            {!search && (
              <Button
                title={lang === 'en' ? 'Add Checkpoint' : 'Tambah Checkpoint'}
                variant="primary"
                size="small"
                icon="add"
                onPress={openAddModal}
              />
            )}
          </View>
        )}

        <View style={{ height: 32 }} />
      </ScrollView>

      <Modal
        visible={showModal}
        transparent
        animationType="slide"
        onRequestClose={() => !submitting && setShowModal(false)}
      >
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.modalOverlay}>
            <View style={[styles.modalCard, { backgroundColor: theme.bgCard }]}>
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: theme.text }]}>
                  {editingId
                    ? (lang === 'en' ? 'Edit Checkpoint' : 'Edit Checkpoint')
                    : (lang === 'en' ? 'Add Checkpoint' : 'Tambah Checkpoint')}
                </Text>
                <TouchableOpacity onPress={() => !submitting && setShowModal(false)} disabled={submitting}>
                  <Ionicons name="close" size={24} color={theme.textMuted} />
                </TouchableOpacity>
              </View>

              <ScrollView showsVerticalScrollIndicator={false}>
                <Text style={[styles.fLabel, { color: theme.textSecondary }]}>
                  {lang === 'en' ? 'Name' : 'Nama'} *
                </Text>
                <TextInput
                  style={[styles.fInput, { borderColor: theme.border, color: theme.text, backgroundColor: isDark ? theme.bgInput : Colors.bgWhite }]}
                  value={fName}
                  onChangeText={setFName}
                  placeholder={lang === 'en' ? 'Checkpoint name' : 'Nama checkpoint'}
                  placeholderTextColor={theme.textMuted}
                  editable={!submitting}
                  maxLength={64}
                />

                <Text style={[styles.fLabel, { color: theme.textSecondary }]}>Area</Text>
                <TextInput
                  style={[styles.fInput, { borderColor: theme.border, color: theme.text, backgroundColor: isDark ? theme.bgInput : Colors.bgWhite }]}
                  value={fArea}
                  onChangeText={setFArea}
                  placeholder={lang === 'en' ? 'e.g. Area A / B / C' : 'Contoh: Area A / B / C'}
                  placeholderTextColor={theme.textMuted}
                  editable={!submitting}
                  maxLength={64}
                />

                <Text style={[styles.fLabel, { color: theme.textSecondary }]}>
                  {lang === 'en' ? 'Location' : 'Lokasi'} *
                </Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={{ marginTop: 4 }}
                  contentContainerStyle={{ gap: 8 }}
                >
                  {lokasi.map((l) => (
                    <TouchableOpacity
                      key={l.id}
                      style={[
                        styles.lokasiChip,
                        { borderColor: theme.border, backgroundColor: isDark ? theme.bgInput : Colors.bgGray },
                        fLokasiId === l.id && {
                          backgroundColor: Colors.primary,
                          borderColor: Colors.primary,
                        },
                      ]}
                      onPress={() => !submitting && setFLokasiId(l.id)}
                      disabled={submitting}
                    >
                      <Text
                        style={[
                          styles.lokasiChipText,
                          { color: fLokasiId === l.id ? '#fff' : theme.textSecondary },
                        ]}
                      >
                        {l.nama}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.fLabel, { color: theme.textSecondary }]}>Latitude *</Text>
                    <TextInput
                      style={[styles.fInput, { borderColor: theme.border, color: theme.text, backgroundColor: isDark ? theme.bgInput : Colors.bgWhite }]}
                      value={fLat}
                      onChangeText={setFLat}
                      placeholder="-6.2088"
                      placeholderTextColor={theme.textMuted}
                      keyboardType="numeric"
                      editable={!submitting}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.fLabel, { color: theme.textSecondary }]}>Longitude *</Text>
                    <TextInput
                      style={[styles.fInput, { borderColor: theme.border, color: theme.text, backgroundColor: isDark ? theme.bgInput : Colors.bgWhite }]}
                      value={fLng}
                      onChangeText={setFLng}
                      placeholder="106.8456"
                      placeholderTextColor={theme.textMuted}
                      keyboardType="numeric"
                      editable={!submitting}
                    />
                  </View>
                </View>

                <Text style={[styles.fLabel, { color: theme.textSecondary }]}>
                  Radius ({lang === 'en' ? 'meters' : 'meter'}) *
                </Text>
                <TextInput
                  style={[styles.fInput, { borderColor: theme.border, color: theme.text, backgroundColor: isDark ? theme.bgInput : Colors.bgWhite }]}
                  value={fRadius}
                  onChangeText={setFRadius}
                  placeholder="15"
                  placeholderTextColor={theme.textMuted}
                  keyboardType="numeric"
                  editable={!submitting}
                />
                <Text style={[styles.fHint, { color: theme.textMuted }]}>
                  {lang === 'en' ? 'Scan tolerance radius (5-200m)' : 'Toleransi radius scan (5-200m)'}
                </Text>

                <Text style={[styles.fLabel, { color: theme.textSecondary }]}>Status</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TouchableOpacity
                    style={[
                      styles.statusChip,
                      { borderColor: theme.border },
                      fStatus === 'active' && { backgroundColor: Colors.success, borderColor: Colors.success },
                    ]}
                    onPress={() => !submitting && setFStatus('active')}
                    disabled={submitting}
                  >
                    <Text style={[styles.statusChipText, { color: theme.textSecondary }, fStatus === 'active' && { color: '#fff' }]}>
                      {lang === 'en' ? 'Active' : 'Aktif'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.statusChip,
                      { borderColor: theme.border },
                      fStatus === 'inactive' && { backgroundColor: Colors.textMuted, borderColor: Colors.textMuted },
                    ]}
                    onPress={() => !submitting && setFStatus('inactive')}
                    disabled={submitting}
                  >
                    <Text style={[styles.statusChipText, { color: theme.textSecondary }, fStatus === 'inactive' && { color: '#fff' }]}>
                      {lang === 'en' ? 'Inactive' : 'Nonaktif'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>

              <View style={styles.modalActions}>
                <Button
                  title={lang === 'en' ? 'Cancel' : 'Batal'}
                  variant="outline"
                  size="medium"
                  onPress={() => setShowModal(false)}
                  style={{ flex: 1 }}
                  disabled={submitting}
                />
                <Button
                  title={
                    submitting
                      ? (lang === 'en' ? 'Saving...' : 'Menyimpan...')
                      : editingId
                      ? (lang === 'en' ? 'Save' : 'Simpan')
                      : (lang === 'en' ? 'Add' : 'Tambah')
                  }
                  variant="primary"
                  size="medium"
                  onPress={handleSave}
                  style={{ flex: 1 }}
                  disabled={submitting}
                  loading={submitting}
                />
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 12,
    paddingHorizontal: Spacing.base,
    borderBottomWidth: 1,
  },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  headerTitle: { ...Typography.h3, flex: 1, textAlign: 'center' },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: Spacing.base,
    marginVertical: 8,
    borderRadius: Radius.md,
    paddingHorizontal: 12,
    height: 42,
  },
  searchInput: { flex: 1, ...Typography.body },
  countText: { ...Typography.caption, paddingHorizontal: Spacing.base, marginBottom: 4 },
  content: { paddingHorizontal: Spacing.base },
  cpCard: { marginBottom: 8 },
  cpRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  cpDot: { width: 10, height: 10, borderRadius: 5, marginTop: 6 },
  cpName: { ...Typography.bodyBold },
  cpMeta: { ...Typography.caption },
  cpDetail: { ...Typography.caption, marginTop: 1 },
  cpCode: { ...Typography.caption, fontWeight: '600', marginTop: 2, fontFamily: 'monospace' },
  cpActions: { flexDirection: 'row', gap: 8, marginTop: 10 },
  empty: { alignItems: 'center', paddingVertical: 40, gap: 10 },
  emptyText: { ...Typography.body },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCard: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, maxHeight: '90%' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  modalTitle: { ...Typography.h3 },
  fLabel: { ...Typography.smallBold, marginBottom: 4, marginTop: 12 },
  fInput: { borderWidth: 1.5, borderRadius: Radius.md, paddingHorizontal: 14, height: 44, ...Typography.body },
  fHint: { ...Typography.caption, marginTop: 4 },
  lokasiChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: Radius.full,
    borderWidth: 1,
  },
  lokasiChipText: { ...Typography.caption, fontWeight: '600' },
  statusChip: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: Radius.full,
    borderWidth: 1.5,
    alignItems: 'center',
  },
  statusChipText: { ...Typography.smallBold },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
});
============================================================
