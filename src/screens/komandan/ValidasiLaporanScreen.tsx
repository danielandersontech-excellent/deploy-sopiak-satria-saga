/**
 * VALIDASI LAPORAN - Komandan - v4 (Bug-Fix Pass)
 *
 * DATABASE ALIGNMENT:
 *   laporan_harian: user_id, tanggal, shift, pos_jaga, kondisi, aktivitas, temuan, status, lokasi_id, created_at
 *   laporan_kejadian: user_id, jenis, prioritas, waktu_kejadian, lokasi_text, kronologi, status, lokasi_id, created_at
 *
 * CRITICAL FIXES (v4):
 *  🚨 Removed DUPLICATE API call in handleApprove/submitRevision.
 *     The store's updateLaporanHarianStatus / updateLaporanKejadianStatus
 *     already calls laporanApi.harianValidate / kejadianValidate internally.
 *     The screen was calling it AGAIN, causing duplicate audit logs &
 *     duplicate "Laporan Disetujui" notifications to the anggota.
 *     New flow: call API directly → on success update store via setState
 *     (avoids duplicate call AND keeps the optimistic UI update).
 *
 *  🚨 Fixed kronologi/aktivitas priority for Kejadian items:
 *     - Card preview: Kejadian shows kronologi (was: aktivitas first)
 *     - Detail modal: same fix
 *
 *  ✅ Card preview now also shows pos_jaga / lokasi correctly per type
 *  ✅ Server failure now blocks optimistic update (was silent before)
 *  ✅ Defensive fallbacks for all displayed values
 *  ✅ Removed unused 'Approved' dead branch in filterStatus
 *  ✅ "Refresh Data" button localized
 *
 * PRIOR FIXES:
 *  - getField() for dual snake_case/camelCase field access
 *  - lokasi_text (not lokasi) - DB column for laporan_kejadian
 *  - waktu_kejadian - DB column
 *  - catatan_komandan - DB column
 *  - pos_jaga - DB column
 *  - lokasi_id filtering for komandan scope
 *  - API update payloads use DB column names
 *  - Paginated response extraction via extractArray()
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, TextInput, Modal,
  RefreshControl, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Radius } from '../../constants';
import { Card, Badge, Button } from '../../components';
import { useDataStore } from '../../stores/dataStore';
import { useAuthStore } from '../../stores/authStore';
import { laporanApi } from '../../lib/apiClient';
import { useI18n } from '../../lib/i18n';
import { useTheme } from '../../lib/theme';

/**
 * Safely get a field value, checking multiple key variants (snake_case first).
 */
function getField(obj: any, ...keys: string[]): any {
  if (!obj) return undefined;
  for (const key of keys) {
    if (obj[key] !== undefined && obj[key] !== null) return obj[key];
  }
  return undefined;
}

/**
 * Extract array from API response (handles paginated { data: [...], pagination: {...} }).
 */
function extractArray(result: any): any[] {
  if (Array.isArray(result)) return result;
  if (result && Array.isArray(result.data)) return result.data;
  if (result && Array.isArray(result.rows)) return result.rows;
  if (result && Array.isArray(result.items)) return result.items;
  return [];
}

const TABS_ID = ['Pending', 'Disetujui', 'Revisi'];
const TABS_EN = ['Pending', 'Approved', 'Revision'];

// [Misi V3 / C2] Umur laporan (hari) — backend kini mengirim umur_hari; fallback hitung dari created_at.
const LAMA_HARI = 30;
function umurHari(l: any): number {
  const u = Number(l?.umur_hari);
  if (Number.isFinite(u) && u >= 0) return u;
  const c = l?.created_at || l?.createdAt;
  const t = c ? new Date(c).getTime() : NaN;
  return isNaN(t) ? 0 : Math.max(0, Math.floor((Date.now() - t) / 86400000));
}

export default function ValidasiLaporanScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const { t, lang } = useI18n();
  const { theme, isDark } = useTheme();
  const user = useAuthStore((s) => s.user);

  const storeLaporanH = useDataStore((s) => s.laporanHarian);
  const storeLaporanK = useDataStore((s) => s.laporanKejadian);
  const loadAllData = useDataStore((s) => s.loadAllData);

  const [tab, setTab] = useState<string>('Pending');
  const [onlyLama, setOnlyLama] = useState(false); // [Misi V3 / C2] hanya pending > 30 hari
  const [showDetail, setShowDetail] = useState<any>(null);
  const [showRevisionModal, setShowRevisionModal] = useState(false);
  const [revisionTarget, setRevisionTarget] = useState<any>(null);
  const [catatan, setCatatan] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [serverLaporanH, setServerLaporanH] = useState<any[]>([]);
  const [serverLaporanK, setServerLaporanK] = useState<any[]>([]);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const TABS = lang === 'en' ? TABS_EN : TABS_ID;

  // Komandan's lokasi_id for scope filtering
  const myLokasiId = getField(user, 'lokasi_id', 'lokasiId') || null;

  // ===== Fetch from server =====
  const fetchLaporan = useCallback(async () => {
    // [Audit 2D] Tanpa limit backend hanya memberi 20 laporan terbaru → laporan
    // pending yang lebih lama tidak pernah muncul di antrian validasi. Ambil
    // 100 (batas maksimum server).
    let lhData: any[] = [];
    try {
      const lhResult = await laporanApi.harianList('limit=100');
      lhData = extractArray(lhResult);
      console.log('[Validasi] Fetched LH:', lhData.length, 'items');
    } catch (e) {
      console.log('[Validasi] Fetch LH error:', e);
    }

    let lkData: any[] = [];
    try {
      const lkResult = await laporanApi.kejadianList('limit=100');
      lkData = extractArray(lkResult);
      console.log('[Validasi] Fetched LK:', lkData.length, 'items');
    } catch (e) {
      console.log('[Validasi] Fetch LK error:', e);
    }

    setServerLaporanH(lhData);
    setServerLaporanK(lkData);
    setLastRefresh(new Date());
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await fetchLaporan();
      setLoading(false);
    })();
  }, [fetchLaporan]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      fetchLaporan();
      loadAllData?.();
    });
    return unsubscribe;
  }, [navigation, fetchLaporan, loadAllData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetchLaporan();
      await loadAllData?.();
    } catch (e) {
      console.log('[Validasi] Refresh error:', e);
    } finally {
      setRefreshing(false);
    }
  }, [fetchLaporan, loadAllData]);

  // ===== Merge server + store data (deduplicate by id) =====
  const allLaporanH = useMemo(() => {
    const merged = new Map<string, any>();

    storeLaporanH.forEach((l) => {
      merged.set(l.id, { ...l, source: 'harian' as const, tipe: 'Harian' as const });
    });

    serverLaporanH.forEach((l) => {
      const id = String(getField(l, 'id', '_id') || `srv-h-${Math.random()}`);
      merged.set(id, {
        id,
        nama: getField(l, 'nama', 'user_nama', 'username') || 'Anggota',
        nrp: getField(l, 'nrp', 'user_nrp') || '-',
        user_id: getField(l, 'user_id', 'userId') || '',
        kondisi: getField(l, 'kondisi', 'condition') || '-',
        aktivitas: getField(l, 'aktivitas', 'activity', 'catatan', 'description') || '-',
        temuan: getField(l, 'temuan') || '',
        tanggal: getField(l, 'tanggal', 'date') || (getField(l, 'created_at') || '').split('T')[0] || '-',
        waktuSubmit:
          getField(l, 'waktu_submit', 'waktuSubmit', 'time') ||
          (getField(l, 'created_at') || '').split('T')[1]?.substring(0, 5) ||
          '-',
        shift: getField(l, 'shift') || '-',
        pos_jaga: getField(l, 'pos_jaga', 'posJaga', 'pos_nama', 'pos') || '-',
        status: getField(l, 'status') || 'pending',
        catatan_komandan: getField(l, 'catatan_komandan', 'catatanKomandan', 'commander_note') || '',
        foto_url: getField(l, 'foto_url', 'fotoUrl') || null,
        lokasi_id: getField(l, 'lokasi_id', 'lokasiId') || '',
        umur_hari: umurHari(l),
        source: 'harian' as const,
        tipe: 'Harian' as const,
      });
    });

    // Filter by komandan's lokasi_id (include items with no lokasi_id for legacy data)
    let results = Array.from(merged.values());
    if (myLokasiId) {
      results = results.filter((l) => {
        const lLokId = String(getField(l, 'lokasi_id', 'lokasiId') || '');
        return lLokId === String(myLokasiId) || !lLokId;
      });
    }
    return results;
  }, [storeLaporanH, serverLaporanH, myLokasiId]);

  const allLaporanK = useMemo(() => {
    const merged = new Map<string, any>();

    storeLaporanK.forEach((l) => {
      merged.set(l.id, {
        ...l,
        source: 'kejadian' as const,
        tipe: 'Kejadian' as const,
        // For convenience - kondisi shows jenis for Kejadian items
        kondisi: getField(l, 'jenis'),
      });
    });

    serverLaporanK.forEach((l) => {
      const id = String(getField(l, 'id', '_id') || `srv-k-${Math.random()}`);
      merged.set(id, {
        id,
        nama: getField(l, 'nama', 'user_nama', 'username') || 'Anggota',
        nrp: getField(l, 'nrp', 'user_nrp') || '-',
        user_id: getField(l, 'user_id', 'userId') || '',
        jenis: getField(l, 'jenis', 'type', 'incident_type') || '-',
        kondisi: getField(l, 'jenis', 'type', 'incident_type') || '-',
        kronologi: getField(l, 'kronologi', 'chronology', 'description') || '-',
        prioritas: getField(l, 'prioritas', 'priority') || 'normal',
        tanggal: getField(l, 'tanggal', 'date') || (getField(l, 'created_at') || '').split('T')[0] || '-',
        waktuSubmit:
          getField(l, 'waktu_submit', 'waktuSubmit', 'time') ||
          (getField(l, 'created_at') || '').split('T')[1]?.substring(0, 5) ||
          '-',
        waktu_kejadian: getField(l, 'waktu_kejadian', 'waktuKejadian') || '',
        lokasi_text: getField(l, 'lokasi_text', 'lokasi', 'location') || '-',
        status: getField(l, 'status') || 'pending',
        catatan_komandan: getField(l, 'catatan_komandan', 'catatanKomandan', 'commander_note') || '',
        foto_url: getField(l, 'foto_url', 'fotoUrl') || null,
        lokasi_id: getField(l, 'lokasi_id', 'lokasiId') || '',
        umur_hari: umurHari(l),
        source: 'kejadian' as const,
        tipe: 'Kejadian' as const,
      });
    });

    let results = Array.from(merged.values());
    if (myLokasiId) {
      results = results.filter((l) => {
        const lLokId = String(getField(l, 'lokasi_id', 'lokasiId') || '');
        return lLokId === String(myLokasiId) || !lLokId;
      });
    }
    return results;
  }, [storeLaporanK, serverLaporanK, myLokasiId]);

  // ===== Filter by tab =====
  const filterStatus = tab === 'Pending' ? 'pending' : tab === 'Disetujui' ? 'approved' : 'revision';

  const lamaFilter = (l: any) => !(onlyLama && tab === 'Pending') || umurHari(l) >= LAMA_HARI;
  const pendingLamaCount = useMemo(
    () => [...allLaporanH, ...allLaporanK].filter((l) => getField(l, 'status') === 'pending' && umurHari(l) >= LAMA_HARI).length,
    [allLaporanH, allLaporanK]
  );
  const filteredLaporan = useMemo(() => {
    return [
      ...allLaporanH.filter((l) => getField(l, 'status') === filterStatus).filter(lamaFilter),
      ...allLaporanK.filter((l) => getField(l, 'status') === filterStatus).filter(lamaFilter),
    ].sort((a, b) => {
      const dateA = (getField(a, 'tanggal') || '') + 'T' + (getField(a, 'waktuSubmit') || '00:00');
      const dateB = (getField(b, 'tanggal') || '') + 'T' + (getField(b, 'waktuSubmit') || '00:00');
      return dateB.localeCompare(dateA);
    });
  }, [allLaporanH, allLaporanK, filterStatus, onlyLama, tab]); // eslint-disable-line react-hooks/exhaustive-deps

  const pendingCount = useMemo(
    () =>
      allLaporanH.filter((l) => getField(l, 'status') === 'pending').length +
      allLaporanK.filter((l) => getField(l, 'status') === 'pending').length,
    [allLaporanH, allLaporanK]
  );
  const approvedCount = useMemo(
    () =>
      allLaporanH.filter((l) => getField(l, 'status') === 'approved').length +
      allLaporanK.filter((l) => getField(l, 'status') === 'approved').length,
    [allLaporanH, allLaporanK]
  );
  const revisionCount = useMemo(
    () =>
      allLaporanH.filter((l) => getField(l, 'status') === 'revision').length +
      allLaporanK.filter((l) => getField(l, 'status') === 'revision').length,
    [allLaporanH, allLaporanK]
  );
  const tabCounts = [pendingCount, approvedCount, revisionCount];

  // ===== Apply local optimistic update (no API call) =====
  const applyLocalStatusUpdate = useCallback(
    (source: 'harian' | 'kejadian', id: string, status: string, catatan?: string) => {
      useDataStore.setState((s) => {
        if (source === 'harian') {
          return {
            laporanHarian: s.laporanHarian.map((l) =>
              l.id === id ? { ...l, status: status as any, catatanKomandan: catatan || l.catatanKomandan } : l
            ),
          };
        }
        return {
          laporanKejadian: s.laporanKejadian.map((l) =>
            l.id === id ? { ...l, status: status as any, catatanKomandan: catatan || l.catatanKomandan } : l
          ),
        };
      });
      // Also reflect change immediately in the server-loaded copy so user sees it before refetch
      if (source === 'harian') {
        setServerLaporanH((arr) =>
          arr.map((l) => (String(getField(l, 'id', '_id')) === String(id) ? { ...l, status, catatan_komandan: catatan ?? l.catatan_komandan } : l))
        );
      } else {
        setServerLaporanK((arr) =>
          arr.map((l) => (String(getField(l, 'id', '_id')) === String(id) ? { ...l, status, catatan_komandan: catatan ?? l.catatan_komandan } : l))
        );
      }
    },
    []
  );

  // ===== Actions =====
  const handleApprove = (item: any) => {
    const title = lang === 'en' ? 'Approve Report?' : 'Setujui Laporan?';
    const itemNama = getField(item, 'nama') || 'Anggota';
    const msg = lang === 'en' ? `Approve report from ${itemNama}?` : `Setujui laporan dari ${itemNama}?`;

    Alert.alert(title, msg, [
      { text: lang === 'en' ? 'Cancel' : 'Batal', style: 'cancel' },
      {
        text: lang === 'en' ? 'Approve' : 'Setujui',
        onPress: async () => {
          if (submitting) return;
          setSubmitting(true);
          const note = lang === 'en' ? 'Approved by Commander' : 'Disetujui oleh Komandan';
          try {
            // Single API call - server handles audit log + downstream notifications
            if (item.source === 'harian') {
              await laporanApi.harianValidate(item.id, 'approved', note);
            } else {
              await laporanApi.kejadianValidate(item.id, 'approved', note);
            }

            // Optimistic local update (no second API call)
            applyLocalStatusUpdate(item.source, item.id, 'approved', note);

            // Refetch to sync with server state
            await fetchLaporan();

            Alert.alert('✅', lang === 'en' ? 'Report approved' : 'Laporan telah disetujui');
            setShowDetail(null);
          } catch (err: any) {
            console.log('[Validasi] Approve error:', err);
            Alert.alert(
              'Error',
              err?.message || (lang === 'en' ? 'Failed to approve report' : 'Gagal menyetujui laporan')
            );
          } finally {
            setSubmitting(false);
          }
        },
      },
    ]);
  };

  const handleRequestRevision = (item: any) => {
    setRevisionTarget(item);
    setCatatan('');
    setShowRevisionModal(true);
  };

  const submitRevision = async () => {
    if (!catatan.trim()) {
      Alert.alert('Error', lang === 'en' ? 'Revision note is required' : 'Catatan revisi wajib diisi');
      return;
    }
    if (!revisionTarget || submitting) return;

    setSubmitting(true);
    try {
      // Single API call (server handles notification to anggota)
      if (revisionTarget.source === 'harian') {
        await laporanApi.harianValidate(revisionTarget.id, 'revision', catatan);
      } else {
        await laporanApi.kejadianValidate(revisionTarget.id, 'revision', catatan);
      }

      // Optimistic local update (no second API call)
      applyLocalStatusUpdate(revisionTarget.source, revisionTarget.id, 'revision', catatan);

      await fetchLaporan();

      setShowRevisionModal(false);
      setShowDetail(null);
      setRevisionTarget(null);
      Alert.alert(
        '⚠️',
        lang === 'en'
          ? 'Revision requested. Member will be notified.'
          : 'Revisi diminta. Anggota akan menerima notifikasi revisi.'
      );
    } catch (err: any) {
      console.log('[Validasi] Revision error:', err);
      Alert.alert(
        'Error',
        err?.message || (lang === 'en' ? 'Failed to request revision' : 'Gagal mengirim permintaan revisi')
      );
    } finally {
      setSubmitting(false);
    }
  };

  // ===== Render helpers =====
  const getKondisiLabel = (item: any) => {
    if (getField(item, 'tipe') === 'Kejadian') return getField(item, 'jenis') || getField(item, 'kondisi') || '-';
    const kondisiMap: Record<string, string> = {
      aman: lang === 'en' ? 'Safe' : 'Aman',
      ada_masalah: lang === 'en' ? 'Issue Found' : 'Ada Masalah',
      perlu_perhatian: lang === 'en' ? 'Needs Attention' : 'Perlu Perhatian',
      perhatian_khusus: lang === 'en' ? 'Special Attention' : 'Perhatian Khusus',
    };
    const k = getField(item, 'kondisi') || '';
    return kondisiMap[k] || k || '-';
  };

  const getStatusLabel = (status: string) => {
    const map: Record<string, string> = {
      pending: lang === 'en' ? 'Pending' : 'Menunggu',
      approved: lang === 'en' ? 'Approved' : 'Disetujui',
      revision: lang === 'en' ? 'Revision' : 'Revisi',
      rejected: lang === 'en' ? 'Rejected' : 'Ditolak',
    };
    return map[status] || status;
  };

  // Location display - pos_jaga for harian, lokasi_text for kejadian
  const getLokasiDisplay = (item: any) => {
    if (getField(item, 'tipe') === 'Kejadian') {
      return getField(item, 'lokasi_text', 'lokasi', 'location') || '-';
    }
    return getField(item, 'pos_jaga', 'posJaga', 'pos_nama', 'pos') || '-';
  };

  // FIX: For Kejadian show kronologi; for Harian show aktivitas (was wrong order before)
  const getNarrativeText = (item: any) => {
    if (getField(item, 'tipe') === 'Kejadian') {
      return getField(item, 'kronologi') || getField(item, 'aktivitas') || '-';
    }
    return getField(item, 'aktivitas') || getField(item, 'kronologi') || '-';
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }, { backgroundColor: theme.bgCard, borderBottomColor: theme.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]}>
          {lang === 'en' ? 'Report Validation' : 'Validasi Laporan'}
        </Text>
        <TouchableOpacity onPress={onRefresh} style={styles.refreshHeaderBtn}>
          <Ionicons name="refresh" size={22} color={theme.primary} />
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={[styles.tabsRow, { backgroundColor: theme.bgCard, borderBottomColor: theme.border }]}>
        {TABS.map((tabLabel, idx) => {
          const count = tabCounts[idx];
          const tabKey = TABS_ID[idx];
          const isActive = tab === tabKey;
          return (
            <TouchableOpacity
              key={tabKey}
              style={[styles.tab, { backgroundColor: isActive ? theme.primary : isDark ? theme.bgInput : Colors.bgGray }]}
              onPress={() => setTab(tabKey)}
            >
              <Text style={[styles.tabText, { color: isActive ? '#fff' : theme.textSecondary }]}>{tabLabel}</Text>
              {count > 0 && (
                <View style={[styles.tabCount, { backgroundColor: isActive ? 'rgba(255,255,255,0.3)' : Colors.danger }]}>
                  <Text style={styles.tabCountText}>{count}</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* [Misi V3 / C2] Filter cepat: pending lama (> 30 hari) */}
      {tab === 'Pending' && pendingLamaCount > 0 && (
        <TouchableOpacity
          onPress={() => setOnlyLama((v) => !v)}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginHorizontal: 16, marginTop: 8, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: onlyLama ? Colors.danger : theme.border, backgroundColor: onlyLama ? Colors.dangerBg : theme.bgCard }}
        >
          <Ionicons name="hourglass-outline" size={14} color={Colors.danger} />
          <Text style={{ fontSize: 12, fontWeight: '600', color: onlyLama ? Colors.danger : theme.textSecondary }}>
            {lang === 'en' ? `Pending > ${LAMA_HARI} days (${pendingLamaCount})` : `Pending > ${LAMA_HARI} hari (${pendingLamaCount})`}
          </Text>
        </TouchableOpacity>
      )}

      {/* Last refresh info */}
      {lastRefresh && (
        <View style={[styles.refreshInfo, { backgroundColor: isDark ? `${theme.primary}10` : '#f0f9ff' }]}>
          <Ionicons name="time-outline" size={12} color={theme.textMuted} />
          <Text style={[styles.refreshInfoText, { color: theme.textMuted }]}>
            {lang === 'en' ? 'Updated' : 'Diperbarui'}:{' '}
            {lastRefresh.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
          </Text>
          <TouchableOpacity onPress={onRefresh} style={styles.refreshMiniBtn}>
            <Ionicons name="refresh" size={12} color={theme.primary} />
            <Text style={[styles.refreshMiniText, { color: theme.primary }]}>{t('general.refresh')}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Content */}
      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={theme.primary} />
          <Text style={[styles.loadingText, { color: theme.textMuted }]}>
            {lang === 'en' ? 'Loading reports...' : 'Memuat laporan...'}
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 16 }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
        >
          {filteredLaporan.length === 0 ? (
            <View style={styles.emptyWrap}>
              <Ionicons name="document-outline" size={48} color={theme.textMuted} />
              <Text style={[styles.emptyTitle, { color: theme.text }]}>
                {lang === 'en' ? `No ${tab.toLowerCase()} reports` : `Tidak ada laporan ${tab.toLowerCase()}`}
              </Text>
              <Text style={[styles.emptyDesc, { color: theme.textMuted }]}>
                {tab === 'Pending'
                  ? lang === 'en'
                    ? 'Reports submitted by members will appear here for your validation.'
                    : 'Laporan yang dikirim oleh anggota akan muncul di sini untuk divalidasi.'
                  : lang === 'en'
                  ? 'Reports with this status will appear here.'
                  : 'Laporan dengan status ini akan muncul di sini.'}
              </Text>
              <Button
                title={lang === 'en' ? 'Refresh Data' : 'Segarkan Data'}
                variant="outline"
                size="small"
                icon="refresh-outline"
                onPress={onRefresh}
                style={{ marginTop: 12 }}
              />
            </View>
          ) : (
            filteredLaporan.map((item) => {
              const itemTipe = getField(item, 'tipe') || 'Harian';
              const itemStatus = getField(item, 'status') || 'pending';
              const itemNama = getField(item, 'nama') || 'Anggota';
              const itemNrp = getField(item, 'nrp') || '-';
              const itemWaktu = getField(item, 'waktuSubmit') || '-';
              const itemPrioritas = getField(item, 'prioritas');
              const itemNarrative = getNarrativeText(item);
              const itemTanggal = getField(item, 'tanggal') || '-';
              const itemShift = getField(item, 'shift');
              const itemCatatan = getField(item, 'catatan_komandan', 'catatanKomandan') || '';

              return (
                <TouchableOpacity
                  key={`${item.source}-${item.id}`}
                  activeOpacity={0.7}
                  onPress={() => setShowDetail(item)}
                >
                  <Card
                    style={[styles.card, { backgroundColor: theme.bgCard }]}
                    variant="bordered"
                    borderColor={itemTipe === 'Kejadian' ? Colors.danger : Colors.primary}
                  >
                    <View style={styles.cardTop}>
                      <Badge text={itemTipe} variant={itemTipe === 'Kejadian' ? 'danger' : 'info'} />
                      {itemTipe === 'Kejadian' && itemPrioritas && (
                        <Badge
                          text={String(itemPrioritas)}
                          variant={itemPrioritas === 'kritis' ? 'danger' : itemPrioritas === 'tinggi' ? 'warning' : 'info'}
                        />
                      )}
                      <Badge
                        text={getStatusLabel(itemStatus)}
                        variant={itemStatus === 'approved' ? 'success' : itemStatus === 'revision' ? 'warning' : 'default'}
                      />
                      {itemStatus === 'pending' && umurHari(item) >= LAMA_HARI && (
                        <Badge text={`Pending ${umurHari(item)} hari`} variant="danger" />
                      )}
                      <Text style={[styles.timeText, { color: theme.textMuted }]}>{itemWaktu}</Text>
                    </View>

                    <Text style={[styles.cardName, { color: theme.text }]}>
                      {itemNama} ({itemNrp})
                    </Text>
                    <Text style={[styles.cardKondisi, { color: itemTipe === 'Kejadian' ? Colors.danger : Colors.primary }]}>
                      {getKondisiLabel(item)}
                    </Text>
                    <Text style={[styles.cardAktivitas, { color: theme.textSecondary }]} numberOfLines={3}>
                      {itemNarrative}
                    </Text>
                    <Text style={[styles.cardDate, { color: theme.textMuted }]}>
                      {itemTanggal} • {getLokasiDisplay(item)} {itemShift ? `• ${itemShift}` : ''}
                    </Text>

                    {itemCatatan ? (
                      <View style={[styles.catatanBox, { backgroundColor: isDark ? '#3d3200' : Colors.warningBg }]}>
                        <Text style={[styles.catatanLabel, { color: isDark ? '#ffd54f' : Colors.warningDark }]}>
                          {lang === 'en' ? 'Commander Note:' : 'Catatan Komandan:'}
                        </Text>
                        <Text style={[styles.catatanText, { color: theme.text }]}>{itemCatatan}</Text>
                      </View>
                    ) : null}

                    {itemStatus === 'pending' && (
                      <View style={styles.actionRow}>
                        <Button
                          title={lang === 'en' ? 'Revision' : 'Revisi'}
                          variant="outline"
                          size="small"
                          icon="create-outline"
                          onPress={() => handleRequestRevision(item)}
                          style={{ flex: 1 }}
                          textStyle={{ color: Colors.warning }}
                          disabled={submitting}
                        />
                        <Button
                          title={lang === 'en' ? 'Approve' : 'Setujui'}
                          variant="success"
                          size="small"
                          icon="checkmark-outline"
                          onPress={() => handleApprove(item)}
                          style={{ flex: 1 }}
                          disabled={submitting}
                        />
                      </View>
                    )}
                  </Card>
                </TouchableOpacity>
              );
            })
          )}
          <View style={{ height: 32 }} />
        </ScrollView>
      )}

      {/* Detail Modal */}
      <Modal visible={!!showDetail && !showRevisionModal} transparent animationType="slide" onRequestClose={() => setShowDetail(null)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: theme.bgCard }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>
                {lang === 'en' ? 'Report Detail' : 'Detail Laporan'}
              </Text>
              <TouchableOpacity onPress={() => setShowDetail(null)}>
                <Ionicons name="close" size={24} color={theme.textMuted} />
              </TouchableOpacity>
            </View>

            {showDetail && (
              <ScrollView style={{ maxHeight: 400 }} showsVerticalScrollIndicator={false}>
                <View style={styles.detailRow}>
                  <Badge
                    text={getField(showDetail, 'tipe') || '-'}
                    variant={getField(showDetail, 'tipe') === 'Kejadian' ? 'danger' : 'info'}
                  />
                  <Badge
                    text={getStatusLabel(getField(showDetail, 'status'))}
                    variant={
                      getField(showDetail, 'status') === 'approved'
                        ? 'success'
                        : getField(showDetail, 'status') === 'revision'
                        ? 'warning'
                        : 'default'
                    }
                  />
                </View>

                {[
                  {
                    label: lang === 'en' ? 'Reporter' : 'Pelapor',
                    value: `${getField(showDetail, 'nama') || '-'} (NRP: ${getField(showDetail, 'nrp') || '-'})`,
                  },
                  {
                    label: lang === 'en' ? 'Date / Time' : 'Tanggal / Waktu',
                    value:
                      getField(showDetail, 'tipe') === 'Kejadian'
                        ? `${getField(showDetail, 'tanggal') || '-'} • ${getField(showDetail, 'waktu_kejadian', 'waktuKejadian') || getField(showDetail, 'waktuSubmit') || '-'}`
                        : `${getField(showDetail, 'tanggal') || '-'} • ${getField(showDetail, 'waktuSubmit') || '-'}`,
                  },
                  {
                    label:
                      getField(showDetail, 'tipe') === 'Kejadian'
                        ? lang === 'en'
                          ? 'Incident Type'
                          : 'Jenis Kejadian'
                        : lang === 'en'
                        ? 'Condition'
                        : 'Kondisi',
                    value: getKondisiLabel(showDetail),
                  },
                  { label: lang === 'en' ? 'Location' : 'Lokasi', value: getLokasiDisplay(showDetail) },
                ].map((f, i) => (
                  <View key={i} style={styles.detailField}>
                    <Text style={[styles.detailLabel, { color: theme.textMuted }]}>{f.label}</Text>
                    <Text style={[styles.detailValue, { color: theme.text }]}>{f.value}</Text>
                  </View>
                ))}

                {getField(showDetail, 'tipe') === 'Kejadian' && getField(showDetail, 'prioritas') && (
                  <View style={styles.detailField}>
                    <Text style={[styles.detailLabel, { color: theme.textMuted }]}>
                      {lang === 'en' ? 'Priority' : 'Prioritas'}
                    </Text>
                    <Badge
                      text={String(getField(showDetail, 'prioritas'))}
                      variant={
                        getField(showDetail, 'prioritas') === 'kritis'
                          ? 'danger'
                          : getField(showDetail, 'prioritas') === 'tinggi'
                          ? 'warning'
                          : 'info'
                      }
                    />
                  </View>
                )}

                <View style={styles.detailField}>
                  <Text style={[styles.detailLabel, { color: theme.textMuted }]}>
                    {getField(showDetail, 'tipe') === 'Kejadian'
                      ? lang === 'en'
                        ? 'Chronology'
                        : 'Kronologi'
                      : lang === 'en'
                      ? 'Activity'
                      : 'Aktivitas'}
                  </Text>
                  <Text style={[styles.detailContent, { color: theme.text }]}>{getNarrativeText(showDetail)}</Text>
                </View>

                {getField(showDetail, 'catatan_komandan', 'catatanKomandan') ? (
                  <View style={[styles.catatanBox, { backgroundColor: isDark ? '#3d3200' : Colors.warningBg, marginTop: 8 }]}>
                    <Text style={[styles.catatanLabel, { color: isDark ? '#ffd54f' : Colors.warningDark }]}>
                      {lang === 'en' ? 'Commander Note:' : 'Catatan Komandan:'}
                    </Text>
                    <Text style={[styles.catatanText, { color: theme.text }]}>
                      {getField(showDetail, 'catatan_komandan', 'catatanKomandan')}
                    </Text>
                  </View>
                ) : null}
              </ScrollView>
            )}

            {getField(showDetail, 'status') === 'pending' ? (
              <View style={[styles.modalActionsBottom, { borderTopColor: theme.border }]}>
                <Button
                  title={lang === 'en' ? 'Request Revision' : 'Minta Revisi'}
                  variant="outline"
                  size="medium"
                  icon="create-outline"
                  onPress={() => handleRequestRevision(showDetail)}
                  style={{ flex: 1 }}
                  textStyle={{ color: Colors.warning }}
                  disabled={submitting}
                />
                <Button
                  title={lang === 'en' ? 'Approve' : 'Setujui'}
                  variant="success"
                  size="medium"
                  icon="checkmark-outline"
                  onPress={() => handleApprove(showDetail)}
                  style={{ flex: 1 }}
                  disabled={submitting}
                />
              </View>
            ) : (
              <Button
                title={lang === 'en' ? 'Close' : 'Tutup'}
                variant="outline"
                size="medium"
                fullWidth
                onPress={() => setShowDetail(null)}
                style={{ marginTop: 12 }}
              />
            )}
          </View>
        </View>
      </Modal>

      {/* Revision Modal */}
      <Modal
        visible={showRevisionModal}
        transparent
        animationType="slide"
        onRequestClose={() => {
          if (!submitting) {
            setShowRevisionModal(false);
            setRevisionTarget(null);
          }
        }}
      >
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={[styles.modalCard, { backgroundColor: theme.bgCard }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>
              {lang === 'en' ? 'Request Revision' : 'Minta Revisi'}
            </Text>
            <Text style={[styles.modalDesc, { color: theme.textMuted }]}>
              {lang === 'en' ? 'Report from' : 'Laporan dari'}: {getField(revisionTarget, 'nama') || '-'}
            </Text>
            <TextInput
              style={[styles.modalInput, { backgroundColor: theme.bgInput, color: theme.text, borderColor: theme.border }]}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
              placeholder={
                lang === 'en'
                  ? 'Write revision notes for the member...'
                  : 'Tuliskan catatan revisi untuk anggota...'
              }
              placeholderTextColor={theme.textMuted}
              value={catatan}
              onChangeText={setCatatan}
              editable={!submitting}
            />
            <View style={styles.modalActionsRow}>
              <Button
                title={lang === 'en' ? 'Cancel' : 'Batal'}
                variant="outline"
                size="medium"
                onPress={() => {
                  setShowRevisionModal(false);
                  setRevisionTarget(null);
                }}
                style={{ flex: 1 }}
                disabled={submitting}
              />
              <Button
                title={
                  submitting
                    ? lang === 'en'
                      ? 'Sending...'
                      : 'Mengirim...'
                    : lang === 'en'
                    ? 'Send Revision'
                    : 'Kirim Revisi'
                }
                variant="warning"
                size="medium"
                onPress={submitRevision}
                style={{ flex: 1 }}
                disabled={submitting}
              />
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
  refreshHeaderBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  tabsRow: { flexDirection: 'row', paddingHorizontal: Spacing.base, paddingVertical: 10, gap: 8, borderBottomWidth: 1 },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderRadius: Radius.md, gap: 6 },
  tabText: { ...Typography.smallBold },
  tabCount: { minWidth: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  tabCountText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  refreshInfo: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: Spacing.base, paddingVertical: 6 },
  refreshInfoText: { ...Typography.caption, flex: 1 },
  refreshMiniBtn: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  refreshMiniText: { fontSize: 11, fontWeight: '600' },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { ...Typography.body },
  content: { padding: Spacing.base },
  emptyWrap: { alignItems: 'center', paddingVertical: 60, gap: 8 },
  emptyTitle: { ...Typography.bodyBold, marginTop: 8 },
  emptyDesc: { ...Typography.small, textAlign: 'center', paddingHorizontal: 20 },
  card: { marginBottom: 12 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6, flexWrap: 'wrap' },
  timeText: { ...Typography.caption, marginLeft: 'auto' },
  cardName: { ...Typography.bodyBold },
  cardKondisi: { ...Typography.smallBold, marginTop: 2 },
  cardAktivitas: { ...Typography.small, marginTop: 4 },
  cardDate: { ...Typography.caption, marginTop: 4 },
  catatanBox: { marginTop: 8, padding: 10, borderRadius: Radius.sm },
  catatanLabel: { ...Typography.caption, fontWeight: '700' },
  catatanText: { ...Typography.small, marginTop: 2 },
  actionRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCard: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, maxHeight: '80%' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  modalTitle: { ...Typography.h3 },
  modalDesc: { ...Typography.small, marginBottom: 16 },
  detailRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  detailField: { marginBottom: 12 },
  detailLabel: { ...Typography.caption, marginBottom: 2 },
  detailValue: { ...Typography.bodyBold },
  detailContent: { ...Typography.body, lineHeight: 22 },
  modalActionsBottom: { flexDirection: 'row', gap: 10, marginTop: 16, paddingTop: 16, borderTopWidth: 1 },
  modalInput: { borderWidth: 1.5, borderRadius: Radius.md, padding: 14, ...Typography.body, height: 100, marginBottom: 16 },
  modalActionsRow: { flexDirection: 'row', gap: 10 },
});
