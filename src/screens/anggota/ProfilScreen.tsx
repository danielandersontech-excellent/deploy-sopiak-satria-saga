/**
 * PROFIL SCREEN - v10 FIXED
 *
 * MASALAH SEBELUMNYA:
 * 1. Field names tidak cocok: DB/API pakai snake_case (no_hp, pos_jaga, lokasi_id)
 *    tapi screen baca camelCase (noHp, posJaga, lokasi) → selalu tampil '-'
 * 2. Lokasi hanya menyimpan lokasi_id (UUID) bukan nama lokasi → perlu resolve
 * 3. Score di-hardcode '98' bukan dari data real
 * 4. Tidak pernah fetch fresh data dari backend → data stale setelah edit profil
 *
 * PERBAIKAN:
 * - Helper function `getField()` yang cek KEDUA format (snake_case & camelCase)
 * - Fetch fresh user data dari API saat mount & setelah kembali dari edit
 * - Resolve lokasi_id → nama lokasi dari dataStore.lokasi
 * - Score dari data real (user.skor / API)
 * - Sinkronisasi authStore setelah fetch
 *
 * FIX v10.1:
 * - setUser tidak ada di AuthState → diganti updateUser yang memang ada di store
 */
import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Image, TouchableOpacity, Alert, Switch } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Radius, Shadows } from '../../constants';
import { Card, Badge, Button } from '../../components';
import { useAuthStore } from '../../stores/authStore';
import { useDataStore } from '../../stores/dataStore';
import { usersApi } from '../../lib/apiClient';
import { useTheme } from '../../lib/theme';
import { useI18n } from '../../lib/i18n';

/**
 * Safely get a field from user object, checking both snake_case and camelCase variants.
 * Example: getField(user, 'noHp', 'no_hp') → tries user.noHp, user.no_hp, user.nohp
 */
function getField(obj: any, ...keys: string[]): string {
  if (!obj) return '';
  for (const key of keys) {
    if (obj[key] !== undefined && obj[key] !== null && obj[key] !== '') return String(obj[key]);
  }
  return '';
}

export default function ProfilScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const user = useAuthStore((s) => s.user);
  // FIX: setUser tidak ada di AuthState - gunakan updateUser yang memang ada
  const updateUser = useAuthStore((s) => s.updateUser);
  const logout = useAuthStore((s) => s.logout);
  const absensiRecords = useDataStore((s) => s.absensiRecords);
  const laporanHarian = useDataStore((s) => s.laporanHarian);
  const laporanKejadian = useDataStore((s) => s.laporanKejadian);
  const allLokasi = useDataStore((s) => s.lokasi);
  const team = useDataStore((s) => s.team);
  const { isDark, toggleTheme, theme } = useTheme();
  const { lang, setLang, t } = useI18n();

  const [freshUser, setFreshUser] = useState<any>(null);

  // ═══ FETCH fresh user data from API ═══
  const fetchFreshProfile = useCallback(async () => {
    const uid = getField(user, 'id', '_id');
    if (!uid) return;
    try {
      const data = await usersApi.get(uid);
      if (data) {
        setFreshUser(data);
        // FIX: Sync back to authStore menggunakan updateUser (bukan setUser)
        // updateUser sudah otomatis merge dengan current user di dalam store
        if (typeof updateUser === 'function') {
          updateUser(data);
        }
      }
    } catch (e) {
      console.log('[Profil] Fetch fresh profile failed (using cached):', e);
    }
  }, [user?.id]);

  useEffect(() => {
    fetchFreshProfile();
  }, [fetchFreshProfile]);

  // Re-fetch when navigating back (e.g., after editing profile)
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      fetchFreshProfile();
    });
    return unsubscribe;
  }, [navigation, fetchFreshProfile]);

  // ═══ Merge user data: freshUser (API) takes priority, then authStore user ═══
  const merged = useMemo(() => {
    return { ...(user || {}), ...(freshUser || {}) };
  }, [user, freshUser]);

  // ═══ Extract fields with snake_case/camelCase fallback ═══
  const uid = getField(merged, 'id', '_id');
  const nama = getField(merged, 'nama', 'name', 'full_name') || 'User';
  const nrp = getField(merged, 'nrp', 'NRP');
  const role = getField(merged, 'role') || 'anggota';
  const foto = getField(merged, 'foto', 'foto_url', 'avatar', 'photo_url', 'profile_photo')
    || 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&h=200&fit=crop&crop=face';
  const noHp = getField(merged, 'noHp', 'no_hp', 'nohp', 'phone', 'telepon');
  const posJaga = getField(merged, 'posJaga', 'pos_jaga', 'posjaga', 'pos');
  const shift = getField(merged, 'shift');
  const lokasiId = getField(merged, 'lokasi_id', 'lokasiId');
  const lokasiNamaRaw = getField(merged, 'lokasi_nama', 'lokasiNama', 'lokasi', 'location');

  // ═══ Resolve lokasi name from store if we only have ID ═══
  const lokasiNama = useMemo(() => {
    // First try direct name from user object
    if (lokasiNamaRaw && lokasiNamaRaw !== lokasiId) return lokasiNamaRaw;
    // Resolve from lokasi store
    if (lokasiId) {
      const found = allLokasi.find(l => String(l.id) === String(lokasiId));
      if (found) return found.nama;
    }
    // Try matching from team data
    const teamMe = team.find(m => m.id === uid || m.nrp === nrp);
    if (teamMe?.lokasi) return teamMe.lokasi;
    return '';
  }, [lokasiNamaRaw, lokasiId, allLokasi, team, uid, nrp]);

  // ═══ Get real score ═══
  const skor = useMemo(() => {
    // From user object
    const userSkor = Number(getField(merged, 'skor', 'score', 'total_skor'));
    if (userSkor > 0) return userSkor;
    // From team data
    const teamMe = team.find(m => m.id === uid || m.nrp === nrp);
    if (teamMe?.skor) return teamMe.skor;
    return 0;
  }, [merged, team, uid, nrp]);

  // ═══ Stats from store ═══
  const absensi = useMemo(() => absensiRecords.filter((a) => a.userId === uid || a.nrp === nrp), [absensiRecords, uid, nrp]);
  const laporanH = useMemo(() => laporanHarian.filter((l) => l.userId === uid), [laporanHarian, uid]);
  const laporanK = useMemo(() => laporanKejadian.filter((l) => l.userId === uid), [laporanKejadian, uid]);

  const handleLogout = () => {
    Alert.alert(
      t('general.confirm'),
      t('settings.confirm_logout'),
      [
        { text: t('general.cancel'), style: 'cancel' },
        { text: t('settings.logout'), style: 'destructive', onPress: () => { logout(); navigation.reset({ index: 0, routes: [{ name: 'Login' }] }); } },
      ]
    );
  };

  const settings = [
    { icon: 'person-outline', label: t('settings.edit_profile'), screen: 'EditProfil', color: Colors.primary },
    { icon: 'key-outline', label: t('settings.change_pin'), screen: 'UbahPIN', color: Colors.warning },
    { icon: 'notifications-outline', label: t('nav.notifications'), screen: 'Notifikasi', color: Colors.danger },
    { icon: 'time-outline', label: t('history.attendance'), screen: 'RiwayatAbsensi', color: Colors.success },
    { icon: 'document-text-outline', label: t('history.reports'), screen: 'RiwayatLaporan', color: Colors.purple },
    { icon: 'information-circle-outline', label: t('settings.about'), screen: 'TentangAplikasi', color: Colors.textSecondary },
  ];

  // Info card items with resolved values
  const infoItems = [
    { icon: 'business', label: t('sv.guard_post'), value: posJaga || '-' },
    { icon: 'location', label: t('dash.location'), value: lokasiNama || '-' },
    { icon: 'time', label: t('general.shift'), value: shift || '-' },
    { icon: 'call', label: t('profile.phone'), value: noHp || '-' },
  ];

  return (
    <ScrollView style={[styles.container, { backgroundColor: theme.bg }]} contentContainerStyle={styles.content}>
      {/* Profile Header */}
      <View style={[styles.profileHeader, { paddingTop: insets.top + 12 }, { backgroundColor: isDark ? theme.bgCard : Colors.primaryDark }]}>
        <Image
          source={{ uri: foto }}
          style={[styles.avatar, { borderColor: isDark ? theme.primary : 'rgba(255,255,255,0.5)' }]}
        />
        <Text style={[styles.name, { color: isDark ? theme.text : '#fff' }]}>{nama}</Text>
        <Text style={[styles.nrp, { color: isDark ? theme.textMuted : 'rgba(255,255,255,0.7)' }]}>NRP: {nrp}</Text>
        <Badge text={role.charAt(0).toUpperCase() + role.slice(1)} variant="info" size="medium" />
      </View>

      {/* Stats */}
      <View style={[styles.statsRow, { backgroundColor: theme.bgCard, borderColor: isDark ? theme.border : 'transparent', borderWidth: isDark ? 1 : 0 }, !isDark && Shadows.sm]}>
        <View style={styles.statItem}>
          <Text style={[styles.statVal, { color: theme.primary }]}>{absensi.length}</Text>
          <Text style={[styles.statLbl, { color: theme.textMuted }]}>{t('dash.menu.absensi')}</Text>
        </View>
        <View style={[styles.statDivider, { backgroundColor: theme.border }]} />
        <View style={styles.statItem}>
          <Text style={[styles.statVal, { color: theme.primary }]}>{laporanH.length + laporanK.length}</Text>
          <Text style={[styles.statLbl, { color: theme.textMuted }]}>{t('analytics.reports')}</Text>
        </View>
        <View style={[styles.statDivider, { backgroundColor: theme.border }]} />
        <View style={styles.statItem}>
          <Text style={[styles.statVal, { color: theme.success }]}>{skor}</Text>
          <Text style={[styles.statLbl, { color: theme.textMuted }]}>{t('general.score')}</Text>
        </View>
      </View>

      {/* Info Card */}
      <Card style={styles.infoCard}>
        {infoItems.map((info, idx) => (
          <View key={idx} style={[styles.infoRow, idx < infoItems.length - 1 && { borderBottomWidth: 1, borderBottomColor: theme.border }]}>
            <Ionicons name={info.icon as any} size={18} color={theme.primary} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.infoLabel, { color: theme.textMuted }]}>{info.label}</Text>
              <Text style={[styles.infoValue, { color: info.value === '-' ? theme.textMuted : theme.text }]}>{info.value}</Text>
            </View>
            {info.value === '-' && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Ionicons name="alert-circle-outline" size={14} color={Colors.warning} />
                <Text style={{ fontSize: 11, color: Colors.warning }}>Belum diisi</Text>
              </View>
            )}
          </View>
        ))}
      </Card>

      {/* Settings */}
      <Card style={{ marginTop: 12, marginHorizontal: Spacing.base }}>
        {/* Dark Mode Toggle */}
        <View style={[styles.settingRow, { borderBottomWidth: 1, borderBottomColor: theme.border }]}>
          <View style={[styles.settingIcon, { backgroundColor: isDark ? `${theme.primary}25` : `${Colors.bgDark}15` }]}>
            <Ionicons name={isDark ? 'moon' : 'moon-outline'} size={18} color={isDark ? theme.primary : Colors.bgDark} />
          </View>
          <Text style={[styles.settingLabel, { color: theme.text }]}>{t('settings.dark_mode')}</Text>
          <Switch
            value={isDark}
            onValueChange={toggleTheme}
            trackColor={{ false: '#ddd', true: theme.primary }}
            thumbColor="#fff"
          />
        </View>

        {/* Language Toggle */}
        <View style={[styles.settingRow, { borderBottomWidth: 1, borderBottomColor: theme.border }]}>
          <View style={[styles.settingIcon, { backgroundColor: `${Colors.purple}15` }]}>
            <Ionicons name="language-outline" size={18} color={Colors.purple} />
          </View>
          <Text style={[styles.settingLabel, { color: theme.text }]}>{t('settings.language')}</Text>
          <TouchableOpacity
            style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: theme.bgInput, borderRadius: 16, padding: 2 }}
            onPress={() => setLang(lang === 'id' ? 'en' : 'id')}
          >
            <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 14, backgroundColor: lang === 'id' ? theme.primary : 'transparent' }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: lang === 'id' ? '#fff' : theme.textMuted }}>ID</Text>
            </View>
            <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 14, backgroundColor: lang === 'en' ? theme.primary : 'transparent' }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: lang === 'en' ? '#fff' : theme.textMuted }}>EN</Text>
            </View>
          </TouchableOpacity>
        </View>

        {settings.map((s, idx) => (
          <TouchableOpacity
            key={idx}
            style={[styles.settingRow, idx < settings.length - 1 && { borderBottomWidth: 1, borderBottomColor: theme.border }]}
            onPress={() => s.screen && navigation.navigate(s.screen)}
          >
            <View style={[styles.settingIcon, { backgroundColor: `${s.color}15` }]}>
              <Ionicons name={s.icon as any} size={18} color={s.color} />
            </View>
            <Text style={[styles.settingLabel, { color: theme.text }]}>{s.label}</Text>
            <Ionicons name="chevron-forward" size={18} color={theme.textMuted} />
          </TouchableOpacity>
        ))}
      </Card>

      <View style={{ paddingHorizontal: Spacing.base }}>
        <Button
          title={t('settings.logout').toUpperCase()}
          variant="danger"
          size="large"
          fullWidth
          icon="log-out-outline"
          onPress={handleLogout}
          style={{ marginTop: 16 }}
        />
      </View>

      {/* Debug info - only in dev, remove in production */}
      {__DEV__ && (
        <TouchableOpacity
          style={{ marginHorizontal: Spacing.base, marginTop: 12, padding: 10, backgroundColor: theme.bgCard, borderRadius: 8 }}
          onPress={() => Alert.alert('User Data (Debug)', JSON.stringify(merged, null, 2).substring(0, 1000))}
        >
          <Text style={{ fontSize: 10, color: theme.textMuted, textAlign: 'center' }}>
            Tap untuk lihat raw user data (debug)
          </Text>
        </TouchableOpacity>
      )}

      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingBottom: 20 },
  profileHeader: {
    alignItems: 'center',
    paddingBottom: 24,
    paddingHorizontal: Spacing.base,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    marginBottom: 16,
  },
  avatar: { width: 90, height: 90, borderRadius: 45, borderWidth: 3, marginBottom: 12 },
  name: { fontSize: 22, fontWeight: '700' },
  nrp: { fontSize: 13, marginBottom: 8 },
  statsRow: {
    flexDirection: 'row',
    borderRadius: Radius.lg,
    padding: 16,
    marginBottom: 16,
    marginHorizontal: Spacing.base,
  },
  statItem: { flex: 1, alignItems: 'center' },
  statVal: { fontSize: 22, fontWeight: '800' },
  statLbl: { ...Typography.caption },
  statDivider: { width: 1 },
  infoCard: { marginHorizontal: Spacing.base },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  infoLabel: { ...Typography.caption },
  infoValue: { ...Typography.bodyBold },
  settingRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 },
  settingIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  settingLabel: { ...Typography.body, flex: 1 },
});
============================================================