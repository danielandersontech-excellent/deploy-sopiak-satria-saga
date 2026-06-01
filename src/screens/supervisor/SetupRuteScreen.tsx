/**
 * SETUP RUTE - v2 (Bug-Fix Pass)
 *
 * FIXES (v2):
 *  ðŸš¨ Edit button was "(simulasi)" â€” never actually edited routes!
 *     Now opens modal with route data and persists via updateRoute().
 *  âœ… Dark mode + i18n (was importing both but using neither).
 *  âœ… Modal `onRequestClose` for Android back button.
 *  âœ… Waktu Estimasi input (was hardcoded `selectedCps.length * 6`).
 *  âœ… Assigned Shift selector from shifts in store (was hardcoded 'Semua').
 *  âœ… Search filter for routes.
 *  âœ… Empty state for routes and checkpoints in modal.
 *  âœ… Submitting state to prevent double-tap.
 *  âœ… Confirmation dialog uses dual-language text.
 *  âœ… Pull-to-refresh.
 */
import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert,
  Modal, KeyboardAvoidingView, Platform, RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Radius } from '../../constants';
import { Card, Badge, Button } from '../../components';
import { useDataStore } from '../../stores/dataStore';
import { useI18n } from '../../lib/i18n';
import { useTheme } from '../../lib/theme';

export default function SetupRuteScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const { t, lang } = useI18n();
  const { theme, isDark } = useTheme();
  const routes = useDataStore((s) => s.routes);
  const checkpoints = useDataStore((s) => s.checkpoints);
  const shifts = useDataStore((s) => s.shifts);
  const addRoute = useDataStore((s) => s.addRoute);
  const updateRoute = useDataStore((s) => s.updateRoute);
  const deleteRoute = useDataStore((s) => s.deleteRoute);
  const loadAllData = useDataStore((s) => s.loadAllData);

  // Modal state (used for both add and edit)
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [fName, setFName] = useState('');
  const [fSelectedCps, setFSelectedCps] = useState<string[]>([]);
  const [fEstimasi, setFEstimasi] = useState('');
  const [fShift, setFShift] = useState('Semua');

  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const filtered = useMemo(() => {
    if (!search) return routes;
    const q = search.toLowerCase();
    return routes.filter((r) => r.nama.toLowerCase().includes(q));
  }, [routes, search]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await loadAllData?.(); } catch {}
    finally { setRefreshing(false); }
  }, [loadAllData]);

  const openAddModal = () => {
    if (checkpoints.length === 0) {
      Alert.alert(
        lang === 'en' ? 'No Checkpoints' : 'Belum Ada Checkpoint',
        lang === 'en'
          ? 'Please create checkpoints first before setting up a route.'
          : 'Silakan buat checkpoint terlebih dahulu sebelum mengatur rute.'
      );
      return;
    }
    setEditingId(null);
    setFName('');
    setFSelectedCps([]);
    setFEstimasi('');
    setFShift(shifts[0]?.nama || 'Semua');
    setShowModal(true);
  };

  const openEditModal = (r: any) => {
    setEditingId(r.id);
    setFName(r.nama || '');
    setFSelectedCps(r.checkpointIds || []);
    setFEstimasi(r.waktuEstimasi != null ? String(r.waktuEstimasi) : '');
    setFShift(r.assignedShift || 'Semua');
    setShowModal(true);
  };

  const toggleCp = (id: string) => {
    setFSelectedCps((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );
  };

  const handleSave = async () => {
    if (submitting) return;
    if (!fName.trim()) {
      return Alert.alert('Error', lang === 'en' ? 'Route name is required' : 'Nama rute wajib diisi');
    }
    if (fSelectedCps.length < 2) {
      return Alert.alert('Error', lang === 'en' ? 'Select at least 2 checkpoints' : 'Pilih minimal 2 checkpoint');
    }
    const estimasi = parseInt(fEstimasi, 10);
    const finalEstimasi = isNaN(estimasi) || estimasi <= 0 ? fSelectedCps.length * 6 : estimasi;
    if (finalEstimasi < 1 || finalEstimasi > 600) {
      return Alert.alert(
        'Error',
        lang === 'en' ? 'Estimated time must be 1-600 minutes' : 'Estimasi waktu harus 1-600 menit'
      );
    }

    setSubmitting(true);
    try {
      if (editingId) {
        updateRoute(editingId, {
          nama: fName.trim(),
          checkpointIds: fSelectedCps,
          waktuEstimasi: finalEstimasi,
          assignedShift: fShift,
        } as any);
        Alert.alert('âœ…', lang === 'en' ? 'Route updated' : 'Rute berhasil diperbarui');
      } else {
        addRoute({
          nama: fName.trim(),
          checkpointIds: fSelectedCps,
          waktuEstimasi: finalEstimasi,
          assignedShift: fShift,
          status: 'active',
        });
        Alert.alert('âœ…', lang === 'en' ? 'Route added' : 'Rute baru ditambahkan');
      }
      setShowModal(false);
    } catch (e: any) {
      Alert.alert('Error', e?.message || (lang === 'en' ? 'Failed to save route' : 'Gagal menyimpan rute'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDuplicate = (r: any) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      addRoute({
        nama: `${r.nama} (Copy)`,
        checkpointIds: r.checkpointIds,
        waktuEstimasi: r.waktuEstimasi,
        assignedShift: r.assignedShift,
        status: r.status === 'active' ? 'active' : 'inactive',
      });
      Alert.alert('âœ…', lang === 'en' ? 'Route duplicated' : 'Rute berhasil diduplikat');
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = (id: string, nama: string) => {
    Alert.alert(
      lang === 'en' ? 'Delete Route?' : 'Hapus Rute?',
      lang === 'en' ? `Delete "${nama}"?` : `Hapus "${nama}"?`,
      [
        { text: lang === 'en' ? 'Cancel' : 'Batal', style: 'cancel' },
        {
          text: lang === 'en' ? 'Delete' : 'Hapus',
          style: 'destructive',
          onPress: () => deleteRoute(id),
        },
      ]
    );
  };

  return (
    <View style={[st.container, { backgroundColor: theme.bg }]}>
      <View style={[st.header, { paddingTop: insets.top + 12 }, { backgroundColor: theme.bgCard, borderBottomColor: theme.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={st.backBtn}>
          <Ionicons name="arrow-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={[st.headerTitle, { color: theme.text }]}>
          {lang === 'en' ? 'Setup Route' : 'Setup Rute'}
        </Text>
        <TouchableOpacity onPress={openAddModal}>
          <Ionicons name="add-circle" size={28} color={Colors.primary} />
        </TouchableOpacity>
      </View>

      <View style={[st.searchRow, { backgroundColor: isDark ? theme.bgInput : Colors.bgGray }]}>
        <Ionicons name="search" size={18} color={theme.textMuted} />
        <TextInput
          style={[st.searchInput, { color: theme.text }]}
          placeholder={lang === 'en' ? 'Search route...' : 'Cari rute...'}
          placeholderTextColor={theme.textMuted}
          value={search}
          onChangeText={setSearch}
        />
      </View>

      <ScrollView
        contentContainerStyle={st.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
      >
        {filtered.map((r) => {
          const cpNames = r.checkpointIds.map(
            (id) => checkpoints.find((c) => c.id === id)?.nama || `[${id}]`
          );
          return (
            <Card
              key={r.id}
              style={st.card}
              variant="bordered"
              borderColor={r.status === 'active' ? Colors.success : Colors.textMuted}
            >
              <View style={st.cardTop}>
                <Ionicons name="navigate" size={20} color={Colors.primary} />
                <Text style={[st.routeName, { color: theme.text }]}>{r.nama}</Text>
                <Badge
                  text={r.status === 'active' ? (lang === 'en' ? 'Active' : 'Aktif') : 'Off'}
                  variant={r.status === 'active' ? 'success' : 'default'}
                />
              </View>
              <Text style={[st.routeMeta, { color: theme.textMuted }]}>
                {r.checkpointIds.length} checkpoint â€¢ ~{r.waktuEstimasi} {lang === 'en' ? 'min' : 'menit'} â€¢ {r.assignedShift || '-'}
              </Text>
              <Text style={[st.routeCps, { color: Colors.primary }]}>{cpNames.join(' â†’ ')}</Text>
              <View style={st.cardActions}>
                <Button
                  title={lang === 'en' ? 'Edit' : 'Edit'}
                  variant="outline"
                  size="small"
                  icon="create-outline"
                  onPress={() => openEditModal(r)}
                  style={{ flex: 1 }}
                  disabled={submitting}
                />
                <Button
                  title={lang === 'en' ? 'Duplicate' : 'Duplikat'}
                  variant="outline"
                  size="small"
                  icon="copy-outline"
                  onPress={() => handleDuplicate(r)}
                  style={{ flex: 1 }}
                  disabled={submitting}
                />
                <Button
                  title={lang === 'en' ? 'Delete' : 'Hapus'}
                  variant="outline"
                  size="small"
                  icon="trash-outline"
                  onPress={() => handleDelete(r.id, r.nama)}
                  style={{ flex: 1 }}
                  textStyle={{ color: Colors.danger }}
                  disabled={submitting}
                />
              </View>
            </Card>
          );
        })}

        {filtered.length === 0 && (
          <View style={st.empty}>
            <Ionicons name="navigate-outline" size={48} color={theme.textMuted} />
            <Text style={[st.emptyText, { color: theme.textMuted }]}>
              {search
                ? (lang === 'en' ? 'No matching route' : 'Tidak ada rute yang cocok')
                : (lang === 'en' ? 'No routes yet' : 'Belum ada rute')}
            </Text>
            {!search && (
              <Button
                title={lang === 'en' ? 'Add Route' : 'Tambah Rute'}
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
          <View style={st.modalOverlay}>
            <View style={[st.modalCard, { backgroundColor: theme.bgCard }]}>
              <View style={st.modalHeader}>
                <Text style={[st.modalTitle, { color: theme.text }]}>
                  {editingId
                    ? (lang === 'en' ? 'Edit Route' : 'Edit Rute')
                    : (lang === 'en' ? 'Add New Route' : 'Tambah Rute Baru')}
                </Text>
                <TouchableOpacity onPress={() => !submitting && setShowModal(false)} disabled={submitting}>
                  <Ionicons name="close" size={24} color={theme.textMuted} />
                </TouchableOpacity>
              </View>

              <ScrollView showsVerticalScrollIndicator={false}>
                <Text style={[st.fLabel, { color: theme.textSecondary }]}>
                  {lang === 'en' ? 'Route Name' : 'Nama Rute'} *
                </Text>
                <TextInput
                  style={[st.fInput, { borderColor: theme.border, color: theme.text, backgroundColor: isDark ? theme.bgInput : Colors.bgWhite }]}
                  value={fName}
                  onChangeText={setFName}
                  placeholder={lang === 'en' ? 'Patrol route name' : 'Nama rute patroli'}
                  placeholderTextColor={theme.textMuted}
                  editable={!submitting}
                  maxLength={64}
                />

                <Text style={[st.fLabel, { color: theme.textSecondary }]}>
                  {lang === 'en' ? 'Select Checkpoints (min 2)' : 'Pilih Checkpoint (min 2)'}
                </Text>
                <View style={[st.cpListWrap, { borderColor: theme.border }]}>
                  {checkpoints.length === 0 ? (
                    <Text style={[st.emptyCpText, { color: theme.textMuted }]}>
                      {lang === 'en' ? 'No checkpoints available' : 'Tidak ada checkpoint tersedia'}
                    </Text>
                  ) : (
                    <ScrollView style={{ maxHeight: 200 }}>
                      {checkpoints.map((cp) => {
                        const isSelected = fSelectedCps.includes(cp.id);
                        return (
                          <TouchableOpacity
                            key={cp.id}
                            style={[
                              st.cpRow,
                              { borderBottomColor: theme.border },
                              isSelected && { backgroundColor: isDark ? `${Colors.primary}20` : Colors.primaryBg },
                            ]}
                            onPress={() => toggleCp(cp.id)}
                            disabled={submitting}
                          >
                            <Ionicons
                              name={isSelected ? 'checkbox' : 'square-outline'}
                              size={20}
                              color={isSelected ? Colors.primary : theme.textMuted}
                            />
                            <Text style={[st.cpName, { color: theme.text }]}>
                              {cp.nama} ({cp.area || '-'})
                            </Text>
                            {isSelected && (
                              <Text style={[st.cpOrder, { color: Colors.primary }]}>
                                #{fSelectedCps.indexOf(cp.id) + 1}
                              </Text>
                            )}
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                  )}
                </View>

                <Text style={[st.fLabel, { color: theme.textSecondary }]}>
                  {lang === 'en' ? 'Estimated Time (minutes)' : 'Estimasi Waktu (menit)'}
                </Text>
                <TextInput
                  style={[st.fInput, { borderColor: theme.border, color: theme.text, backgroundColor: isDark ? theme.bgInput : Colors.bgWhite }]}
                  value={fEstimasi}
                  onChangeText={setFEstimasi}
                  placeholder={`${fSelectedCps.length * 6}`}
                  placeholderTextColor={theme.textMuted}
                  keyboardType="numeric"
                  editable={!submitting}
                />
                <Text style={[st.fHint, { color: theme.textMuted }]}>
                  {lang === 'en'
                    ? `Default: ${fSelectedCps.length * 6} min (6 min per checkpoint)`
                    : `Default: ${fSelectedCps.length * 6} menit (6 menit per checkpoint)`}
                </Text>

                <Text style={[st.fLabel, { color: theme.textSecondary }]}>
                  {lang === 'en' ? 'Assigned Shift' : 'Shift Penugasan'}
                </Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={{ marginTop: 4 }}
                  contentContainerStyle={{ gap: 8 }}
                >
                  <TouchableOpacity
                    style={[
                      st.shiftChip,
                      { borderColor: theme.border, backgroundColor: isDark ? theme.bgInput : Colors.bgGray },
                      fShift === 'Semua' && { backgroundColor: Colors.primary, borderColor: Colors.primary },
                    ]}
                    onPress={() => !submitting && setFShift('Semua')}
                    disabled={submitting}
                  >
                    <Text style={[st.shiftChipText, { color: fShift === 'Semua' ? '#fff' : theme.textSecondary }]}>
                      {lang === 'en' ? 'All' : 'Semua'}
                    </Text>
                  </TouchableOpacity>
                  {shifts.map((sh) => (
                    <TouchableOpacity
                      key={sh.id}
                      style={[
                        st.shiftChip,
                        { borderColor: theme.border, backgroundColor: isDark ? theme.bgInput : Colors.bgGray },
                        fShift === sh.nama && { backgroundColor: Colors.primary, borderColor: Colors.primary },
                      ]}
                      onPress={() => !submitting && setFShift(sh.nama)}
                      disabled={submitting}
                    >
                      <Text style={[st.shiftChipText, { color: fShift === sh.nama ? '#fff' : theme.textSecondary }]}>
                        {sh.nama}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </ScrollView>

              <View style={st.modalActions}>
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

const st = StyleSheet.create({
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
  content: { padding: Spacing.base },
  card: { marginBottom: 12 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  routeName: { ...Typography.bodyBold, flex: 1 },
  routeMeta: { ...Typography.caption, marginBottom: 4 },
  routeCps: { ...Typography.caption, fontWeight: '600' },
  cardActions: { flexDirection: 'row', gap: 6, marginTop: 10 },
  empty: { alignItems: 'center', paddingVertical: 40, gap: 10 },
  emptyText: { ...Typography.body },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCard: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, maxHeight: '90%' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  modalTitle: { ...Typography.h3 },
  fLabel: { ...Typography.smallBold, marginBottom: 4, marginTop: 12 },
  fInput: { borderWidth: 1.5, borderRadius: Radius.md, paddingHorizontal: 14, height: 44, ...Typography.body },
  fHint: { ...Typography.caption, marginTop: 4 },
  cpListWrap: { borderWidth: 1, borderRadius: Radius.md, marginTop: 4 },
  cpRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
  },
  cpName: { ...Typography.body, flex: 1 },
  cpOrder: { ...Typography.smallBold },
  emptyCpText: { ...Typography.caption, padding: 20, textAlign: 'center' },
  shiftChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: Radius.full,
    borderWidth: 1,
  },
  shiftChipText: { ...Typography.caption, fontWeight: '600' },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
});
