/**
 * MANAJEMEN LOKASI - FIXED v2
 * 
 * FIXES:
 * a) Removed "Tambah Lokasi" - Supervisor cannot add locations (admin-only)
 * b) "Tambah Pos" now opens a proper form modal (name, radius, coordinates)
 * c) "Edit Lokasi" now opens a real edit form instead of just showing alert
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, Modal, KeyboardAvoidingView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Radius } from '../../constants';
import { Card, Badge, Button } from '../../components';
import { useDataStore } from '../../stores/dataStore';
import { useI18n } from '../../lib/i18n';
import { useTheme } from '../../lib/theme';

export default function ManajemenLokasiScreen({ navigation }: any) {
  const { t, lang } = useI18n();
  const { theme, isDark } = useTheme();
  const lokasi = useDataStore((s) => s.lokasi);
  const updateLokasi = useDataStore((s) => s.updateLokasi);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [search, setSearch] = useState('');

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
  const [editPosStatus, setEditPosStatus] = useState<'active' | 'inactive'>('active');

  const filtered = search ? lokasi.filter((l) => l.nama.toLowerCase().includes(search.toLowerCase())) : lokasi;
  const totalPos = lokasi.reduce((a, l) => a + l.posList.length, 0);
  const totalAnggota = lokasi.reduce((a, l) => a + l.totalAnggota, 0);

  // === FIX (b): Open Add Pos Form ===
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

  const handleAddPos = () => {
    if (!newPosNama.trim()) {
      return Alert.alert('Error', lang === 'en' ? 'Post name is required' : 'Nama pos jaga wajib diisi');
    }
    const radius = parseInt(newPosRadius) || 50;
    if (radius < 10 || radius > 500) {
      return Alert.alert('Error', lang === 'en' ? 'Radius must be between 10-500 meters' : 'Radius harus antara 10-500 meter');
    }
    const lat = parseFloat(newPosLatitude) || 0;
    const lng = parseFloat(newPosLongitude) || 0;

    const lok = lokasi.find((l) => l.id === addPosLokasiId);
    if (!lok) return;

    const duplicate = lok.posList.find((p) => p.nama.toLowerCase() === newPosNama.trim().toLowerCase());
    if (duplicate) {
      return Alert.alert('Error', lang === 'en' ? 'A post with this name already exists' : 'Nama pos sudah ada di lokasi ini');
    }

    const newPos = {
      id: `POS-${Date.now()}`,
      nama: newPosNama.trim(),
      radius: radius,
      latitude: lat,
      longitude: lng,
      status: 'active' as const,
    };

    updateLokasi(addPosLokasiId, { posList: [...lok.posList, newPos] });
    setShowAddPos(false);
    Alert.alert(
      '✅ ' + (lang === 'en' ? 'Success' : 'Berhasil'),
      lang === 'en'
        ? `Post "${newPosNama.trim()}" has been added to ${lok.nama}`
        : `Pos "${newPosNama.trim()}" berhasil ditambahkan ke ${lok.nama}`
    );
  };

  // === FIX (c): Open Edit Lokasi Form ===
  const openEditLokasiModal = (lokId: string) => {
    const lok = lokasi.find((l) => l.id === lokId);
    if (!lok) return;
    setEditLokasiId(lokId);
    setEditNama(lok.nama);
    setEditAlamat(lok.alamat);
    setEditStatus(lok.status as 'active' | 'inactive');
    setShowEditLokasi(true);
  };

  const handleEditLokasi = () => {
    if (!editNama.trim()) {
      return Alert.alert('Error', lang === 'en' ? 'Location name is required' : 'Nama lokasi wajib diisi');
    }
    if (!editAlamat.trim()) {
      return Alert.alert('Error', lang === 'en' ? 'Address is required' : 'Alamat wajib diisi');
    }

    updateLokasi(editLokasiId, {
      nama: editNama.trim(),
      alamat: editAlamat.trim(),
      status: editStatus,
    });
    setShowEditLokasi(false);
    Alert.alert(
      '✅ ' + (lang === 'en' ? 'Success' : 'Berhasil'),
      lang === 'en' ? 'Location updated successfully' : 'Lokasi berhasil diperbarui'
    );
  };

  // === Edit Pos ===
  const openEditPosModal = (lokId: string, posId: string) => {
    const lok = lokasi.find((l) => l.id === lokId);
    if (!lok) return;
    const pos = lok.posList.find((p) => p.id === posId);
    if (!pos) return;
    setEditPosLokasiId(lokId);
    setEditPosId(posId);
    setEditPosNama(pos.nama);
    setEditPosRadius(pos.radius?.toString() || '50');
    setEditPosStatus(pos.status as 'active' | 'inactive');
    setShowEditPos(true);
  };

  const handleEditPos = () => {
    if (!editPosNama.trim()) {
      return Alert.alert('Error', lang === 'en' ? 'Post name is required' : 'Nama pos wajib diisi');
    }
    const lok = lokasi.find((l) => l.id === editPosLokasiId);
    if (!lok) return;

    const updatedPosList = lok.posList.map((p) =>
      p.id === editPosId
        ? { ...p, nama: editPosNama.trim(), radius: parseInt(editPosRadius) || 50, status: editPosStatus }
        : p
    );
    updateLokasi(editPosLokasiId, { posList: updatedPosList });
    setShowEditPos(false);
    Alert.alert('✅', lang === 'en' ? 'Post updated' : 'Pos berhasil diperbarui');
  };

  // === Delete Pos ===
  const handleDeletePos = (lokId: string, posId: string, posName: string) => {
    Alert.alert(
      lang === 'en' ? 'Delete Post?' : 'Hapus Pos?',
      lang === 'en' ? `Delete "${posName}" from this location?` : `Hapus "${posName}" dari lokasi ini?`,
      [
        { text: lang === 'en' ? 'Cancel' : 'Batal', style: 'cancel' },
        {
          text: lang === 'en' ? 'Delete' : 'Hapus',
          style: 'destructive',
          onPress: () => {
            const lok = lokasi.find((l) => l.id === lokId);
            if (!lok) return;
            const updatedPosList = lok.posList.filter((p) => p.id !== posId);
            updateLokasi(lokId, { posList: updatedPosList });
          },
        },
      ]
    );
  };

  return (
    <View style={st.container}>
      {/* Header - FIX (a): No add button for supervisor */}
      <View style={[st.header, { backgroundColor: theme.bgCard, borderBottomColor: theme.border }]}>
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

      <ScrollView contentContainerStyle={st.content}>
        {filtered.map((l) => (
          <Card key={l.id} style={[st.locCard, { backgroundColor: theme.bgCard }]}>
            <TouchableOpacity onPress={() => setExpanded(expanded === l.id ? null : l.id)}>
              <View style={st.locRow}>
                <View style={[st.locIcon, { backgroundColor: isDark ? `${Colors.primary}20` : Colors.primarySoft }]}>
                  <Ionicons name="business" size={18} color={Colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[st.locName, { color: theme.text }]}>{l.nama}</Text>
                  <Text style={[st.locAddr, { color: theme.textMuted }]}>{l.alamat}</Text>
                  <Text style={[st.locMeta, { color: theme.textMuted }]}>
                    {l.posList.length} pos • {l.totalAnggota} {lang === 'en' ? 'members' : 'anggota'}
                  </Text>
                </View>
                <Badge text={l.status === 'active' ? (lang === 'en' ? 'Active' : 'Aktif') : (lang === 'en' ? 'Inactive' : 'Nonaktif')} variant={l.status === 'active' ? 'success' : 'default'} />
                <Ionicons name={expanded === l.id ? 'chevron-up' : 'chevron-down'} size={20} color={theme.textMuted} />
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
                        {p.latitude ? ` • ${Number(p.latitude).toFixed(4)}, ${Number(p.longitude).toFixed(4)}` : ''}
                      </Text>
                    </View>
                    <Badge text={p.status === 'active' ? (lang === 'en' ? 'Active' : 'Aktif') : 'Off'} variant={p.status === 'active' ? 'success' : 'default'} />
                    <View style={{ flexDirection: 'row', gap: 8, marginLeft: 8 }}>
                      <TouchableOpacity onPress={() => openEditPosModal(l.id, p.id)}>
                        <Ionicons name="create-outline" size={18} color={Colors.primary} />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => handleDeletePos(l.id, p.id, p.nama)}>
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
                  />
                  <Button
                    title={lang === 'en' ? 'Edit Location' : 'Edit Lokasi'}
                    variant="outline"
                    size="small"
                    icon="create-outline"
                    onPress={() => openEditLokasiModal(l.id)}
                    style={{ flex: 1 }}
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

      {/* ===== MODAL: Add Pos - FIX (b) ===== */}
      <Modal visible={showAddPos} transparent animationType="slide">
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={st.modalOverlay}>
            <View style={[st.modalCard, { backgroundColor: isDark ? theme.bgCard : '#fff' }]}>
              <View style={st.modalHeader}>
                <Text style={[st.modalTitle, { color: theme.text }]}>
                  {lang === 'en' ? 'Add Guard Post' : 'Tambah Pos Jaga'}
                </Text>
                <TouchableOpacity onPress={() => setShowAddPos(false)}>
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
                />
                <Text style={[st.fHint, { color: theme.textMuted }]}>
                  {lang === 'en' ? 'Geofence radius for attendance check-in (10-500m)' : 'Radius geofence untuk absensi (10-500m)'}
                </Text>

                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={[st.fLabel, { color: theme.textSecondary }]}>Latitude</Text>
                    <TextInput
                      style={[st.fInput, { borderColor: theme.border, color: theme.text, backgroundColor: isDark ? theme.bgInput : Colors.bgWhite }]}
                      value={newPosLatitude}
                      onChangeText={setNewPosLatitude}
                      placeholder="0.0000"
                      placeholderTextColor={theme.textMuted}
                      keyboardType="numeric"
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[st.fLabel, { color: theme.textSecondary }]}>Longitude</Text>
                    <TextInput
                      style={[st.fInput, { borderColor: theme.border, color: theme.text, backgroundColor: isDark ? theme.bgInput : Colors.bgWhite }]}
                      value={newPosLongitude}
                      onChangeText={setNewPosLongitude}
                      placeholder="0.0000"
                      placeholderTextColor={theme.textMuted}
                      keyboardType="numeric"
                    />
                  </View>
                </View>
                <Text style={[st.fHint, { color: theme.textMuted }]}>
                  {lang === 'en' ? 'GPS coordinates for the post location' : 'Koordinat GPS lokasi pos jaga'}
                </Text>
              </ScrollView>

              <View style={st.modalActions}>
                <Button title={lang === 'en' ? 'Cancel' : 'Batal'} variant="outline" size="medium" onPress={() => setShowAddPos(false)} style={{ flex: 1 }} />
                <Button title={lang === 'en' ? 'Add Post' : 'Tambah Pos'} variant="primary" size="medium" icon="add-outline" onPress={handleAddPos} style={{ flex: 1 }} />
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ===== MODAL: Edit Lokasi - FIX (c) ===== */}
      <Modal visible={showEditLokasi} transparent animationType="slide">
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={st.modalOverlay}>
            <View style={[st.modalCard, { backgroundColor: isDark ? theme.bgCard : '#fff' }]}>
              <View style={st.modalHeader}>
                <Text style={[st.modalTitle, { color: theme.text }]}>
                  {lang === 'en' ? 'Edit Location' : 'Edit Lokasi'}
                </Text>
                <TouchableOpacity onPress={() => setShowEditLokasi(false)}>
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
              />

              <Text style={[st.fLabel, { color: theme.textSecondary }]}>Status</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity
                  style={[st.statusChip, editStatus === 'active' && st.statusChipActive]}
                  onPress={() => setEditStatus('active')}
                >
                  <Ionicons name="checkmark-circle" size={16} color={editStatus === 'active' ? '#fff' : Colors.success} />
                  <Text style={[st.statusChipText, editStatus === 'active' && { color: '#fff' }]}>
                    {lang === 'en' ? 'Active' : 'Aktif'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[st.statusChip, editStatus === 'inactive' && st.statusChipInactive]}
                  onPress={() => setEditStatus('inactive')}
                >
                  <Ionicons name="close-circle" size={16} color={editStatus === 'inactive' ? '#fff' : Colors.textMuted} />
                  <Text style={[st.statusChipText, editStatus === 'inactive' && { color: '#fff' }]}>
                    {lang === 'en' ? 'Inactive' : 'Nonaktif'}
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={st.modalActions}>
                <Button title={lang === 'en' ? 'Cancel' : 'Batal'} variant="outline" size="medium" onPress={() => setShowEditLokasi(false)} style={{ flex: 1 }} />
                <Button title={lang === 'en' ? 'Save Changes' : 'Simpan Perubahan'} variant="primary" size="medium" icon="save-outline" onPress={handleEditLokasi} style={{ flex: 1 }} />
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ===== MODAL: Edit Pos ===== */}
      <Modal visible={showEditPos} transparent animationType="slide">
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={st.modalOverlay}>
            <View style={[st.modalCard, { backgroundColor: isDark ? theme.bgCard : '#fff' }]}>
              <View style={st.modalHeader}>
                <Text style={[st.modalTitle, { color: theme.text }]}>
                  {lang === 'en' ? 'Edit Post' : 'Edit Pos'}
                </Text>
                <TouchableOpacity onPress={() => setShowEditPos(false)}>
                  <Ionicons name="close" size={24} color={theme.textMuted} />
                </TouchableOpacity>
              </View>

              <Text style={[st.fLabel, { color: theme.textSecondary }]}>
                {lang === 'en' ? 'Post Name' : 'Nama Pos'} *
              </Text>
              <TextInput
                style={[st.fInput, { borderColor: theme.border, color: theme.text, backgroundColor: isDark ? theme.bgInput : Colors.bgWhite }]}
                value={editPosNama}
                onChangeText={setEditPosNama}
                placeholderTextColor={theme.textMuted}
              />

              <Text style={[st.fLabel, { color: theme.textSecondary }]}>Radius (meter)</Text>
              <TextInput
                style={[st.fInput, { borderColor: theme.border, color: theme.text, backgroundColor: isDark ? theme.bgInput : Colors.bgWhite }]}
                value={editPosRadius}
                onChangeText={setEditPosRadius}
                keyboardType="numeric"
                placeholderTextColor={theme.textMuted}
              />

              <Text style={[st.fLabel, { color: theme.textSecondary }]}>Status</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity
                  style={[st.statusChip, editPosStatus === 'active' && st.statusChipActive]}
                  onPress={() => setEditPosStatus('active')}
                >
                  <Text style={[st.statusChipText, editPosStatus === 'active' && { color: '#fff' }]}>
                    {lang === 'en' ? 'Active' : 'Aktif'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[st.statusChip, editPosStatus === 'inactive' && st.statusChipInactive]}
                  onPress={() => setEditPosStatus('inactive')}
                >
                  <Text style={[st.statusChipText, editPosStatus === 'inactive' && { color: '#fff' }]}>
                    {lang === 'en' ? 'Inactive' : 'Nonaktif'}
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={st.modalActions}>
                <Button title={lang === 'en' ? 'Cancel' : 'Batal'} variant="outline" size="medium" onPress={() => setShowEditPos(false)} style={{ flex: 1 }} />
                <Button title={lang === 'en' ? 'Save' : 'Simpan'} variant="primary" size="medium" onPress={handleEditPos} style={{ flex: 1 }} />
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgLight },
  header: {
    flexDirection: 'row', alignItems: 'center', paddingTop: 50, paddingBottom: 12,
    paddingHorizontal: Spacing.base, backgroundColor: Colors.bgWhite, borderBottomWidth: 1, borderBottomColor: Colors.borderLight,
  },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  headerTitle: { ...Typography.h3, color: Colors.textPrimary, flex: 1, textAlign: 'center' },
  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: Spacing.base,
    marginVertical: 8, backgroundColor: Colors.bgGray, borderRadius: Radius.md, paddingHorizontal: 12, height: 42,
  },
  searchInput: { flex: 1, ...Typography.body, color: Colors.textPrimary },
  statsBar: {
    flexDirection: 'row', paddingHorizontal: Spacing.base, paddingVertical: 10,
    backgroundColor: Colors.bgWhite, borderBottomWidth: 1, borderBottomColor: Colors.borderLight,
  },
  statItem: { flex: 1, alignItems: 'center' },
  statVal: { fontSize: 18, fontWeight: '800', color: Colors.primary },
  statLbl: { ...Typography.caption, color: Colors.textMuted },
  infoBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: Spacing.base,
    marginTop: 8, padding: 10, borderRadius: Radius.md, borderWidth: 1,
  },
  infoText: { ...Typography.caption, flex: 1, lineHeight: 17 },
  content: { padding: Spacing.base },
  locCard: { marginBottom: 10 },
  locRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  locIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  locName: { ...Typography.bodyBold, color: Colors.textPrimary },
  locAddr: { ...Typography.caption, color: Colors.textMuted },
  locMeta: { ...Typography.caption, color: Colors.textMuted, marginTop: 2 },
  posWrap: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: Colors.borderLight },
  posTitle: { ...Typography.smallBold, color: Colors.textSecondary, marginBottom: 8 },
  posRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  posDot: { width: 8, height: 8, borderRadius: 4 },
  posName: { ...Typography.body, color: Colors.textPrimary },
  posDetail: { ...Typography.caption, color: Colors.textMuted, marginTop: 1 },
  emptyPos: { ...Typography.caption, textAlign: 'center', paddingVertical: 12 },
  locActions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  empty: { alignItems: 'center', paddingVertical: 40, gap: 8 },
  emptyText: { ...Typography.body, color: Colors.textMuted },
  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, maxHeight: '85%' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  modalTitle: { ...Typography.h3, color: Colors.textPrimary },
  modalSubtitle: { ...Typography.caption, marginBottom: 8 },
  fLabel: { ...Typography.smallBold, color: Colors.textSecondary, marginBottom: 4, marginTop: 12 },
  fInput: { borderWidth: 1.5, borderColor: Colors.border, borderRadius: Radius.md, paddingHorizontal: 14, height: 48, ...Typography.body, color: Colors.textPrimary },
  fInputMulti: { height: 80, paddingTop: 12 },
  fHint: { ...Typography.caption, color: Colors.textMuted, marginTop: 4 },
  statusChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 10,
    borderRadius: Radius.full, borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.bgWhite,
  },
  statusChipActive: { backgroundColor: Colors.success, borderColor: Colors.success },
  statusChipInactive: { backgroundColor: Colors.textMuted, borderColor: Colors.textMuted },
  statusChipText: { ...Typography.smallBold, color: Colors.textSecondary },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 20 },
});