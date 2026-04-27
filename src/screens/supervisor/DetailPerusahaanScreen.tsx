/**
 * DETAIL PERUSAHAAN SCREEN - Supervisor
 * Company drill-down: Tim, Absensi, Laporan, Pos/Checkpoint
 * Similar to Komandan view but scoped to one company
 */
import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Radius, Shadows } from '../../constants';
import { Card, Badge } from '../../components';
import { useDataStore } from '../../stores/dataStore';
import { useI18n } from '../../lib/i18n';
import { useTheme } from '../../lib/theme';

const TABS = ['Tim', 'Absensi', 'Laporan', 'Pos'];
const STATUS_MAP: Record<string, { label: string; color: string; variant: 'success' | 'info' | 'warning' | 'default' }> = {
  on_duty: { label: 'On Duty', color: Colors.success, variant: 'success' },
  patroli: { label: 'Patroli', color: Colors.primary, variant: 'info' },
  break: { label: 'Break', color: Colors.warning, variant: 'warning' },
  off_duty: { label: 'Off Duty', color: Colors.textMuted, variant: 'default' },
};

export default function DetailPerusahaanScreen({ route, navigation }: any) {
  const { t } = useI18n();
  const { theme, isDark } = useTheme();
  const { lokasiId } = route.params;
  const [tab, setTab] = useState('Tim');

  const lokasi = useDataStore((s) => s.lokasi);
  const team = useDataStore((s) => s.team);
  const absensiRecords = useDataStore((s) => s.absensiRecords);
  const laporanHarian = useDataStore((s) => s.laporanHarian);
  const laporanKejadian = useDataStore((s) => s.laporanKejadian);
  const checkpoints = useDataStore((s) => s.checkpoints);

  const company = useMemo(() => lokasi.find((l) => l.id === lokasiId), [lokasi, lokasiId]);
  const members = useMemo(() => team.filter((m) => m.lokasi === company?.nama), [team, company]);
  const memberIds = useMemo(() => members.map((m) => m.id), [members]);
  const onDuty = useMemo(() => members.filter((m) => m.status !== 'off_duty').length, [members]);
  const compAbsensi = useMemo(() => absensiRecords.filter((a) => memberIds.includes(a.userId)), [absensiRecords, memberIds]);
  const compLaporanH = useMemo(() => laporanHarian.filter((l) => memberIds.includes(l.userId)), [laporanHarian, memberIds]);
  const compLaporanK = useMemo(() => laporanKejadian.filter((l) => memberIds.includes(l.userId)), [laporanKejadian, memberIds]);
  const compCheckpoints = useMemo(() => checkpoints.filter((c) => c.lokasi === company?.nama), [checkpoints, company]);
  const avgSkor = useMemo(() => members.length > 0 ? Math.round(members.reduce((s, m) => s + m.skor, 0) / members.length) : 0, [members]);

  if (!company) return (
    <View style={st.container}><Text style={{ padding: 20 }}>Perusahaan tidak ditemukan</Text></View>
  );

  const stats = [
    { icon: 'people', value: `${onDuty}/${members.length}`, label: 'Personil', color: Colors.primary },
    { icon: 'checkmark-circle', value: `${compAbsensi.length}`, label: 'Absensi', color: Colors.success },
    { icon: 'document-text', value: `${compLaporanH.length + compLaporanK.length}`, label: 'Laporan', color: Colors.warning },
    { icon: 'star', value: `${avgSkor}`, label: 'Avg Skor', color: Colors.purple },
  ];

  return (
    <View style={st.container}>
      {/* Header */}
      <View style={st.header}>
        <TouchableOpacity style={st.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={st.headerInfo}>
          <View style={st.companyIconBg}>
            <Ionicons name="business" size={26} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={st.companyName}>{company.nama}</Text>
            <View style={st.addrRow}>
              <Ionicons name="location" size={12} color="rgba(255,255,255,0.6)" />
              <Text style={st.companyAddr}>{company.alamat}</Text>
            </View>
          </View>
          <Badge text={company.status === 'active' ? 'Aktif' : 'Off'} variant={company.status === 'active' ? 'success' : 'default'} />
        </View>

        {/* Stats */}
        <View style={st.statsRow}>
          {stats.map((s, i) => (
            <View key={i} style={st.statCard}>
              <Ionicons name={s.icon as any} size={16} color={s.color} />
              <Text style={[st.statVal, { color: s.color }]}>{s.value}</Text>
              <Text style={st.statLabel}>{s.label}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Tabs */}
      <View style={st.tabRow}>
        {TABS.map((t) => (
          <TouchableOpacity
            key={t}
            style={[st.tab, tab === t && st.tabActive]}
            onPress={() => setTab(t)}
          >
            <Text style={[st.tabText, tab === t && st.tabTextActive]}>{t}</Text>
            {t === 'Laporan' && (compLaporanH.filter(l => l.status === 'pending').length + compLaporanK.filter(l => l.status === 'pending').length) > 0 && (
              <View style={st.tabBadge}><Text style={st.tabBadgeText}>{compLaporanH.filter(l => l.status === 'pending').length + compLaporanK.filter(l => l.status === 'pending').length}</Text></View>
            )}
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView contentContainerStyle={st.scroll} showsVerticalScrollIndicator={false}>
        {/* === TAB: TIM === */}
        {tab === 'Tim' && (
          <>
            {members.map((m) => {
              const ms = STATUS_MAP[m.status] || STATUS_MAP.off_duty;
              return (
                <TouchableOpacity key={m.id} style={st.memberCard} onPress={() => navigation.navigate('DetailAnggota', { nrp: m.nrp })}>
                  <Image source={{ uri: m.foto }} style={st.memberAvatar} />
                  <View style={[st.statusDot, { backgroundColor: ms.color }]} />
                  <View style={{ flex: 1 }}>
                    <View style={st.memberNameRow}>
                      <Text style={st.memberName}>{m.nama}</Text>
                      {m.role === 'komandan' && <Badge text="Komandan" variant="purple" />}
                    </View>
                    <Text style={st.memberSub}>{m.pos} • {m.shift}</Text>
                    <View style={st.memberMeta}>
                      <Text style={st.metaText}>🎯 {m.kehadiran}</Text>
                      <Text style={st.metaText}>🛡️ {m.totalPatroli} patroli</Text>
                      <Text style={st.metaText}>⭐ {m.skor}</Text>
                    </View>
                  </View>
                  <View style={st.memberRight}>
                    <Badge text={ms.label} variant={ms.variant} />
                    <Text style={st.lastSeen}>{m.lastSeen}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
            {members.length === 0 && (
              <View style={st.empty}><Ionicons name="people-outline" size={40} color={Colors.textMuted} /><Text style={st.emptyText}>Belum ada anggota</Text></View>
            )}
          </>
        )}

        {/* === TAB: ABSENSI === */}
        {tab === 'Absensi' && (
          <>
            <View style={st.absenSummary}>
              <View style={[st.absenStat, { borderLeftColor: Colors.success }]}>
                <Text style={[st.absenVal, { color: Colors.success }]}>{compAbsensi.filter(a => a.status === 'hadir').length}</Text>
                <Text style={st.absenLabel}>Hadir</Text>
              </View>
              <View style={[st.absenStat, { borderLeftColor: Colors.warning }]}>
                <Text style={[st.absenVal, { color: Colors.warning }]}>{compAbsensi.filter(a => a.status === 'terlambat').length}</Text>
                <Text style={st.absenLabel}>Terlambat</Text>
              </View>
              <View style={[st.absenStat, { borderLeftColor: Colors.danger }]}>
                <Text style={[st.absenVal, { color: Colors.danger }]}>{members.length - new Set(compAbsensi.map(a => a.userId)).size}</Text>
                <Text style={st.absenLabel}>Belum Absen</Text>
              </View>
            </View>
            {compAbsensi.length > 0 ? compAbsensi.slice().reverse().map((a) => (
              <View key={a.id} style={st.absenCard}>
                <View style={[st.absenIcon, { backgroundColor: a.tipe === 'masuk' ? Colors.successSoft : Colors.dangerSoft }]}>
                  <Ionicons name={a.tipe === 'masuk' ? 'log-in' : 'log-out'} size={18} color={a.tipe === 'masuk' ? Colors.success : Colors.danger} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={st.absenName}>{a.nama}</Text>
                  <Text style={st.absenDetail}>{a.posJaga} • {a.waktu}</Text>
                </View>
                <Badge text={a.status === 'hadir' ? 'Tepat' : 'Terlambat'} variant={a.status === 'hadir' ? 'success' : 'warning'} />
              </View>
            )) : (
              <View style={st.empty}><Ionicons name="time-outline" size={40} color={Colors.textMuted} /><Text style={st.emptyText}>Belum ada data absensi</Text></View>
            )}
          </>
        )}

        {/* === TAB: LAPORAN === */}
        {tab === 'Laporan' && (
          <>
            {compLaporanK.length > 0 && (
              <>
                <Text style={st.subSection}>🚨 Laporan Kejadian ({compLaporanK.length})</Text>
                {compLaporanK.map((l) => (
                  <Card key={l.id} style={st.laporanCard} variant="bordered" borderColor={l.prioritas === 'kritis' ? Colors.danger : l.prioritas === 'tinggi' ? Colors.warning : Colors.primary}>
                    <View style={st.laporanRow}>
                      <Ionicons name="alert-circle" size={20} color={l.prioritas === 'kritis' ? Colors.danger : Colors.warning} />
                      <View style={{ flex: 1 }}>
                        <Text style={st.laporanTitle}>{l.jenis}</Text>
                        <Text style={st.laporanSub}>{l.nama} • {(l as any).tanggal || (l as any).waktuKejadian || '-'}</Text>
                      </View>
                      <View style={{ alignItems: 'flex-end', gap: 4 }}>
                        <Badge text={l.prioritas} variant={l.prioritas === 'kritis' ? 'danger' : l.prioritas === 'tinggi' ? 'warning' : 'info'} />
                        <Badge text={l.status === 'approved' ? 'Disetujui' : l.status === 'pending' ? 'Pending' : 'Revisi'} variant={l.status === 'approved' ? 'success' : 'warning'} />
                      </View>
                    </View>
                  </Card>
                ))}
              </>
            )}
            {compLaporanH.length > 0 && (
              <>
                <Text style={st.subSection}>📋 Laporan Harian ({compLaporanH.length})</Text>
                {compLaporanH.map((l) => (
                  <Card key={l.id} style={st.laporanCard}>
                    <View style={st.laporanRow}>
                      <Ionicons name="document-text" size={20} color={Colors.warning} />
                      <View style={{ flex: 1 }}>
                        <Text style={st.laporanTitle}>Laporan {l.kondisi === 'aman' ? 'Aman' : l.kondisi === 'ada_masalah' ? 'Ada Masalah' : 'Perhatian Khusus'}</Text>
                        <Text style={st.laporanSub}>{l.nama} • {l.tanggal} • {l.shift}</Text>
                      </View>
                      <Badge text={l.status === 'approved' ? '✓' : l.status === 'pending' ? '⏳' : '↻'} variant={l.status === 'approved' ? 'success' : 'warning'} />
                    </View>
                  </Card>
                ))}
              </>
            )}
            {compLaporanH.length === 0 && compLaporanK.length === 0 && (
              <View style={st.empty}><Ionicons name="document-text-outline" size={40} color={Colors.textMuted} /><Text style={st.emptyText}>Belum ada laporan</Text></View>
            )}
          </>
        )}

        {/* === TAB: POS === */}
        {tab === 'Pos' && (
          <>
            <Text style={st.posHeader}>{company.posList.length} Pos Jaga • {compCheckpoints.length} Checkpoint</Text>
            {company.posList.map((p) => {
              const posMembers = members.filter((m) => m.pos === p.nama);
              return (
                <View key={p.id} style={st.posCard}>
                  <View style={st.posTop}>
                    <View style={[st.posIcon, { backgroundColor: p.status === 'active' ? Colors.successSoft : Colors.bgGray }]}>
                      <Ionicons name="location" size={20} color={p.status === 'active' ? Colors.success : Colors.textMuted} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={st.posName}>{p.nama}</Text>
                      <Text style={st.posRadius}>Radius: {p.radius}m • {posMembers.length} anggota</Text>
                    </View>
                    <Badge text={p.status === 'active' ? 'Aktif' : 'Nonaktif'} variant={p.status === 'active' ? 'success' : 'default'} />
                  </View>
                  {posMembers.length > 0 && (
                    <View style={st.posMembers}>
                      {posMembers.map((m) => {
                        const ms = STATUS_MAP[m.status] || STATUS_MAP.off_duty;
                        return (
                          <View key={m.id} style={st.posMember}>
                            <Image source={{ uri: m.foto }} style={st.posMemberAvatar} />
                            <Text style={st.posMemberName} numberOfLines={1}>{m.nama}</Text>
                            <View style={[st.miniDot, { backgroundColor: ms.color }]} />
                          </View>
                        );
                      })}
                    </View>
                  )}
                </View>
              );
            })}

            {/* Checkpoints */}
            {compCheckpoints.length > 0 && (
              <>
                <Text style={st.subSection}>📍 Checkpoint Patroli</Text>
                {compCheckpoints.map((c) => (
                  <View key={c.id} style={st.checkpointCard}>
                    <View style={st.cpIcon}><Ionicons name="qr-code" size={18} color={Colors.purple} /></View>
                    <View style={{ flex: 1 }}>
                      <Text style={st.cpName}>{c.nama}</Text>
                      <Text style={st.cpArea}>{c.area} • Radius {c.radius}m</Text>
                    </View>
                    <Badge text={c.status === 'active' ? 'Aktif' : 'Off'} variant={c.status === 'active' ? 'success' : 'default'} />
                  </View>
                ))}
              </>
            )}
          </>
        )}

        {/* Quick Actions */}
        <View style={st.actionsRow}>
          <TouchableOpacity style={[st.actionBtn, { backgroundColor: Colors.primary }]} onPress={() => navigation.navigate('BroadcastPesan')}>
            <Ionicons name="megaphone" size={18} color="#fff" />
            <Text style={st.actionText}>Broadcast</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[st.actionBtn, { backgroundColor: Colors.success }]} onPress={() => navigation.navigate('ValidasiLaporan')}>
            <Ionicons name="checkmark-done" size={18} color="#fff" />
            <Text style={st.actionText}>Validasi</Text>
          </TouchableOpacity>
          {/* <TouchableOpacity style={[st.actionBtn, { backgroundColor: Colors.warning }]} onPress={() => Alert.alert('📊', 'Membuka analitik untuk ' + company.nama)}>
            <Ionicons name="bar-chart" size={18} color="#fff" />
            <Text style={st.actionText}>Analytics</Text>
          </TouchableOpacity> */}
        </View>

        <View style={{ height: 32 }} />
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgLight },
  header: { backgroundColor: Colors.primaryDark, paddingTop: 48, paddingBottom: 16, paddingHorizontal: Spacing.lg, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  headerInfo: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  companyIconBg: { width: 48, height: 48, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  companyName: { fontSize: 18, fontWeight: '700', color: '#fff' },
  addrRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 },
  companyAddr: { fontSize: 11, color: 'rgba(255,255,255,0.55)', flex: 1 },
  statsRow: { flexDirection: 'row', gap: 8, marginTop: 14 },
  statCard: { flex: 1, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: Radius.md, padding: 10, alignItems: 'center', gap: 2 },
  statVal: { fontSize: 18, fontWeight: '800', color: '#fff' },
  statLabel: { fontSize: 9, color: 'rgba(255,255,255,0.55)' },
  tabRow: { flexDirection: 'row', backgroundColor: Colors.bgWhite, paddingHorizontal: Spacing.base, paddingTop: 8, gap: 4, ...Shadows.sm },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center', borderBottomWidth: 2.5, borderBottomColor: 'transparent', flexDirection: 'row', justifyContent: 'center', gap: 4 },
  tabActive: { borderBottomColor: Colors.primary },
  tabText: { fontSize: 13, fontWeight: '600', color: Colors.textMuted },
  tabTextActive: { color: Colors.primary },
  tabBadge: { backgroundColor: Colors.danger, borderRadius: 8, minWidth: 16, height: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  tabBadgeText: { color: '#fff', fontSize: 9, fontWeight: '700' },
  scroll: { padding: Spacing.base },
  // Tim
  memberCard: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Colors.bgWhite, borderRadius: Radius.lg, padding: 14, marginBottom: 8, ...Shadows.sm },
  memberAvatar: { width: 48, height: 48, borderRadius: 24 },
  statusDot: { position: 'absolute', left: 46, top: 48, width: 14, height: 14, borderRadius: 7, borderWidth: 2.5, borderColor: '#fff' },
  memberNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  memberName: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
  memberSub: { fontSize: 11, color: Colors.textMuted, marginTop: 1 },
  memberMeta: { flexDirection: 'row', gap: 8, marginTop: 4 },
  metaText: { fontSize: 10, color: Colors.textSecondary },
  memberRight: { alignItems: 'flex-end', gap: 4 },
  lastSeen: { fontSize: 10, color: Colors.textMuted },
  // Absensi
  absenSummary: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  absenStat: { flex: 1, backgroundColor: Colors.bgWhite, borderRadius: Radius.md, padding: 14, alignItems: 'center', borderLeftWidth: 3, ...Shadows.sm },
  absenVal: { fontSize: 22, fontWeight: '800' },
  absenLabel: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  absenCard: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Colors.bgWhite, borderRadius: Radius.md, padding: 12, marginBottom: 6, ...Shadows.sm },
  absenIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  absenName: { fontSize: 13, fontWeight: '600', color: Colors.textPrimary },
  absenDetail: { fontSize: 11, color: Colors.textMuted },
  // Laporan
  subSection: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary, marginBottom: 8, marginTop: 12 },
  laporanCard: { marginBottom: 8 },
  laporanRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  laporanTitle: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary },
  laporanSub: { fontSize: 11, color: Colors.textMuted, marginTop: 1 },
  // Pos
  posHeader: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary, marginBottom: 10 },
  posCard: { backgroundColor: Colors.bgWhite, borderRadius: Radius.lg, padding: 14, marginBottom: 8, ...Shadows.sm },
  posTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  posIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  posName: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
  posRadius: { fontSize: 11, color: Colors.textMuted },
  posMembers: { flexDirection: 'row', gap: 12, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: Colors.borderLight },
  posMember: { alignItems: 'center', gap: 3 },
  posMemberAvatar: { width: 32, height: 32, borderRadius: 16 },
  posMemberName: { fontSize: 10, color: Colors.textSecondary, width: 50, textAlign: 'center' },
  miniDot: { width: 8, height: 8, borderRadius: 4 },
  checkpointCard: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Colors.bgWhite, borderRadius: Radius.md, padding: 12, marginBottom: 6, ...Shadows.sm },
  cpIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: Colors.purpleSoft, alignItems: 'center', justifyContent: 'center' },
  cpName: { fontSize: 13, fontWeight: '600', color: Colors.textPrimary },
  cpArea: { fontSize: 11, color: Colors.textMuted },
  // Actions
  actionsRow: { flexDirection: 'row', gap: 8, marginTop: 16 },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: Radius.lg, padding: 14 },
  actionText: { fontSize: 12, fontWeight: '700', color: '#fff' },
  // Empty
  empty: { alignItems: 'center', paddingVertical: 32, gap: 8 },
  emptyText: { fontSize: 13, color: Colors.textMuted },
});
