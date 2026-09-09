/**
 * PATROLI SCREEN - v10 FIXED
 * 
 * MASALAH SEBELUMNYA:
 * - Menggunakan `patroliRecords` dari dataStore yang TIDAK ADA atau kosong
 * - Field names tidak cocok (snake_case dari DB/API vs camelCase di store)
 * - Tidak pernah fetch data patroli dari backend → selalu "Belum Ada Patroli"
 * 
 * PERBAIKAN:
 * - Fetch riwayat patroli dari backend API (tabel `patroli`) via patroliApi.list()
 * - Normalisasi field names: handle snake_case (start_time, route_id, checkpoint_scanned)
 *   DAN camelCase (startTime, routeId, checkpointScanned)
 * - Cek juga dataStore.patroliRecords / dataStore.patroli sebagai fallback
 * - Auto-refresh saat kembali dari patrol aktif
 * - Patroli bisa dilakukan berulang untuk rute yang sama
 */
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Radius, Shadows } from '../../constants';
import { Card, Badge, Button } from '../../components';
import { useDataStore } from '../../stores/dataStore';
import { useAuthStore } from '../../stores/authStore';
import { patroliApi } from '../../lib/apiClient';
import { useI18n } from '../../lib/i18n';
import { useTheme } from '../../lib/theme';

/* ─── Tipe record patroli yang sudah dinormalisasi ─── */
interface PatrolRecord {
  id: string;
  userId: string;
  routeId: string;
  routeName: string;
  startTime: number;
  endTime: number;
  status: string;
  checkpointScanned: number;
  checkpointTotal: number;
}

/** Konversi apapun ke timestamp ms */
function toMs(val: any): number {
  if (!val) return 0;
  if (typeof val === 'number') return val > 1e12 ? val : val * 1000;
  if (typeof val === 'string') return new Date(val).getTime() || 0;
  return 0;
}

/** Normalisasi 1 row dari API (snake_case) atau store (camelCase) */
function normalize(raw: any): PatrolRecord {
  return {
    id:                 raw.id || raw._id || `local-${Math.random()}`,
    userId:             raw.user_id   || raw.userId   || '',
    routeId:            raw.route_id  || raw.routeId  || '',
    routeName:          raw.route_name || raw.routeName || '',
    startTime:          toMs(raw.start_time || raw.startTime),
    endTime:            toMs(raw.end_time   || raw.endTime),
    status:             raw.status || 'completed',
    checkpointScanned:  raw.checkpoint_scanned ?? raw.checkpointScanned ?? 0,
    checkpointTotal:    raw.checkpoint_total   ?? raw.checkpointTotal   ?? 0,
  };
}

function isToday(ts: number): boolean {
  if (!ts) return false;
  const d = new Date(ts);
  const n = new Date();
  return d.getDate() === n.getDate() && d.getMonth() === n.getMonth() && d.getFullYear() === n.getFullYear();
}

export default function PatroliScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  const { theme, isDark } = useTheme();
  const user = useAuthStore((s) => s.user);
  const allRoutes = useDataStore((s) => s.routes);
  const activePatrol = useDataStore((s) => s.activePatrol);
  const startPatrol = useDataStore((s) => s.startPatrol);
  const endPatrol = useDataStore((s) => s.endPatrol);
  const checkpoints = useDataStore((s) => s.checkpoints);

  const routes = useMemo(() => allRoutes.filter((r) => r.status === 'active'), [allRoutes]);

  const [elapsed, setElapsed] = useState(0);
  const [histLoading, setHistLoading] = useState(true);
  const [records, setRecords] = useState<PatrolRecord[]>([]);

  const uid = user?.id || '';

  // ═══════════════════════════════════════════
  // FETCH: Ambil riwayat patroli dari SEMUA sumber
  // ═══════════════════════════════════════════
  const fetchHistory = useCallback(async () => {
    setHistLoading(true);
    const collected: PatrolRecord[] = [];
    const seenIds = new Set<string>();

    const addUnique = (rec: PatrolRecord) => {
      if (rec.id && seenIds.has(rec.id)) return;
      seenIds.add(rec.id);
      collected.push(rec);
    };

    // === Source 1: Backend API ===
    try {
      // Coba beberapa format query yang mungkin didukung
      let apiData: any = null;
      try {
        apiData = await patroliApi.list(`user_id=${uid}`);
      } catch {
        try {
          apiData = await patroliApi.list(`userId=${uid}`);
        } catch {
          try {
            apiData = await patroliApi.list('');
          } catch { /* silent */ }
        }
      }

      if (apiData) {
        const rows = Array.isArray(apiData) ? apiData : (apiData.data || apiData.rows || []);
        rows.forEach((row: any) => {
          const rec = normalize(row);
          // Filter hanya user ini dan status selesai
          const matchUser = !uid || rec.userId === uid || !rec.userId;
          const matchStatus = rec.status === 'completed' || rec.status === 'incomplete';
          if (matchUser && matchStatus) addUnique(rec);
        });
      }
    } catch (e) {
      console.log('[Patroli] API fetch failed:', e);
    }

    // === Source 2: dataStore (semua kemungkinan field name) ===
    try {
      const state = useDataStore.getState() as any;
      const candidates = [
        state.patroliRecords,
        state.patroli,
        state.patrolHistory,
        state.completedPatrols,
      ];
      for (const arr of candidates) {
        if (!Array.isArray(arr)) continue;
        arr.forEach((row: any) => {
          const rec = normalize(row);
          const matchUser = !uid || rec.userId === uid || !rec.userId;
          const matchStatus = rec.status === 'completed' || rec.status === 'incomplete';
          if (matchUser && matchStatus) addUnique(rec);
        });
      }
    } catch { /* silent */ }

    // Sort by startTime descending
    collected.sort((a, b) => b.startTime - a.startTime);
    setRecords(collected);
    setHistLoading(false);
  }, [uid]);

  // Fetch on mount
  useEffect(() => { if (uid) fetchHistory(); }, [uid, fetchHistory]);

  // Re-fetch when patrol ends (activePatrol becomes null)
  const prevActiveRef = React.useRef(activePatrol);
  useEffect(() => {
    const wasActive = prevActiveRef.current;
    prevActiveRef.current = activePatrol;
    // Patrol just ended → refresh history
    if (wasActive && !activePatrol && uid) {
      const timer = setTimeout(fetchHistory, 800);
      return () => clearTimeout(timer);
    }
  }, [activePatrol, uid, fetchHistory]);

  // ═══ Timer patroli aktif ═══
  useEffect(() => {
    if (!activePatrol?.isActive) return;
    const iv = setInterval(() => setElapsed(Math.floor((Date.now() - activePatrol.startTime) / 1000)), 1000);
    return () => clearInterval(iv);
  }, [activePatrol?.isActive, activePatrol?.startTime]);

  const fmt = (s: number) => {
    const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60); const sec = s % 60;
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
  };

  const scanned = activePatrol?.checkpoints.filter((c) => c.scanned).length || 0;
  const total = activePatrol?.checkpoints.length || 0;
  const progress = total > 0 ? (scanned / total) * 100 : 0;

  // ═══ Patroli hari ini ═══
  const todayPatrols = useMemo(() => {
    return records.filter(p => isToday(p.startTime) || isToday(p.endTime));
  }, [records]);

  const patrolsByRoute = useMemo(() => {
    const map: Record<string, PatrolRecord[]> = {};
    todayPatrols.forEach(p => {
      const key = p.routeId || p.routeName || 'unknown';
      if (!map[key]) map[key] = [];
      map[key].push(p);
    });
    return map;
  }, [todayPatrols]);

  const totalToday = todayPatrols.length;

  const routeCount = useCallback((routeId: string) => patrolsByRoute[routeId]?.length || 0, [patrolsByRoute]);
  const lastPatrol = useCallback((routeId: string) => patrolsByRoute[routeId]?.[0] || null, [patrolsByRoute]);

  const fmtTime = (ts: number) => ts ? new Date(ts).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '-';
  const fmtDur = (s: number, e: number) => {
    if (!s || !e) return '-';
    const d = Math.floor((e - s) / 1000);
    if (d < 0) return '-';
    const m = Math.floor(d / 60), sec = d % 60;
    return m >= 60 ? `${Math.floor(m/60)} jam ${m%60} menit` : m > 0 ? `${m} mnt ${sec} dtk` : `${sec} dtk`;
  };

  // ═══ Handlers ═══
  // [P1-2] startPatrol/endPatrol kini Promise<SubmitResult> — tampilkan hasil
  // sesungguhnya (sukses/diantrekan offline/ditolak server), jangan berasumsi sukses.
  const doStart = async (routeId: string) => {
    const res = await startPatrol(routeId);
    if (res.status === 'error') {
      Alert.alert('Gagal Memulai Patroli', res.error || 'Server menolak memulai patroli. Silakan coba lagi.');
      return;
    }
    if (res.status === 'queued') {
      Alert.alert('Tersimpan Offline', 'Tidak ada koneksi. Patroli dimulai secara lokal & akan disinkronkan saat online.');
    }
  };

  const handleStart = (routeId: string) => {
    const cnt = routeCount(routeId);
    const name = routes.find(r => r.id === routeId)?.nama || 'Rute';
    Alert.alert('Mulai Patroli?',
      cnt > 0
        ? `Anda sudah patroli "${name}" sebanyak ${cnt}x hari ini.\n\nMulai patroli lagi?`
        : `Mulai patroli "${name}". Pastikan Anda siap.`,
      [{ text: 'Batal', style: 'cancel' }, { text: 'Mulai', onPress: () => doStart(routeId) }]
    );
  };

  const doEnd = async (info: { name: string; scanned: number; total: number; time: string }, allDone: boolean) => {
    const res = await endPatrol();
    if (res.status === 'error') {
      Alert.alert('Gagal Menyimpan Patroli', res.error || 'Server menolak data akhir patroli. Silakan hubungi supervisor bila diperlukan.');
      return;
    }
    const queuedNote = res.status === 'queued' ? '\n\nTersimpan offline, akan dikirim saat online.' : '';
    if (allDone) {
      Alert.alert('Patroli Selesai! 🎉', `${info.name}\nSemua ${info.total} CP berhasil! • ${info.time}\n\nAnda bisa patroli lagi jika diperlukan.${queuedNote}`);
    } else {
      Alert.alert('Patroli Diakhiri', `${info.name}\n${info.scanned}/${info.total} CP • ${info.time}${queuedNote}`);
    }
  };

  const handleEnd = () => {
    const info = { name: activePatrol?.routeName || '', scanned, total, time: fmt(elapsed) };
    if (scanned < total) {
      Alert.alert('Patroli Belum Selesai', `Masih ada ${total - scanned} checkpoint belum di-scan. Yakin akhiri?`, [
        { text: 'Lanjutkan', style: 'cancel' },
        { text: 'Akhiri', style: 'destructive', onPress: () => doEnd(info, false) },
      ]);
    } else {
      doEnd(info, true);
    }
  };

  // ════════════════════════════════════════
  // RENDER: ROUTE SELECTION
  // ════════════════════════════════════════
  if (!activePatrol) {
    return (
      <View style={[s.container, { backgroundColor: theme.bg }]}>
        <View style={[s.header, { paddingTop: insets.top + 12 }, { backgroundColor: theme.bgCard, borderBottomColor: theme.border }]}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
            <Ionicons name="arrow-back" size={24} color={theme.text} />
          </TouchableOpacity>
          <Text style={[s.headerTitle, { color: theme.text }]}>Patroli</Text>
          <TouchableOpacity onPress={fetchHistory} style={s.refreshBtn}>
            <Ionicons name="refresh" size={20} color={theme.primary} />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>

          {/* ═══ SUMMARY ═══ */}
          {histLoading ? (
            <Card style={[s.summaryCard, { borderColor: theme.border }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 }}>
                <ActivityIndicator color={theme.primary} />
                <Text style={{ color: theme.textMuted, fontSize: 13 }}>Memuat riwayat patroli...</Text>
              </View>
            </Card>
          ) : totalToday > 0 ? (
            <Card style={[s.summaryCard, {
              backgroundColor: isDark ? `${Colors.success}12` : '#F0FDF4',
              borderColor: isDark ? `${Colors.success}30` : '#BBF7D0',
            }]}>
              <View style={s.summaryHeader}>
                <View style={[s.summaryIcon, { backgroundColor: isDark ? `${Colors.success}25` : '#DCFCE7' }]}>
                  <Ionicons name="shield-checkmark" size={22} color={Colors.success} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.summaryTitle, { color: isDark ? Colors.success : '#166534' }]}>
                    Patroli Hari Ini ✓
                  </Text>
                  <Text style={[s.summarySub, { color: isDark ? theme.textMuted : '#15803D' }]}>
                    {totalToday} patroli selesai
                  </Text>
                </View>
                <View style={[s.countBadgeLg, { backgroundColor: Colors.success }]}>
                  <Text style={s.countBadgeLgText}>{totalToday}x</Text>
                </View>
              </View>

              <View style={[s.divider, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)' }]} />

              {Object.entries(patrolsByRoute).map(([key, arr]) => {
                const name = arr[0]?.routeName || routes.find(r => r.id === key)?.nama || key;
                return (
                  <View key={key} style={s.sumRouteRow}>
                    <View style={s.sumRouteLeft}>
                      <Ionicons name="navigate" size={14} color={Colors.success} />
                      <Text style={[s.sumRouteName, { color: theme.text }]} numberOfLines={1}>{name}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: Colors.success }}>{arr.length}x</Text>
                      <Text style={{ fontSize: 11, color: theme.textMuted }}>
                        {arr.map(p => fmtTime(p.endTime || p.startTime)).join(', ')}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </Card>
          ) : (
            <Card style={[s.summaryCard, {
              backgroundColor: isDark ? `${Colors.warning}10` : '#FFFBEB',
              borderColor: isDark ? `${Colors.warning}25` : '#FDE68A',
            }]}>
              <View style={s.summaryHeader}>
                <View style={[s.summaryIcon, { backgroundColor: isDark ? `${Colors.warning}20` : '#FEF3C7' }]}>
                  <Ionicons name="walk-outline" size={22} color={Colors.warning} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.summaryTitle, { color: isDark ? Colors.warning : '#92400E' }]}>Belum Ada Patroli Hari Ini</Text>
                  <Text style={[s.summarySub, { color: isDark ? theme.textMuted : '#A16207' }]}>Pilih rute di bawah untuk memulai</Text>
                </View>
              </View>
            </Card>
          )}

          {/* ═══ ROUTE LIST ═══ */}
          <Text style={[s.sectionTitle, { color: theme.text }]}>Pilih Rute Patroli</Text>

          {routes.length === 0 ? (
            <Card style={{ alignItems: 'center', paddingVertical: 32 }}>
              <Ionicons name="map-outline" size={48} color={theme.textMuted} />
              <Text style={{ color: theme.textMuted, marginTop: 8 }}>Tidak ada rute tersedia</Text>
            </Card>
          ) : routes.map(route => {
            const cpNames = route.checkpointIds.map(id => checkpoints.find(c => c.id === id)?.nama || id);
            const cnt = routeCount(route.id);
            const last = lastPatrol(route.id);

            return (
              <Card key={route.id} style={[s.routeCard, { backgroundColor: theme.bgCard }]}>
                <View style={s.routeRow}>
                  <View style={[s.routeIcon, { backgroundColor: isDark ? `${Colors.primary}20` : Colors.primaryBg }]}>
                    <Ionicons name="navigate" size={22} color={Colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text style={[s.routeName, { color: theme.text }]}>{route.nama}</Text>
                      {cnt > 0 && (
                        <View style={s.countBadge}><Text style={s.countBadgeText}>{cnt}x</Text></View>
                      )}
                    </View>
                    <Text style={[s.routeMeta, { color: theme.textMuted }]}>
                      {route.checkpointIds.length} Checkpoint • ~{route.waktuEstimasi} menit
                    </Text>
                    <Text style={[s.routeCps, { color: Colors.primary }]} numberOfLines={2}>
                      {cpNames.join(' → ')}
                    </Text>
                  </View>
                </View>

                {/* Last patrol info */}
                {last && (
                  <View style={[s.lastBox, {
                    backgroundColor: isDark ? `${Colors.success}10` : '#F0FDF4',
                    borderColor: isDark ? `${Colors.success}20` : '#BBF7D0',
                  }]}>
                    <Ionicons name="checkmark-circle" size={16} color={Colors.success} />
                    <View style={{ flex: 1 }}>
                      <Text style={[s.lastTitle, { color: isDark ? Colors.success : '#166534' }]}>
                        Terakhir: {fmtTime(last.endTime || last.startTime)} WIB
                      </Text>
                      <Text style={[s.lastDetail, { color: isDark ? theme.textMuted : '#15803D' }]}>
                        Durasi: {fmtDur(last.startTime, last.endTime)} • {last.checkpointScanned}/{last.checkpointTotal || route.checkpointIds.length} CP
                        {last.status === 'incomplete' ? ' (tidak lengkap)' : ' ✓'}
                      </Text>
                    </View>
                  </View>
                )}

                {/* Detail if > 1 */}
                {cnt > 1 && (
                  <View style={{ marginTop: 8, paddingLeft: 4 }}>
                    <Text style={{ fontSize: 11, fontWeight: '600', color: theme.textMuted, marginBottom: 4 }}>
                      Riwayat hari ini ({cnt}x):
                    </Text>
                    {(patrolsByRoute[route.id] || []).map((p, i) => (
                      <View key={p.id || i} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 2 }}>
                        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: p.status === 'completed' ? Colors.success : Colors.warning }} />
                        <Text style={{ fontSize: 11, color: theme.textSecondary }}>
                          #{i+1} - {fmtTime(p.startTime)} s/d {fmtTime(p.endTime)} ({p.checkpointScanned}/{p.checkpointTotal} CP)
                          {p.status === 'incomplete' ? ' ⚠️' : ' ✓'}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}

                <Button
                  title={cnt > 0 ? 'PATROLI LAGI' : 'MULAI PATROLI'}
                  variant="primary" size="medium" fullWidth
                  icon={cnt > 0 ? 'refresh-outline' : 'play-outline'}
                  onPress={() => handleStart(route.id)}
                  style={{ marginTop: 12 }}
                />
              </Card>
            );
          })}

          {/* ═══ FULL HISTORY ═══ */}
          {totalToday > 0 && (
            <>
              <Text style={[s.sectionTitle, { color: theme.text, marginTop: 20 }]}>Riwayat Patroli Hari Ini</Text>
              {todayPatrols.map((p, idx) => {
                const name = p.routeName || routes.find(r => r.id === p.routeId)?.nama || 'Rute';
                const ok = p.status === 'completed';
                return (
                  <Card key={p.id || idx} style={{ marginBottom: 8, padding: 14 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
                      <View style={[s.histIcon, {
                        backgroundColor: ok ? (isDark ? `${Colors.success}20` : '#DCFCE7') : (isDark ? `${Colors.warning}20` : '#FEF3C7'),
                      }]}>
                        <Ionicons name={ok ? 'checkmark-circle' : 'alert-circle'} size={20} color={ok ? Colors.success : Colors.warning} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <Text style={[{ ...Typography.bodyBold }, { color: theme.text }]}>{name}</Text>
                          <Badge text={ok ? 'Selesai' : 'Tidak Lengkap'} variant={ok ? 'success' : 'warning'} />
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
                          <Ionicons name="time-outline" size={12} color={theme.textMuted} />
                          <Text style={{ fontSize: 12, color: theme.textMuted }}>
                            {fmtTime(p.startTime)} - {fmtTime(p.endTime)} ({fmtDur(p.startTime, p.endTime)})
                          </Text>
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
                          <Ionicons name="navigate-outline" size={12} color={theme.textMuted} />
                          <Text style={{ fontSize: 12, color: theme.textMuted }}>
                            {p.checkpointScanned}/{p.checkpointTotal} checkpoint
                          </Text>
                        </View>
                      </View>
                    </View>
                  </Card>
                );
              })}
            </>
          )}

          <View style={{ height: 32 }} />
        </ScrollView>
      </View>
    );
  }

  // ════════════════════════════════════════
  // RENDER: ACTIVE PATROL
  // ════════════════════════════════════════
  return (
    <View style={[s.container, { backgroundColor: theme.bg }]}>
      <View style={[s.header, { paddingTop: insets.top + 12 }, { backgroundColor: theme.bgCard, borderBottomColor: theme.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Ionicons name="arrow-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: theme.text }]}>Patroli Aktif</Text>
        <Badge text="Sedang Patroli" variant="success" dot />
      </View>

      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <Card style={s.timerCard}>
          <Text style={[s.timerText, { color: Colors.success }]}>{fmt(elapsed)}</Text>
          <Text style={{ color: theme.textMuted, marginTop: 4 }}>{activePatrol.routeName}</Text>
          <View style={s.progressRow}>
            <View style={[s.progressBg, { backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : Colors.bgGray }]}>
              <View style={[s.progressFill, { width: `${progress}%` }]} />
            </View>
            <Text style={[{ ...Typography.bodyBold }, { color: theme.text, width: 40 }]}>{scanned}/{total}</Text>
          </View>
        </Card>

        <Text style={[s.sectionTitle, { color: theme.text }]}>Checkpoint</Text>
        {activePatrol.checkpoints.map((cp, idx) => {
          const done = cp.scanned;
          const cur = idx === activePatrol.currentIndex;
          return (
            <Card key={cp.id} style={{ marginBottom: 8, padding: 14 }} variant={cur ? 'bordered' : 'default'} borderColor={Colors.primary}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={[s.cpNum, done && s.cpNumDone, cur && s.cpNumCur]}>
                  {done ? <Ionicons name="checkmark" size={14} color="#fff" /> : <Text style={[s.cpNumTxt, cur && { color: '#fff' }]}>{idx+1}</Text>}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[{ ...Typography.bodyBold }, { color: theme.text }]}>{cp.nama}</Text>
                  {done && <Text style={{ fontSize: 12, color: Colors.success, marginTop: 2 }}>✓ Discan pukul {cp.scanTime}</Text>}
                  {cur && !done && <Text style={{ fontSize: 12, color: Colors.primary, fontWeight: '600', marginTop: 2 }}>Selanjutnya</Text>}
                </View>
                {cur && !done && <Button title="SCAN" variant="primary" size="small" icon="qr-code-outline" onPress={() => navigation.navigate('QRScanner', { checkpointId: cp.id })} />}
                {!cur && !done && <Ionicons name="qr-code-outline" size={20} color={theme.textMuted} />}
                {done && <Ionicons name="checkmark-circle" size={22} color={Colors.success} />}
              </View>
            </Card>
          );
        })}

        <View style={{ marginTop: 16 }}>
          <Button title="SCAN CHECKPOINT" variant="primary" size="large" fullWidth icon="qr-code-outline"
            onPress={() => {
              const cur = activePatrol.checkpoints[activePatrol.currentIndex];
              if (cur) navigation.navigate('QRScanner', { checkpointId: cur.id });
              else Alert.alert('Semua Selesai', 'Semua checkpoint sudah di-scan!');
            }} />
        </View>
        <Button title="AKHIRI PATROLI" variant="danger" size="medium" fullWidth onPress={handleEnd} style={{ marginTop: 8 }} />
        <View style={{ height: 32 }} />
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingBottom: 12, paddingHorizontal: Spacing.base, borderBottomWidth: 1 },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  headerTitle: { ...Typography.h3, flex: 1 },
  refreshBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  content: { padding: Spacing.base },
  sectionTitle: { ...Typography.bodyBold, marginBottom: 12 },

  summaryCard: { marginBottom: 16, borderWidth: 1, borderRadius: Radius.lg, padding: 16 },
  summaryHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  summaryIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  summaryTitle: { fontSize: 15, fontWeight: '700' },
  summarySub: { fontSize: 12, marginTop: 2 },
  countBadgeLg: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  countBadgeLgText: { fontSize: 14, fontWeight: '800', color: '#fff' },
  divider: { height: 1, marginVertical: 12 },
  sumRouteRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6 },
  sumRouteLeft: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  sumRouteName: { fontSize: 13, fontWeight: '600', flex: 1 },

  routeCard: { marginBottom: 12 },
  routeRow: { flexDirection: 'row', gap: 12 },
  routeIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  routeName: { ...Typography.bodyBold },
  countBadge: { backgroundColor: Colors.success, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  countBadgeText: { fontSize: 11, fontWeight: '800', color: '#fff' },
  routeMeta: { ...Typography.caption, marginTop: 2 },
  routeCps: { ...Typography.caption, color: Colors.primary, marginTop: 4 },

  lastBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 10, padding: 10, borderRadius: Radius.md, borderWidth: 1 },
  lastTitle: { fontSize: 12, fontWeight: '600' },
  lastDetail: { fontSize: 11, marginTop: 2 },

  histIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },

  timerCard: { alignItems: 'center', marginBottom: 16, padding: 20 },
  timerText: { fontSize: 42, fontWeight: '800', fontVariant: ['tabular-nums'] },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 10, width: '100%', marginTop: 12 },
  progressBg: { flex: 1, height: 8, borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: Colors.primary, borderRadius: 4 },
  cpNum: { width: 28, height: 28, borderRadius: 14, backgroundColor: Colors.bgGray, alignItems: 'center', justifyContent: 'center' },
  cpNumDone: { backgroundColor: Colors.success },
  cpNumCur: { backgroundColor: Colors.primary },
  cpNumTxt: { ...Typography.smallBold, color: Colors.textMuted },
});
