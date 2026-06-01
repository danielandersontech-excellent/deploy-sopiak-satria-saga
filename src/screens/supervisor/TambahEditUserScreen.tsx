/**
 * TAMBAH/EDIT USER - Express.js Backend
 * CREATE: POST /api/auth/register â†’ creates user with default PIN 123456
 * EDIT: PUT /api/users/:id â†’ updates user data
 */
import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Radius } from '../../constants';
import { Card, Badge, Button } from '../../components';
import { useDataStore, type TeamMember } from '../../stores/dataStore';
import { useAuthStore } from '../../stores/authStore';
import { authApi, usersApi } from '../../lib/apiClient';
import { useI18n } from '../../lib/i18n';
import { useTheme } from '../../lib/theme';

const ROLES = ['anggota', 'komandan'] as const;
const SHIFTS = ['06:00-14:00', '14:00-22:00', '22:00-06:00'] as const;
const DEFAULT_PIN = '123456';

export default function TambahEditUserScreen({ navigation, route }: any) {
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  const { theme, isDark } = useTheme();
  const { userId } = route.params || {};
  const team = useDataStore((s) => s.team);
  const lokasi = useDataStore((s) => s.lokasi);
  const loadAllData = useDataStore((s) => s.loadAllData);
  const existing = userId ? team.find((m) => m.id === userId) : null;
  const isEdit = !!existing;

  // Get current user's lokasi for default assignment
  const currentUser = useAuthStore((s) => s.user);
  const defaultLokasiId = useMemo(() => {
    if (lokasi.length > 0) return lokasi[0].id;
    return null;
  }, [lokasi]);

  const [nama, setNama] = useState(existing?.nama || '');
  const [nrp, setNrp] = useState(existing?.nrp || '');
  const [noHp, setNoHp] = useState(existing?.noHp || '');
  const [role, setRole] = useState<string>(existing?.role || 'anggota');
  const [shift, setShift] = useState(existing?.shift || SHIFTS[0]);
  const [pos, setPos] = useState(existing?.pos || '');
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleSave = async () => {
    setErrorMsg('');

    // Validations
    if (!nama.trim()) return Alert.alert('Error', 'Nama wajib diisi');
    if (!nrp.trim() || nrp.length < 4) return Alert.alert('Error', 'NRP minimal 4 karakter');
    if (!noHp.trim()) return Alert.alert('Error', 'No HP wajib diisi');

    setSaving(true);

    try {
      if (isEdit) {
        await handleEdit();
      } else {
        await handleCreate();
      }
    } catch (err: any) {
      setSaving(false);
      setErrorMsg(`Error: ${err.message || 'Unknown'}`);
    }
  };

  // ===== CREATE NEW USER =====
  const handleCreate = async () => {
    // Check duplicate NRP
    try {
      const allUsers = await usersApi.list();
      const dup = (Array.isArray(allUsers) ? allUsers : []).find((u: any) => u.nrp === nrp.trim());
      if (dup) {
        setSaving(false);
        setErrorMsg(`NRP ${nrp} sudah terdaftar di sistem`);
        return;
      }
    } catch {}

    // Register new user via backend API
    const newUser = await authApi.register({
      nrp: nrp.trim(),
      nama: nama.trim(),
      role: role,
      no_hp: noHp.trim(),
      lokasi_id: defaultLokasiId || null,
      shift: shift,
    });

    // Reload data
    await loadAllData();

    setSaving(false);
    Alert.alert(
      'âœ… Berhasil',
      `Pengguna baru berhasil ditambahkan:\n\nNama: ${nama.trim()}\nNRP: ${nrp.trim()}\nPIN: 123456\n\nUser dapat login dan ubah PIN sendiri.`,
      [{ text: 'OK', onPress: () => navigation.goBack() }]
    );
  };

  // ===== EDIT EXISTING USER =====
  const handleEdit = async () => {
    await usersApi.update(existing!.id, {
      nama: nama.trim(),
      no_hp: noHp.trim(),
      role: role,
      shift: shift,
    });

    // Update local store
    useDataStore.getState().updateTeamMember(existing!.id, {
      nama: nama.trim(),
      noHp: noHp.trim(),
      role: role as any,
      shift: shift,
    });

    setSaving(false);
    Alert.alert('âœ… Berhasil', 'Data pengguna berhasil diperbarui', [
      { text: 'OK', onPress: () => navigation.goBack() },
    ]);
  };

  return (
    <View style={st.container}>
      <View style={[st.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={st.backBtn}>
          <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={st.headerTitle}>{isEdit ? 'Edit Pengguna' : 'Tambah Pengguna'}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={st.content} keyboardShouldPersistTaps="handled">
        {/* Info banner for new user */}
        {!isEdit && (
          <Card variant="bordered" borderColor={Colors.primary} style={{ marginBottom: 16 }}>
            <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
              <Ionicons name="information-circle" size={22} color={Colors.primary} />
              <View style={{ flex: 1 }}>
                <Text style={{ ...Typography.smallBold, color: Colors.primary }}>Info Pendaftaran</Text>
                <Text style={{ ...Typography.caption, color: Colors.textMuted }}>
                  User baru akan mendapat akun dengan email NRP@ptsss.app dan PIN default: {DEFAULT_PIN}
                </Text>
              </View>
            </View>
          </Card>
        )}

        <Text style={st.label}>Nama Lengkap *</Text>
        <TextInput style={st.input} value={nama} onChangeText={setNama} placeholder="Nama lengkap" placeholderTextColor={Colors.textMuted} />

        <Text style={st.label}>NRP *</Text>
        <TextInput
          style={[st.input, isEdit && st.inputDisabled]}
          value={nrp}
          onChangeText={setNrp}
          placeholder="Contoh: 220009"
          placeholderTextColor={Colors.textMuted}
          editable={!isEdit}
        />
        {isEdit && <Text style={st.hint}>NRP tidak dapat diubah</Text>}
        {!isEdit && <Text style={st.hint}>Login: {nrp ? `${nrp.toLowerCase().replace(/[^a-z0-9]/g, '')}@ptsss.app` : 'NRP@ptsss.app'}</Text>}

        <Text style={st.label}>No. HP *</Text>
        <TextInput style={st.input} value={noHp} onChangeText={setNoHp} placeholder="08xxxxxxxxxx" placeholderTextColor={Colors.textMuted} keyboardType="phone-pad" />

        <Text style={st.label}>Role</Text>
        <View style={st.chipRow}>
          {ROLES.map((r) => (
            <TouchableOpacity key={r} style={[st.chip, role === r && st.chipActive]} onPress={() => setRole(r)}>
              <Ionicons name={r === 'komandan' ? 'shield' : 'person'} size={14} color={role === r ? '#fff' : Colors.textMuted} style={{ marginRight: 4 }} />
              <Text style={[st.chipText, role === r && { color: '#fff' }]}>
                {r.charAt(0).toUpperCase() + r.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={st.label}>Shift</Text>
        <View style={st.chipRow}>
          {SHIFTS.map((s) => (
            <TouchableOpacity key={s} style={[st.chip, shift === s && st.chipActive]} onPress={() => setShift(s)}>
              <Text style={[st.chipText, shift === s && { color: '#fff' }]}>{s}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={st.label}>Pos Jaga</Text>
        <TextInput style={st.input} value={pos} onChangeText={setPos} placeholder="Pos Utama / Pos Belakang / ..." placeholderTextColor={Colors.textMuted} />

        {/* Error */}
        {errorMsg !== '' && (
          <Card variant="bordered" borderColor={Colors.danger} style={{ marginTop: 12, backgroundColor: Colors.dangerBg }}>
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
              <Ionicons name="alert-circle" size={18} color={Colors.danger} />
              <Text style={{ ...Typography.small, color: Colors.danger, flex: 1 }}>{errorMsg}</Text>
            </View>
          </Card>
        )}

        {/* Save info */}
        <View style={st.saveInfo}>
          <Ionicons name="cloud-upload-outline" size={14} color={Colors.textMuted} />
          <Text style={st.saveInfoText}>
            {isEdit ? 'Perubahan tersimpan ke server' : 'Akun baru akan dibuat di server'}
          </Text>
        </View>

        <Button
          title={saving ? 'Menyimpan...' : (isEdit ? 'SIMPAN PERUBAHAN' : 'TAMBAH PENGGUNA')}
          variant="primary"
          size="large"
          fullWidth
          icon={isEdit ? 'save-outline' : 'person-add-outline'}
          onPress={handleSave}
          disabled={saving}
          style={{ marginTop: 16 }}
        />
        <View style={{ height: 32 }} />
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgLight },
  header: { flexDirection: 'row', alignItems: 'center', paddingBottom: 12, paddingHorizontal: Spacing.base, backgroundColor: Colors.bgWhite, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  headerTitle: { ...Typography.h3, color: Colors.textPrimary, flex: 1, textAlign: 'center' },
  content: { padding: Spacing.base },
  label: { ...Typography.smallBold, color: Colors.textSecondary, marginBottom: 6, marginTop: 14 },
  input: { borderWidth: 1.5, borderColor: Colors.border, borderRadius: Radius.md, paddingHorizontal: 14, height: 48, ...Typography.body, color: Colors.textPrimary, backgroundColor: Colors.bgWhite },
  inputDisabled: { backgroundColor: Colors.bgGray, color: Colors.textMuted },
  hint: { ...Typography.caption, color: Colors.textMuted, marginTop: 4 },
  chipRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, borderRadius: Radius.full, borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.bgWhite },
  chipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipText: { ...Typography.smallBold, color: Colors.textSecondary },
  saveInfo: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12 },
  saveInfoText: { ...Typography.caption, color: Colors.textMuted },
});
============================================================
