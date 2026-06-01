/**
 * MANAJEMEN LOKASI - v3 (Bug-Fix Pass)
 *
 * CRITICAL FIXES (v3):
 *  ðŸš¨ Pos Jaga add/edit/delete were SILENTLY LOST on refresh!
 *     The store's `updateLokasi(id, { posList })` only updates LOCAL state and
 *     calls `dataApi.lokasi.update()` which does NOT accept posList field.
 *     Backend has separate /api/data/pos-jaga endpoints. Pos changes vanished
 *     once data reloads from server.
 *
 *     Fix: Call `dataApi.posJaga.create/update/delete()` DIRECTLY here, then
 *     update Zustand state via setState to keep UI in sync. After refresh
 *     posList is rebuilt by store mapping pos_jaga + lokasi tables.
 *
 *  âœ… Add Pos: include lokasi_id in payload (was missing - pos created without lokasi).
 *  âœ… Edit Pos: full update with all fields (was only updating name+radius+status locally).
 *  âœ… Delete Pos: backend delete + local state sync.
 *  âœ… Submitting state on all mutations to prevent double-tap.
 *  âœ… Error messages localized; backend errors shown to user instead of silently failing.
 *  âœ… Pull-to-refresh added.
 *  âœ… Modal `onRequestClose` for Android back button.
 *  âœ… Lat/Lng validation: range checks (-90..90, -180..180).
 *  âœ… Radius validation: integer, 10-500m range.
 */
import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert,
  Modal, KeyboardAvoidingView, Platform, RefreshControl, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Radius } from '../../constants';
import { Card, Badge, Button } from '../../components';
import { useDataStore } from '../../stores/dataStore';
import { dataApi } from '../../lib/apiClient';
import { useI18n } from '../../lib/i18n';
import { useTheme } from '../../lib/theme';

/** Safely get a field value, checking multiple key variants (snake_case first). */
function getField(obj: any, ...keys: string[]): any {
  if (!obj) return undefined;
  for (const key of keys) {
    if (obj[key] !== undefined && obj[key] !== null) return obj[key];
  }
  return undefined;
}

export default function ManajemenLokasiScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const { t, lang } = useI18n();
  const { theme, isDark } = useTheme();
  const lokasi = useDataStore((s) => s.lokasi);
  const updateLokasi = useDataStore((s) => s.updateLokasi);
  const loadAllData = useDataStore((s) => s.loadAllData);

  const [expanded, setExpanded] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // === Add Pos Modal State ===
  const [showAddPos, setShowAddPos] = useState(false);
  const [addPosLokasiId, setAddPosLokasiId] = useState('');
  const [newPosNama, setNewPosNama] = useState('');
  const [newPosRadius, setNewPosRadius] = useState('50');
  const [newPosLatitude, setNewPosLatitude] = useState('');
  const [newPosLongitude, setNewPosLongitude] = useState('');

  // === Edit Lokasi Modal State ===
  const [showEditLokasi, setShowEditLokasi] = useState(false);
  const [editLokasiId, setEditLokasiId] = useState('');
  const [editNama, setEditNama] = useState('');
  const [editAlamat, setEditAlamat] = useState('');
  const [editStatus, setEditStatus] = useState<'active' | 'inactive'>('active');

  // === Edit Pos Modal State ===
  const [showEditPos, setShowEditPos] = useState(false);
  const [editPosLokasiId, setEditPosLokasiId] = useState('');
  const [editPosId, setEditPosId] = useState('');
  const [editPosNama, setEditPosNama] = useState('');
  const [editPosRadius, setEditPosRadius] = useState('');
  const [editPosLat, setEditPosLat] = useState('');
  const [editPosLng, setEditPosLng] = useState('');
  const [editPosStatus, setEditPosStatus] = useState<'active' | 'inactive'>('active');

  const filtered = search
    ? lokasi.filter((l) => l.nama.toLowerCase().includes(search.toLowerCase()))
    : lokasi;
  const totalPos = lokasi.reduce((a, l) => a + l.posList.length, 0);
  const totalAnggota = lokasi.reduce((a, l) => a + l.totalAnggota, 0);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await loadAllData?.(); } catch (e) { console.log('[Lokasi] refresh err:', e); }
    finally { setRefreshing(false); }
  }, [loadAllData]);

  // Latitude/Longitude bounds validation
  const isValidLatLng = (lat: number, lng: number): boolean => {
    return !isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
  };

  // === Open Add Pos Form ===
  const openAddPosModal = (lokId: string) => {
    const lok = lokasi.find((l) => l.id === lokId);
    if (!lok) return;
    setAddPosLokasiId(lokId);
    setNewPosNama('');
    setNewPosRadius('50');
    const refPos = lok.posList[0];
    setNewPosLatitude(refPos?.latitude?.toString() || '-6.2088');
    setNewPosLongitude(refPos?.longitude?.toString() || '106.8456');
    setShowAddPos(true);
  };

  // ðŸš¨ CRITICAL FIX: Call posJaga API directly + sync local state
  const handleAddPos = async () => {
    if (submitting) return;
    if (!newPosNama.trim()) {
      return Alert.alert('Error', lang === 'en' ? 'Post name is required' : 'Nama pos jaga wajib diisi');
    }
    const radius = parseInt(newPosRadius, 10);
    if (isNaN(radius) || radius < 10 || radius > 500) {
      return Alert.alert('Error', lang === 'en' ? 'Radius must be between 10-500 meters' : 'Radius harus antara 10-500 meter');
    }
    const lat = parseFloat(newPosLatitude);
    const lng = parseFloat(newPosLongitude);
    if (!isValidLatLng(lat, lng)) {
      return Alert.alert('Error', lang === 'en' ? 'Invalid GPS coordinates (lat: -90..90, lng: -180..180)' : 'Koordinat GPS tidak valid (lat: -90..90, lng: -180..180)');
    }

    const lok = lokasi.find((l) => l.id === addPosLokasiId);
    if (!lok) return;

    const duplicate = lok.posList.find((p) => p.nama.trim().toLowerCase() === newPosNama.trim().toLowerCase());
    if (duplicate) {
      return Alert.alert('Error', lang === 'en' ? 'A post with this name already exists' : 'Nama pos sudah ada di lokasi ini');
    }

    setSubmitting(true);
    try {
      const created: any = await dataApi.posJaga.create({
        nama: newPosNama.trim(),
        lokasi_id: addPosLokasiId,
        radius,
        latitude: lat,
        longitude: lng,
        status: 'active',
      });

      // Sync local state via setState (avoids store API call duplicating work)
      const newPos = {
        id: getField(created, 'id', '_id') || `tmp-pos-${Date.now()}`,
        nama: newPosNama.trim(),
        radius,
        latitude: lat,
        longitude: lng,
        status: 'active' as const,
      };
      useDataStore.setState((s) => ({
        lokasi: s.lokasi.map((l) =>
          l.id === addPosLokasiId ? { ...l, posList: [...l.posList, newPos] } : l
        ),
      }));

      setShowAddPos(false);
      Alert.alert(
        'âœ… ' + (lang === 'en' ? 'Success' : 'Berhasil'),
        lang === 'en'
          ? `Post "${newPosNama.trim()}" has been added to ${lok.nama}`
          : `Pos "${newPosNama.trim()}" berhasil ditambahkan ke ${lok.nama}`
      );
    } catch (e: any) {
      console.log('[Lokasi] add pos err:', e);
      Alert.alert(
        'Error',
        e?.message || (lang === 'en' ? 'Failed to add post. Try again.' : 'Gagal menambah pos. Coba lagi.')
      );
    } finally {
      setSubmitting(false);
    }
  };

  // === Open Edit Lokasi Form ===
  const openEditLokasiModal = (lokId: string) => {
    const lok = lokasi.find((l) => l.id === lokId);
    if (!lok) return;
    setEditLokasiId(lokId);
    setEditNama(lok.nama);
    setEditAlamat(lok.alamat);
    setEditStatus((lok.status as 'active' | 'inactive') || 'active');
    setShowEditLokasi(true);
  };

  const handleEditLokasi = async () => {
    if (submitting) return;
    if (!editNama.trim()) {
      return Alert.alert('Error', lang === 'en' ? 'Location name is required' : 'Nama lokasi wajib diisi');
    }
    if (!editAlamat.trim()) {
      return Alert.alert('Error', lang === 'en' ? 'Address is required' : 'Alamat wajib diisi');
    }

    setSubmitting(true);
    try {
      // updateLokasi already calls dataApi.lokasi.update for nama/alamat/status
      updateLokasi(editLokasiId, {
        nama: editNama.trim(),
        alamat: editAlamat.trim(),
        status: editStatus,
      });
      setShowEditLokasi(false);
      Alert.alert(
        'âœ… ' + (lang === 'en' ? 'Success' : 'Berhasil'),
        lang === 'en' ? 'Location updated successfully' : 'Lokasi berhasil diperbarui'
      );
    } catch (e: any) {
      Alert.alert('Error', e?.message || (lang === 'en' ? 'Failed to update' : 'Gagal memperbarui'));
    } finally {
      setSubmitting(false);
    }
  };

  // === Open Edit Pos ===
  const openEditPosModal = (lokId: string, posId: string) => {
    const lok = lokasi.find((l) => l.id === lokId);
    if (!lok) return;
    const pos = lok.posList.find((p) => p.id === posId);
    if (!pos) return;
    setEditPosLokasiId(lokId);
    setEditPosId(posId);
    setEditPosNama(pos.nama);
    setEditPosRadius(pos.radius?.toString() || '50');
    setEditPosLat(pos.latitude != null ? String(pos.latitude) : '');
    setEditPosLng(pos.longitude != null ? String(pos.longitude) : '');
    setEditPosStatus((pos.status as 'active' | 'inactive') || 'active');
    setShowEditPos(true);
  };

  // ðŸš¨ CRITICAL FIX: Edit Pos persists to backend via posJaga API
  const handleEditPos = async () => {
    if (submitting) return;
    if (!editPosNama.trim()) {
      return Alert.alert('Error', lang === 'en' ? 'Post name is required' : 'Nama pos wajib diisi');
    }
    const radius = parseInt(editPosRadius, 10);
    if (isNaN(radius) || radius < 10 || radius > 500) {
      return Alert.alert('Error', lang === 'en' ? 'Radius must be between 10-500 meters' : 'Radius harus antara 10-500 meter');
    }
    const lat = editPosLat ? parseFloat(editPosLat) : 0;
    const lng = editPosLng ? parseFloat(editPosLng) : 0;
    if (editPosLat || editPosLng) {
      if (!isValidLatLng(lat, lng)) {
        return Alert.alert('Error', lang === 'en' ? 'Invalid GPS coordinates' : 'Koordinat GPS tidak valid');
      }
    }

    setSubmitting(true);
    try {
      await dataApi.posJaga.update(editPosId, {
        nama: editPosNama.trim(),
        radius,
        latitude: lat,
        longitude: lng,
        status: editPosStatus,
      });

      // Sync local state
      useDataStore.setState((s) => ({
        lokasi: s.lokasi.map((l) =>
          l.id === editPosLokasiId
            ? {
                ...l,
                posList: l.posList.map((p) =>
                  p.id === editPosId
                    ? { ...p, nama: editPosNama.trim(), radius, latitude: lat, longitude: lng, status: editPosStatus }
                    : p
                ),
              }
            : l
        ),
      }));

      setShowEditPos(false);
      Alert.alert('âœ…', lang === 'en' ? 'Post updated' : 'Pos berhasil diperbarui');
    } catch (e: any) {
      console.log('[Lokasi] edit pos err:', e);
      Alert.alert('Error', e?.message || (lang === 'en' ? 'Failed to update post' : 'Gagal memperbarui pos'));
    } finally {
      setSubmitting(false);
    }
  };

  // ðŸš¨ CRITICAL FIX: Delete Pos persists to backend
  const handleDeletePos = (lokId: string, posId: string, posName: string) => {
    Alert.alert(
      lang === 'en' ? 'Delete Post?' : 'Hapus Pos?',
      lang === 'en' ? `Delete "${posName}" from this location?` : `Hapus "${posName}" dari lokasi ini?`,
      [
        { text: lang === 'en' ? 'Cancel' : 'Batal', style: 'cancel' },
        {
          text: lang === 'en' ? 'Delete' : 'Hapus',
          style: 'destructive',
          onPress: async () => {
            if (submitting) return;
            setSubmitting(true);
            try {
              await dataApi.posJaga.delete(posId);
              useDataStore.setState((s) => ({
                lokasi: s.lokasi.map((l) =>
                  l.id === lokId ? { ...l, posList: l.posList.filter((p) => p.id !== posId) } : l
                ),
              }));
            } catch (e: any) {
              console.log('[Lokasi] delete pos err:', e);
              Alert.alert('Error', e?.message || (lang === 'en' ? 'Failed to delete' : 'Gagal menghapus'));
            } finally {
              setSubmitting(false);
            }
          },
        },
      ]
    );
  };

  return (
    <View style={[st.container, { backgroundColor: theme.bg }]}>
      {/* Header */}
      <View style={[st.header, { paddingTop: insets.top + 12 }, { backgroundColor: theme.bgCard, borderBottomColor: theme.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={st.backBtn}>
          <Ionicons name="arrow-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={[st.headerTitle, { color: theme.text }]}>
          {lang === 'en' ? 'Location Management' : 'Manajemen Lokasi'}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={[st.searchRow, { backgroundColor: isDark ? theme.bgInput : Colors.bgGray }]}>
        <Ionicons name="search" size={18} color={theme.textMuted} />
        <TextInput
          style={[st.searchInput, { color: theme.text }]}
          placeholder={lang === 'en' ? 'Search location...' : 'Cari lokasi...'}
          placeholderTextColor={theme.textMuted}
          value={search}
          onChangeText={setSearch}
        />
      </View>

      <View style={[st.statsBar, { backgroundColor: theme.bgCard, borderBottomColor: theme.border }]}>
        <View style={st.statItem}>
          <Text style={[st.statVal, { color: Colors.primary }]}>{lokasi.length}</Text>
          <Text style={[st.statLbl, { color: theme.textMuted }]}>{lang === 'en' ? 'Locations' : 'Lokasi'}</Text>
        </View>
        <View style={st.statItem}>
          <Text style={[st.statVal, { color: Colors.success }]}>{totalPos}</Text>
          <Text style={[st.statLbl, { color: theme.textMuted }]}>{lang === 'en' ? 'Posts' : 'Pos Jaga'}</Text>
        </View>
        <View style={st.statItem}>
          <Text style={[st.statVal, { color: Colors.warning }]}>{totalAnggota}</Text>
          <Text style={[st.statLbl, { color: theme.textMuted }]}>{lang === 'en' ? 'Members' : 'Anggota'}</Text>
        </View>
      </View>

      {/* Info banner - supervisor restriction */}
      <View style={[st.infoBanner, { backgroundColor: isDark ? `${Colors.primary}15` : '#EFF6FF', borderColor: isDark ? `${Colors.primary}30` : '#BFDBFE' }]}>
        <Ionicons name="information-circle" size={16} color={Colors.primary} />
        <Text style={[st.infoText, { color: isDark ? Colors.primary : '#1E40AF' }]}>
          {lang === 'en'
            ? 'You can manage posts within each location. To add or remove locations, please contact Admin.'
            : 'Anda dapat mengelola pos di setiap lokasi. Untuk menambah atau menghapus lokasi, hubungi Admin.'}
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={[st.content, { paddingBottom: insets.bottom + 16 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
      >
        {filtered.map((l) => (
          <Card key={l.id} style={[st.locCard, { backgroundColor: theme.bgCard }]}>
            <TouchableOpacity onPress={() => setExpanded(expanded === l.id ? null : l.id)}>
              <View style={st.locRow}>
                <View style={[st.locIcon, { backgroundColor: isDark ? `${Colors.primary}20` : Colors.primarySoft }]}>
                  <Ionicons name="business" size={18} color={Colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[st.locName, { color: theme.text }]}>{l.nama}</Text>
                  <Text style={[st.locAddr, { color: theme.textMuted }]}>{l.alamat || '-'}</Text>
                  <Text style={[st.locMeta, { color: theme.textMuted }]}>
                    {l.posList.length} pos â€¢ {l.totalAnggota} {lang === 'en' ? 'members' : 'anggota'}
                  </Text>
                </View>
                <Badge
                  text={l.status === 'active' ? (lang === 'en' ? 'Active' : 'Aktif') : (lang === 'en' ? 'Inactive' : 'Nonaktif')}
                  variant={l.status === 'active' ? 'success' : 'default'}
                />
                <Ionicons
                  name={expanded === l.id ? 'chevron-up' : 'chevron-down'}
                  size={20}
                  color={theme.textMuted}
                />
              </View>
            </TouchableOpacity>

            {expanded === l.id && (
              <View style={[st.posWrap, { borderTopColor: theme.border }]}>
                <Text style={[st.posTitle, { color: theme.textSecondary }]}>
                  {lang === 'en' ? 'Guard Posts' : 'Pos Jaga'} ({l.posList.length})
                </Text>

                {l.posList.map((p) => (
                  <View key={p.id} style={[st.posRow, { borderBottomColor: theme.border }]}>
                    <View style={[st.posDot, { backgroundColor: p.status === 'active' ? Colors.success : Colors.textMuted }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={[st.posName, { color: theme.text }]}>{p.nama}</Text>
                      <Text style={[st.posDetail, { color: theme.textMuted }]}>
                        Radius: {p.radius}m
                        {p.latitude != null && p.longitude != null
                          ? ` â€¢ ${Number(p.latitude).toFixed(4)}, ${Number(p.longitude).toFixed(4)}`
                          : ''}
                      </Text>
                    </View>
                    <Badge
                      text={p.status === 'active' ? (lang === 'en' ? 'Active' : 'Aktif') : 'Off'}
                      variant={p.status === 'active' ? 'success' : 'default'}
                    />
                    <View style={{ flexDirection: 'row', gap: 8, marginLeft: 8 }}>
                      <TouchableOpacity onPress={() => openEditPosModal(l.id, p.id)} disabled={submitting}>
                        <Ionicons name="create-outline" size={18} color={Colors.primary} />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => handleDeletePos(l.id, p.id, p.nama)} disabled={submitting}>
                        <Ionicons name="trash-outline" size={18} color={Colors.danger} />
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}

                {l.posList.length === 0 && (
                  <Text style={[st.emptyPos, { color: theme.textMuted }]}>
                    {lang === 'en' ? 'No posts yet' : 'Belum ada pos jaga'}
                  </Text>
                )}

                <View style={st.locActions}>
                  <Button
                    title={lang === 'en' ? 'Add Post' : 'Tambah Pos'}
                    variant="primary"
                    size="small"
                    icon="add-outline"
                    onPress={() => openAddPosModal(l.id)}
                    style={{ flex: 1 }}
                    disabled={submitting}
                  />
                  <Button
                    title={lang === 'en' ? 'Edit Location' : 'Edit Lokasi'}
                    variant="outline"
                    size="small"
                    icon="create-outline"
                    onPress={() => openEditLokasiModal(l.id)}
                    style={{ flex: 1 }}
                    disabled={submitting}
                  />
                </View>
              </View>
            )}
          </Card>
        ))}

        {filtered.length === 0 && (
          <View style={st.empty}>
            <Ionicons name="business-outline" size={48} color={theme.textMuted} />
            <Text style={[st.emptyText, { color: theme.textMuted }]}>
              {lang === 'en' ? 'No locations found' : 'Lokasi tidak ditemukan'}
            </Text>
          </View>
        )}

        <View style={{ height: 32 }} />
      </ScrollView>

      {/* ===== MODAL: Add Pos ===== */}
      <Modal
        visible={showAddPos}
        transparent
        animationType="slide"
        onRequestClose={() => !submitting && setShowAddPos(false)}
      >
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={st.modalOverlay}>
            <View style={[st.modalCard, { backgroundColor: theme.bgCard }]}>
              <View style={st.modalHeader}>
                <Text style={[st.modalTitle, { color: theme.text }]}>
                  {lang === 'en' ? 'Add Guard Post' : 'Tambah Pos Jaga'}
                </Text>
                <TouchableOpacity onPress={() => !submitting && setShowAddPos(false)} disabled={submitting}>
                  <Ionicons name="close" size={24} color={theme.textMuted} />
                </TouchableOpacity>
              </View>

              <Text style={[st.modalSubtitle, { color: theme.textMuted }]}>
                {lang === 'en'
                  ? `Adding post to: ${lokasi.find((l) => l.id === addPosLokasiId)?.nama || ''}`
                  : `Menambahkan pos ke: ${lokasi.find((l) => l.id === addPosLokasiId)?.nama || ''}`}
              </Text>

              <ScrollView showsVerticalScrollIndicator={false}>
                <Text style={[st.fLabel, { color: theme.textSecondary }]}>
                  {lang === 'en' ? 'Post Name' : 'Nama Pos'} *
                </Text>
                <TextInput
                  style={[st.fInput, { borderColor: theme.border, color: theme.text, backgroundColor: isDark ? theme.bgInput : Colors.bgWhite }]}
                  value={newPosNama}
                  onChangeText={setNewPosNama}
                  placeholder={lang === 'en' ? 'e.g. Main Gate Post' : 'Contoh: Pos Gerbang Utama'}
                  placeholderTextColor={theme.textMuted}
                  editable={!submitting}
                  maxLength={64}
                />

                <Text style={[st.fLabel, { color: theme.textSecondary }]}>
                  Radius ({lang === 'en' ? 'meters' : 'meter'}) *
                </Text>
                <TextInput
                  style={[st.fInput, { borderColor: theme.border, color: theme.text, backgroundColor: isDark ? theme.bgInput : Colors.bgWhite }]}
                  value={newPosRadius}
                  onChangeText={setNewPosRadius}
                  placeholder="50"
                  placeholderTextColor={theme.textMuted}
                  keyboardType="numeric"
                  editable={!submitting}
                />
                <Text style={[st.fHint, { color: theme.textMuted }]}>
                  {lang === 'en' ? 'Geofence radius for attendance check-in (10-500m)' : 'Radius geofence untuk absensi (10-500m)'}
                </Text>

                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={[st.fLabel, { color: theme.textSecondary }]}>Latitude *</Text>
                    <TextInput
                      style={[st.fInput, { borderColor: theme.border, color: theme.text, backgroundColor: isDark ? theme.bgInput : Colors.bgWhite }]}
                      value={newPosLatitude}
                      onChangeText={setNewPosLatitude}
                      placeholder="-6.2088"
                      placeholderTextColor={theme.textMuted}
                      keyboardType="numeric"
                      editable={!submitting}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[st.fLabel, { color: theme.textSecondary }]}>Longitude *</Text>
                    <TextInput
                      style={[st.fInput, { borderColor: theme.border, color: theme.text, backgroundColor: isDark ? theme.bgInput : Colors.bgWhite }]}
                      value={newPosLongitude}
                      onChangeText={setNewPosLongitude}
                      placeholder="106.8456"
                      placeholderTextColor={theme.textMuted}
                      keyboardType="numeric"
                      editable={!submitting}
                    />
                  </View>
                </View>
                <Text style={[st.fHint, { color: theme.textMuted }]}>
                  {lang === 'en' ? 'GPS coordinates for the post location' : 'Koordinat GPS lokasi pos jaga'}
                </Text>
              </ScrollView>

              <View style={st.modalActions}>
                <Button
                  title={lang === 'en' ? 'Cancel' : 'Batal'}
                  variant="outline"
                  size="medium"
                  onPress={() => setShowAddPos(false)}
                  style={{ flex: 1 }}
                  disabled={submitting}
                />
                <Button
                  title={submitting ? (lang === 'en' ? 'Saving...' : 'Menyimpan...') : (lang === 'en' ? 'Add Post' : 'Tambah Pos')}
                  variant="primary"
                  size="medium"
                  icon="add-outline"
                  onPress={handleAddPos}
                  style={{ flex: 1 }}
                  disabled={submitting}
                  loading={submitting}
                />
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ===== MODAL: Edit Lokasi ===== */}
      <Modal
        visible={showEditLokasi}
        transparent
        animationType="slide"
        onRequestClose={() => !submitting && setShowEditLokasi(false)}
      >
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={st.modalOverlay}>
            <View style={[st.modalCard, { backgroundColor: theme.bgCard }]}>
              <View style={st.modalHeader}>
                <Text style={[st.modalTitle, { color: theme.text }]}>
                  {lang === 'en' ? 'Edit Location' : 'Edit Lokasi'}
                </Text>
                <TouchableOpacity onPress={() => !submitting && setShowEditLokasi(false)} disabled={submitting}>
                  <Ionicons name="close" size={24} color={theme.textMuted} />
                </TouchableOpacity>
              </View>

              <Text style={[st.fLabel, { color: theme.textSecondary }]}>
                {lang === 'en' ? 'Location Name' : 'Nama Lokasi'} *
              </Text>
              <TextInput
                style={[st.fInput, { borderColor: theme.border, color: theme.text, backgroundColor: isDark ? theme.bgInput : Colors.bgWhite }]}
                value={editNama}
                onChangeText={setEditNama}
                placeholder={lang === 'en' ? 'Location name' : 'Nama lokasi'}
                placeholderTextColor={theme.textMuted}
                editable={!submitting}
                maxLength={128}
              />

              <Text style={[st.fLabel, { color: theme.textSecondary }]}>
                {lang === 'en' ? 'Address' : 'Alamat'} *
              </Text>
              <TextInput
                style={[st.fInput, st.fInputMulti, { borderColor: theme.border, color: theme.text, backgroundColor: isDark ? theme.bgInput : Colors.bgWhite }]}
                value={editAlamat}
                onChangeText={setEditAlamat}
                placeholder={lang === 'en' ? 'Full address' : 'Alamat lengkap'}
                placeholderTextColor={theme.textMuted}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
                editable={!submitting}
              />

              <Text style={[st.fLabel, { color: theme.textSecondary }]}>Status</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity
                  style={[st.statusChip, { borderColor: theme.border }, editStatus === 'active' && st.statusChipActive]}
                  onPress={() => !submitting && setEditStatus('active')}
                  disabled={submitting}
                >
                  <Ionicons name="checkmark-circle" size={16} color={editStatus === 'active' ? '#fff' : Colors.success} />
                  <Text style={[st.statusChipText, { color: theme.textSecondary }, editStatus === 'active' && { color: '#fff' }]}>
                    {lang === 'en' ? 'Active' : 'Aktif'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[st.statusChip, { borderColor: theme.border }, editStatus === 'inactive' && st.statusChipInactive]}
                  onPress={() => !submitting && setEditStatus('inactive')}
                  disabled={submitting}
                >
                  <Ionicons name="close-circle" size={16} color={editStatus === 'inactive' ? '#fff' : Colors.textMuted} />
                  <Text style={[st.statusChipText, { color: theme.textSecondary }, editStatus === 'inactive' && { color: '#fff' }]}>
                    {lang === 'en' ? 'Inactive' : 'Nonaktif'}
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={st.modalActions}>
                <Button
                  title={lang === 'en' ? 'Cancel' : 'Batal'}
                  variant="outline"
                  size="medium"
                  onPress={() => setShowEditLokasi(false)}
                  style={{ flex: 1 }}
                  disabled={submitting}
                />
                <Button
                  title={submitting ? (lang === 'en' ? 'Saving...' : 'Menyimpan...') : (lang === 'en' ? 'Save Changes' : 'Simpan Perubahan')}
                  variant="primary"
                  size="medium"
                  icon="save-outline"
                  onPress={handleEditLokasi}
                  style={{ flex: 1 }}
                  disabled={submitting}
                  loading={submitting}
                />
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ===== MODAL: Edit Pos ===== */}
      <Modal
        visible={showEditPos}
        transparent
        animationType="slide"
        onRequestClose={() => !submitting && setShowEditPos(false)}
      >
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={st.modalOverlay}>
            <View style={[st.modalCard, { backgroundColor: theme.bgCard }]}>
              <View style={st.modalHeader}>
                <Text style={[st.modalTitle, { color: theme.text }]}>
                  {lang === 'en' ? 'Edit Post' : 'Edit Pos'}
                </Text>
                <TouchableOpacity onPress={() => !submitting && setShowEditPos(false)} disabled={submitting}>
                  <Ionicons name="close" size={24} color={theme.textMuted} />
                </TouchableOpacity>
              </View>

              <ScrollView showsVerticalScrollIndicator={false}>
                <Text style={[st.fLabel, { color: theme.textSecondary }]}>
                  {lang === 'en' ? 'Post Name' : 'Nama Pos'} *
                </Text>
                <TextInput
                  style={[st.fInput, { borderColor: theme.border, color: theme.text, backgroundColor: isDark ? theme.bgInput : Colors.bgWhite }]}
                  value={editPosNama}
                  onChangeText={setEditPosNama}
                  placeholderTextColor={theme.textMuted}
                  editable={!submitting}
                  maxLength={64}
                />

                <Text style={[st.fLabel, { color: theme.textSecondary }]}>Radius (meter) *</Text>
                <TextInput
                  style={[st.fInput, { borderColor: theme.border, color: theme.text, backgroundColor: isDark ? theme.bgInput : Colors.bgWhite }]}
                  value={editPosRadius}
                  onChangeText={setEditPosRadius}
                  keyboardType="numeric"
                  placeholderTextColor={theme.textMuted}
                  editable={!submitting}
                />

                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={[st.fLabel, { color: theme.textSecondary }]}>Latitude</Text>
                    <TextInput
                      style={[st.fInput, { borderColor: theme.border, color: theme.text, backgroundColor: isDark ? theme.bgInput : Colors.bgWhite }]}
                      value={editPosLat}
                      onChangeText={setEditPosLat}
                      placeholder="-6.2088"
                      placeholderTextColor={theme.textMuted}
                      keyboardType="numeric"
                      editable={!submitting}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[st.fLabel, { color: theme.textSecondary }]}>Longitude</Text>
                    <TextInput
                      style={[st.fInput, { borderColor: theme.border, color: theme.text, backgroundColor: isDark ? theme.bgInput : Colors.bgWhite }]}
                      value={editPosLng}
                      onChangeText={setEditPosLng}
                      placeholder="106.8456"
                      placeholderTextColor={theme.textMuted}
                      keyboardType="numeric"
                      editable={!submitting}
                    />
                  </View>
                </View>

                <Text style={[st.fLabel, { color: theme.textSecondary }]}>Status</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TouchableOpacity
                    style={[st.statusChip, { borderColor: theme.border }, editPosStatus === 'active' && st.statusChipActive]}
                    onPress={() => !submitting && setEditPosStatus('active')}
                    disabled={submitting}
                  >
                    <Text style={[st.statusChipText, { color: theme.textSecondary }, editPosStatus === 'active' && { color: '#fff' }]}>
                      {lang === 'en' ? 'Active' : 'Aktif'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[st.statusChip, { borderColor: theme.border }, editPosStatus === 'inactive' && st.statusChipInactive]}
                    onPress={() => !submitting && setEditPosStatus('inactive')}
                    disabled={submitting}
                  >
                    <Text style={[st.statusChipText, { color: theme.textSecondary }, editPosStatus === 'inactive' && { color: '#fff' }]}>
                      {lang === 'en' ? 'Inactive' : 'Nonaktif'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>

              <View style={st.modalActions}>
                <Button
                  title={lang === 'en' ? 'Cancel' : 'Batal'}
                  variant="outline"
                  size="medium"
                  onPress={() => setShowEditPos(false)}
                  style={{ flex: 1 }}
                  disabled={submitting}
                />
                <Button
                  title={submitting ? (lang === 'en' ? 'Saving...' : 'Menyimpan...') : (lang === 'en' ? 'Save' : 'Simpan')}
                  variant="primary"
                  size="medium"
                  onPress={handleEditPos}
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

const st = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', paddingBottom: 12,
    paddingHorizontal: Spacing.base, borderBottomWidth: 1,
  },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  headerTitle: { ...Typography.h3, flex: 1, textAlign: 'center' },
  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: Spacing.base,
    marginVertical: 8, borderRadius: Radius.md, paddingHorizontal: 12, height: 42,
  },
  searchInput: { flex: 1, ...Typography.body },
  statsBar: {
    flexDirection: 'row', paddingHorizontal: Spacing.base, paddingVertical: 10,
    borderBottomWidth: 1,
  },
  statItem: { flex: 1, alignItems: 'center' },
  statVal: { fontSize: 18, fontWeight: '800' },
  statLbl: { ...Typography.caption },
  infoBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: Spacing.base,
    marginTop: 8, padding: 10, borderRadius: Radius.md, borderWidth: 1,
  },
  infoText: { ...Typography.caption, flex: 1, lineHeight: 17 },
  content: { padding: Spacing.base },
  locCard: { marginBottom: 10 },
  locRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  locIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  locName: { ...Typography.bodyBold },
  locAddr: { ...Typography.caption },
  locMeta: { ...Typography.caption, marginTop: 2 },
  posWrap: { marginTop: 12, paddingTop: 12, borderTopWidth: 1 },
  posTitle: { ...Typography.smallBold, marginBottom: 8 },
  posRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, borderBottomWidth: 1 },
  posDot: { width: 8, height: 8, borderRadius: 4 },
  posName: { ...Typography.body },
  posDetail: { ...Typography.caption, marginTop: 1 },
  emptyPos: { ...Typography.caption, textAlign: 'center', paddingVertical: 12 },
  locActions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  empty: { alignItems: 'center', paddingVertical: 40, gap: 8 },
  emptyText: { ...Typography.body },
  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCard: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, maxHeight: '85%' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  modalTitle: { ...Typography.h3 },
  modalSubtitle: { ...Typography.caption, marginBottom: 8 },
  fLabel: { ...Typography.smallBold, marginBottom: 4, marginTop: 12 },
  fInput: { borderWidth: 1.5, borderRadius: Radius.md, paddingHorizontal: 14, height: 48, ...Typography.body },
  fInputMulti: { height: 80, paddingTop: 12 },
  fHint: { ...Typography.caption, marginTop: 4 },
  statusChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 10,
    borderRadius: Radius.full, borderWidth: 1.5,
  },
  statusChipActive: { backgroundColor: Colors.success, borderColor: Colors.success },
  statusChipInactive: { backgroundColor: Colors.textMuted, borderColor: Colors.textMuted },
  statusChipText: { ...Typography.smallBold },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 20 },
});
============================================================
