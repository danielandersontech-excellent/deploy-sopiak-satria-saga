/**
 * NOTIFIKASI - Full Filtering (Role + User ID + Lokasi)
 * 
 * DATABASE ALIGNMENT (tabel: notifikasi):
 *   id, tipe, judul, pesan, target_role (array),
 *   target_user_id, target_lokasi_id, dibaca, created_at
 * 
 * Filters by:
 *   1. target_role includes user's role OR is empty/all
 *   2. target_user_id matches user's ID OR is null (broadcast)
 *   3. target_lokasi_id matches user's lokasi_id OR is null (global)
 */
import React, { useMemo, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Radius } from '../../constants';
import { Card } from '../../components';
import { useDataStore } from '../../stores/dataStore';
import { useAuthStore } from '../../stores/authStore';
import { useI18n } from '../../lib/i18n';
import { useTheme } from '../../lib/theme';

/** Helper: safely read a field */
function getField(obj: any, ...keys: string[]): any {
  if (!obj) return undefined;
  for (const key of keys) {
    if (obj[key] !== undefined && obj[key] !== null) return obj[key];
  }
  return undefined;
}

const ICON_MAP: Record<string, { name: string; color: string; bg: string }> = {
  danger: { name: 'warning', color: Colors.danger, bg: Colors.dangerBg },
  warning: { name: 'alert-circle', color: Colors.warning, bg: Colors.warningBg },
  success: { name: 'checkmark-circle', color: Colors.success, bg: Colors.successBg },
  info: { name: 'information-circle', color: Colors.primary, bg: Colors.primaryBg },
};

const FILTER_TABS = ['Semua', 'Belum Dibaca', 'Penting'] as const;

export default function NotifikasiScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  const { theme, isDark } = useTheme();
  const user = useAuthStore((s) => s.user);

  // Extract user fields with fallback
  const userId = getField(user, 'id', '_id') || '';
  const role = getField(user, 'role') || 'anggota';
  const userLokasiId = getField(user, 'lokasi_id', 'lokasiId') || null;

  const notifikasi = useDataStore((s) => s.notifikasi);
  const markRead = useDataStore((s) => s.markRead);
  const markAllRead = useDataStore((s) => s.markAllRead);
  const clearNotifikasi = useDataStore((s) => s.clearNotifikasi);
  const loadAllData = useDataStore((s) => s.loadAllData);

  const [activeTab, setActiveTab] = useState<typeof FILTER_TABS[number]>('Semua');
  const [refreshing, setRefreshing] = useState(false);

  // Filter notifications: role match + user ID match + lokasi match
  const roleNotifs = useMemo(() => {
    return notifikasi.filter((n: any) => {
      // Rule 1: Check target_user_id / targetUserId
      const targetUserId = getField(n, 'target_user_id', 'targetUserId');
      if (targetUserId) {
        return targetUserId === userId;
      }

      // Rule 2: Check target_lokasi_id / targetLokasiId
      const targetLokasiId = getField(n, 'target_lokasi_id', 'targetLokasiId');
      if (targetLokasiId && userLokasiId && targetLokasiId !== userLokasiId) {
        return false;
      }

      // Rule 3: No specific user target - filter by role
      const targetRole = getField(n, 'target_role', 'targetRole');
      if (!targetRole || (Array.isArray(targetRole) && targetRole.length === 0)) return true;
      if (Array.isArray(targetRole)) {
        if (targetRole.includes('all')) return true;
        return targetRole.includes(role);
      }
      return true;
    });
  }, [notifikasi, role, userId, userLokasiId]);

  // Apply tab filter
  const filteredNotifs = useMemo(() => {
    switch (activeTab) {
      case 'Belum Dibaca':
        return roleNotifs.filter((n: any) => !getField(n, 'dibaca'));
      case 'Penting':
        return roleNotifs.filter((n: any) => {
          const tipe = getField(n, 'tipe');
          return tipe === 'danger' || tipe === 'warning';
        });
      default:
        return roleNotifs;
    }
  }, [roleNotifs, activeTab]);

  const unread = useMemo(() => roleNotifs.filter((n: any) => !getField(n, 'dibaca')).length, [roleNotifs]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await loadAllData(); } catch (e) {}
    setRefreshing(false);
  }, [loadAllData]);

  const handleClearAll = () => {
    Alert.alert('Hapus Semua?', 'Semua notifikasi akan dihapus.', [
      { text: 'Batal', style: 'cancel' },
      { text: 'Hapus', style: 'destructive', onPress: () => clearNotifikasi?.() },
    ]);
  };

  const getRoleLabel = () => {
    switch (role) {
      case 'komandan': return 'Komandan';
      case 'supervisor': return 'Supervisor';
      case 'admin': return 'Admin';
      case 'klien': return 'Klien';
      default: return 'Anggota';
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }, { backgroundColor: theme.bgCard, borderBottomColor: theme.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={[styles.headerTitle, { color: theme.text }]}>Notifikasi</Text>
          <Text style={[styles.headerRole, { color: theme.textMuted }]}>{getRoleLabel()} â€¢ {unread} belum dibaca</Text>
        </View>
        {unread > 0 ? (
          <TouchableOpacity onPress={markAllRead}>
            <Text style={[styles.readAll, { color: theme.primary }]}>Baca Semua</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ width: 70 }} />
        )}
      </View>

      {/* Filter Tabs */}
      <View style={[styles.tabsRow, { backgroundColor: theme.bgCard, borderBottomColor: theme.border }]}>
        {FILTER_TABS.map((tabLabel) => {
          const count = tabLabel === 'Belum Dibaca' ? unread
            : tabLabel === 'Penting' ? roleNotifs.filter((n: any) => { const tp = getField(n, 'tipe'); return tp === 'danger' || tp === 'warning'; }).length
            : roleNotifs.length;
          return (
            <TouchableOpacity
              key={tabLabel}
              style={[styles.tab, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : Colors.bgGray }, activeTab === tabLabel && { backgroundColor: theme.primary }]}
              onPress={() => setActiveTab(tabLabel)}
            >
              <Text style={[styles.tabText, { color: theme.textSecondary }, activeTab === tabLabel && styles.tabTextActive]}>{tabLabel}</Text>
              {count > 0 && (
                <View style={[styles.tabBadge, activeTab === tabLabel && styles.tabBadgeActive]}>
                  <Text style={[styles.tabBadgeText, { color: theme.textSecondary }, activeTab === tabLabel && { color: '#fff' }]}>{count}</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 16 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[Colors.primary]} />}
      >
        {filteredNotifs.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Ionicons name="notifications-off-outline" size={48} color={theme.textMuted} />
            <Text style={[styles.emptyTitle, { color: theme.text }]}>
              {activeTab === 'Belum Dibaca' ? 'Semua sudah dibaca' :
               activeTab === 'Penting' ? 'Tidak ada notifikasi penting' :
               'Belum ada notifikasi'}
            </Text>
            <Text style={[styles.emptyDesc, { color: theme.textMuted }]}>Tarik ke bawah untuk refresh</Text>
          </View>
        ) : (
          filteredNotifs.map((n: any) => {
            const tipe = getField(n, 'tipe') || 'info';
            const ic = ICON_MAP[tipe] || ICON_MAP.info;
            const targetUserId = getField(n, 'target_user_id', 'targetUserId');
            const isPersonal = !!targetUserId;
            const dibaca = getField(n, 'dibaca');
            const nId = getField(n, 'id', '_id');
            const judul = getField(n, 'judul') || '';
            const pesan = getField(n, 'pesan') || '';
            const waktu = getField(n, 'waktu', 'created_at') || '';
            const targetRole = getField(n, 'target_role', 'targetRole');

            return (
              <TouchableOpacity key={nId} onPress={() => markRead(nId)} activeOpacity={0.7}>
                <Card style={[styles.notifCard, !dibaca && { borderLeftWidth: 3, borderLeftColor: theme.primary, backgroundColor: isDark ? `${theme.primary}10` : Colors.primaryBg }]}>
                  <View style={styles.notifRow}>
                    <View style={[styles.iconCircle, { backgroundColor: isDark ? `${ic.color}20` : ic.bg }]}>
                      <Ionicons name={ic.name as any} size={20} color={ic.color} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={styles.notifHeader}>
                        <Text style={[styles.notifTitle, { color: theme.text }]} numberOfLines={1}>{judul}</Text>
                        {tipe === 'danger' && (
                          <View style={styles.urgentBadge}>
                            <Text style={styles.urgentText}>Urgent</Text>
                          </View>
                        )}
                      </View>
                      <Text style={[styles.notifMsg, { color: theme.textSecondary }]} numberOfLines={2}>{pesan}</Text>
                      <View style={styles.notifMeta}>
                        <Text style={[styles.notifTime, { color: theme.textMuted }]}>{waktu}</Text>
                        {isPersonal && (
                          <View style={[styles.personalBadge, { backgroundColor: isDark ? `${theme.primary}20` : Colors.primaryBg }]}>
                            <Ionicons name="person" size={9} color={theme.primary} />
                            <Text style={[styles.personalText, { color: theme.primary }]}>Untuk Anda</Text>
                          </View>
                        )}
                        {!isPersonal && Array.isArray(targetRole) && targetRole.length > 0 && !targetRole.includes('all') && (
                          <Text style={[styles.notifTarget, { color: theme.primary }]}>
                            â†’ {targetRole.join(', ')}
                          </Text>
                        )}
                      </View>
                    </View>
                    {!dibaca && <View style={[styles.unreadDot, { backgroundColor: theme.primary }]} />}
                  </View>
                </Card>
              </TouchableOpacity>
            );
          })
        )}
        <View style={{ height: 32 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgLight },
  header: {
    flexDirection: 'row', alignItems: 'center', paddingBottom: 12,
    paddingHorizontal: Spacing.base, backgroundColor: Colors.bgWhite,
    borderBottomWidth: 1, borderBottomColor: Colors.borderLight,
  },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: { ...Typography.h3, color: Colors.textPrimary },
  headerRole: { ...Typography.caption, color: Colors.textMuted, marginTop: 1 },
  readAll: { ...Typography.smallBold, color: Colors.primary },
  tabsRow: {
    flexDirection: 'row', paddingHorizontal: Spacing.base, paddingVertical: 10, gap: 8,
    backgroundColor: Colors.bgWhite, borderBottomWidth: 1, borderBottomColor: Colors.borderLight,
  },
  tab: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
    paddingVertical: 8, borderRadius: Radius.md, backgroundColor: Colors.bgGray,
  },
  tabText: { ...Typography.smallBold, color: Colors.textSecondary },
  tabTextActive: { color: '#fff' },
  tabBadge: {
    backgroundColor: Colors.borderLight, borderRadius: 10, minWidth: 20, height: 20,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5,
  },
  tabBadgeActive: { backgroundColor: 'rgba(255,255,255,0.3)' },
  tabBadgeText: { fontSize: 10, fontWeight: '700', color: Colors.textSecondary },
  content: { padding: Spacing.base },
  emptyWrap: { alignItems: 'center', paddingVertical: 60, gap: 8 },
  emptyTitle: { ...Typography.h3, color: Colors.textPrimary },
  emptyDesc: { ...Typography.caption, color: Colors.textMuted },
  notifCard: { marginBottom: 8, padding: 14 },
  notifRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  iconCircle: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  notifHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  notifTitle: { ...Typography.bodyBold, color: Colors.textPrimary, flex: 1 },
  urgentBadge: { backgroundColor: Colors.danger, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  urgentText: { fontSize: 9, fontWeight: '800', color: '#fff' },
  notifMsg: { ...Typography.small, color: Colors.textSecondary, marginTop: 2 },
  notifMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  notifTime: { ...Typography.caption, color: Colors.textMuted },
  notifTarget: { ...Typography.caption, color: Colors.primary },
  personalBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: Colors.primaryBg, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4,
  },
  personalText: { fontSize: 9, fontWeight: '700', color: Colors.primary },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.primary, marginTop: 6 },
});
