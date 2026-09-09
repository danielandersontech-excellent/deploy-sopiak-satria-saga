/**
 * MANAJEMEN PENGGUNA - v2 (Bug-Fix Pass)
 *
 * FIXES (v2):
 *  ✅ Back button added in header (was missing — supervisor stuck on this screen).
 *  ✅ Dark mode support (was importing useTheme but using Colors directly).
 *  ✅ i18n support (was importing useI18n but using hardcoded Indonesian strings).
 *  ✅ Role filter chips (All / Anggota / Komandan) — was no way to filter by role.
 *  ✅ Empty state when no users match filter.
 *  ✅ Submitting state on delete to prevent double-tap.
 *  ✅ Case-insensitive NRP search.
 *  ✅ Pull-to-refresh added.
 */
import React, { useState, useMemo, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, TextInput, Alert,
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Radius } from '../../constants';
import { Card, Badge, Button } from '../../components';
import { useDataStore } from '../../stores/dataStore';
import { useI18n } from '../../lib/i18n';
import { useTheme } from '../../lib/theme';

type RoleFilter = 'all' | 'anggota' | 'komandan';

export default function ManajemenPenggunaScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const { t, lang } = useI18n();
  const { theme, isDark } = useTheme();
  const team = useDataStore((s) => s.team);
  const removeTeamMember = useDataStore((s) => s.removeTeamMember);
  const loadAllData = useDataStore((s) => s.loadAllData);

  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
  const [submitting, setSubmitting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return team.filter((m) => {
      if (roleFilter !== 'all' && m.role !== roleFilter) return false;
      if (!q) return true;
      return (
        m.nama.toLowerCase().includes(q) ||
        m.nrp.toLowerCase().includes(q)
      );
    });
  }, [team, search, roleFilter]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await loadAllData?.(); } catch {}
    finally { setRefreshing(false); }
  }, [loadAllData]);

  const handleDelete = (id: string, nama: string) => {
    if (submitting) return;
    Alert.alert(
      lang === 'en' ? 'Delete User?' : 'Hapus Anggota?',
      lang === 'en' ? `Are you sure you want to delete ${nama}?` : `Yakin hapus ${nama}?`,
      [
        { text: lang === 'en' ? 'Cancel' : 'Batal', style: 'cancel' },
        {
          text: lang === 'en' ? 'Delete' : 'Hapus',
          style: 'destructive',
          onPress: async () => {
            setSubmitting(true);
            try {
              // [Misi V3] tunggu hasil server (403/409 admin terakhir, dsb.) — bukan lagi optimistik buta.
              const res = await removeTeamMember(id);
              if (res.status === 'error') throw new Error(res.error);
              Alert.alert(
                '✅',
                lang === 'en' ? 'User deleted' : 'Anggota berhasil dihapus'
              );
            } catch (e: any) {
              Alert.alert('Error', e?.message || (lang === 'en' ? 'Failed to delete' : 'Gagal menghapus'));
            } finally {
              setSubmitting(false);
            }
          },
        },
      ]
    );
  };

  const anggotaCount = team.filter((m) => m.role === 'anggota').length;
  const komandanCount = team.filter((m) => m.role === 'komandan').length;

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }, { backgroundColor: theme.bgCard, borderBottomColor: theme.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]}>
          {t('sv.users')}
        </Text>
        <TouchableOpacity
          style={[styles.addBtn, { backgroundColor: Colors.primary }]}
          onPress={() => navigation.navigate('TambahEditUser')}
        >
          <Ionicons name="person-add" size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      <View style={[styles.searchRow, { backgroundColor: isDark ? theme.bgInput : Colors.bgGray }]}>
        <Ionicons name="search" size={18} color={theme.textMuted} />
        <TextInput
          style={[styles.searchInput, { color: theme.text }]}
          placeholder={lang === 'en' ? 'Search name or NRP...' : 'Cari nama atau NRP...'}
          placeholderTextColor={theme.textMuted}
          value={search}
          onChangeText={setSearch}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={18} color={theme.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      {/* Role Filter Chips */}
      <View style={styles.filterRow}>
        <TouchableOpacity
          style={[
            styles.chip,
            { borderColor: theme.border, backgroundColor: isDark ? theme.bgInput : Colors.bgGray },
            roleFilter === 'all' && { backgroundColor: Colors.primary, borderColor: Colors.primary },
          ]}
          onPress={() => setRoleFilter('all')}
        >
          <Text
            style={[
              styles.chipText,
              { color: roleFilter === 'all' ? '#fff' : theme.textSecondary },
            ]}
          >
            {lang === 'en' ? 'All' : 'Semua'} ({team.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.chip,
            { borderColor: theme.border, backgroundColor: isDark ? theme.bgInput : Colors.bgGray },
            roleFilter === 'anggota' && { backgroundColor: Colors.primary, borderColor: Colors.primary },
          ]}
          onPress={() => setRoleFilter('anggota')}
        >
          <Text
            style={[
              styles.chipText,
              { color: roleFilter === 'anggota' ? '#fff' : theme.textSecondary },
            ]}
          >
            Anggota ({anggotaCount})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.chip,
            { borderColor: theme.border, backgroundColor: isDark ? theme.bgInput : Colors.bgGray },
            roleFilter === 'komandan' && { backgroundColor: Colors.primary, borderColor: Colors.primary },
          ]}
          onPress={() => setRoleFilter('komandan')}
        >
          <Text
            style={[
              styles.chipText,
              { color: roleFilter === 'komandan' ? '#fff' : theme.textSecondary },
            ]}
          >
            Komandan ({komandanCount})
          </Text>
        </TouchableOpacity>
      </View>

      <Text style={[styles.countText, { color: theme.textMuted }]}>
        {filtered.length} {lang === 'en' ? 'users' : 'pengguna'}
      </Text>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 16 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
      >
        {filtered.map((m) => (
          <Card key={m.id} style={styles.userCard}>
            <View style={styles.userRow}>
              <Image source={{ uri: m.foto }} style={styles.avatar} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.userName, { color: theme.text }]}>{m.nama}</Text>
                <Text style={[styles.userNrp, { color: Colors.primary }]}>
                  NRP: {m.nrp} • {m.role}
                </Text>
                <Text style={[styles.userPos, { color: theme.textMuted }]}>
                  {m.pos || '-'} • {m.shift || '-'}
                </Text>
              </View>
              <Badge
                text={m.status === 'off_duty' ? 'Off' : 'Active'}
                variant={m.status !== 'off_duty' ? 'success' : 'default'}
              />
            </View>
            <View style={styles.userActions}>
              <Button
                title={lang === 'en' ? 'Edit' : 'Edit'}
                variant="outline"
                size="small"
                icon="create-outline"
                onPress={() => navigation.navigate('TambahEditUser', { userId: m.id })}
                style={{ flex: 1 }}
                disabled={submitting}
              />
              <Button
                title={lang === 'en' ? 'Delete' : 'Hapus'}
                variant="outline"
                size="small"
                icon="trash-outline"
                onPress={() => handleDelete(m.id, m.nama)}
                style={{ flex: 1 }}
                textStyle={{ color: Colors.danger }}
                disabled={submitting}
              />
            </View>
          </Card>
        ))}

        {filtered.length === 0 && (
          <View style={styles.empty}>
            <Ionicons name="people-outline" size={48} color={theme.textMuted} />
            <Text style={[styles.emptyText, { color: theme.textMuted }]}>
              {search || roleFilter !== 'all'
                ? (lang === 'en' ? 'No users match your filter' : 'Tidak ada pengguna sesuai filter')
                : (lang === 'en' ? 'No users yet' : 'Belum ada pengguna')}
            </Text>
            {!search && roleFilter === 'all' && (
              <Button
                title={lang === 'en' ? 'Add User' : 'Tambah Pengguna'}
                variant="primary"
                size="small"
                icon="person-add"
                onPress={() => navigation.navigate('TambahEditUser')}
              />
            )}
          </View>
        )}

        <View style={{ height: 32 }} />
      </ScrollView>
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
  headerTitle: { ...Typography.h3, flex: 1, marginLeft: 4 },
  addBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
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
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: Spacing.base,
    marginBottom: 8,
  },
  chip: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: Radius.full,
    borderWidth: 1,
    alignItems: 'center',
  },
  chipText: { ...Typography.caption, fontWeight: '600' },
  countText: { ...Typography.caption, paddingHorizontal: Spacing.base, marginBottom: 8 },
  content: { paddingHorizontal: Spacing.base },
  userCard: { marginBottom: 10 },
  userRow: { flexDirection: 'row', gap: 12, alignItems: 'center', marginBottom: 10 },
  avatar: { width: 46, height: 46, borderRadius: 23 },
  userName: { ...Typography.bodyBold },
  userNrp: { ...Typography.caption, fontWeight: '600' },
  userPos: { ...Typography.caption },
  userActions: { flexDirection: 'row', gap: 8 },
  empty: {
    alignItems: 'center',
    paddingVertical: 40,
    gap: 12,
  },
  emptyText: { ...Typography.body, textAlign: 'center' },
});
