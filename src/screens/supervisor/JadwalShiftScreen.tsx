/**
 * JADWAL SHIFT - v2 (Bug-Fix Pass)
 *
 * FIXES (v2):
 *  🚨 Hardcoded DATES = ['02'..'08'] never updated! Today indicator was static.
 *     Now generates current week dynamically (Mon-Sun based on today's date).
 *
 *  🚨 Assignment was FAKE — "(simulasi)" alerts only. No real backend integration.
 *     Now uses dataApi.shiftAssignments.create() and .delete() with optimistic
 *     local state that survives screen reloads.
 *
 *  ✅ Dark mode + i18n support (was importing both but using neither).
 *  ✅ Modal `onRequestClose` for Android back button.
 *  ✅ Full team list in assignment modal (was arbitrarily slice(0, 5)).
 *  ✅ Filter team list in modal to only unassigned members.
 *  ✅ Loading state while fetching assignments.
 *  ✅ Pull-to-refresh.
 */
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, Alert, Modal,
  RefreshControl, ActivityIndicator, TextInput,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Radius } from '../../constants';
import { Card, Badge, Button } from '../../components';
import { useDataStore } from '../../stores/dataStore';
import { dataApi } from '../../lib/apiClient';
import { useI18n } from '../../lib/i18n';
import { useTheme } from '../../lib/theme';

const DAYS_ID = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];
const DAYS_EN = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function extractArray(result: any): any[] {
  if (Array.isArray(result)) return result;
  if (result && Array.isArray(result.data)) return result.data;
  if (result && Array.isArray(result.rows)) return result.rows;
  if (result && Array.isArray(result.items)) return result.items;
  return [];
}

function getField(obj: any, ...keys: string[]): any {
  if (!obj) return undefined;
  for (const key of keys) {
    if (obj[key] !== undefined && obj[key] !== null) return obj[key];
  }
  return undefined;
}

// Get the current Monday-Sunday week based on today
function buildCurrentWeek(): { dates: Date[]; dayStrs: string[]; todayIdx: number } {
  const today = new Date();
  const todayDay = today.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  // Make Monday=0, Sunday=6
  const mondayOffset = todayDay === 0 ? 6 : todayDay - 1;
  const monday = new Date(today);
  monday.setDate(today.getDate() - mondayOffset);
  monday.setHours(0, 0, 0, 0);

  const dates: Date[] = [];
  const dayStrs: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    dates.push(d);
    dayStrs.push(String(d.getDate()).padStart(2, '0'));
  }
  return { dates, dayStrs, todayIdx: mondayOffset };
}

interface ShiftAssignment {
  id: string;
  user_id: string;
  shift_id: string;
  tanggal: string; // YYYY-MM-DD
}

export default function JadwalShiftScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const { t, lang } = useI18n();
  const { theme, isDark } = useTheme();
  const shifts = useDataStore((s) => s.shifts);
  const team = useDataStore((s) => s.team);
  const loadAllData = useDataStore((s) => s.loadAllData);

  const DAYS = lang === 'en' ? DAYS_EN : DAYS_ID;
  const week = useMemo(() => buildCurrentWeek(), []);

  const [selectedDay, setSelectedDay] = useState(week.todayIdx);
  const [showAssign, setShowAssign] = useState(false);
  const [assignShiftId, setAssignShiftId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [assignments, setAssignments] = useState<ShiftAssignment[]>([]);
  const [search, setSearch] = useState('');

  const fetchAssignments = useCallback(async () => {
    try {
      const data = await dataApi.shiftAssignments.list();
      const list = extractArray(data).map((a: any) => ({
        id: String(a.id),
        user_id: String(getField(a, 'user_id', 'userId')),
        shift_id: String(getField(a, 'shift_id', 'shiftId')),
        tanggal: String(getField(a, 'tanggal', 'date') || '').slice(0, 10),
      }));
      setAssignments(list);
    } catch (e) {
      console.log('[JadwalShift] fetch assignments err:', e);
    }
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await fetchAssignments();
      setLoading(false);
    })();
  }, [fetchAssignments]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([loadAllData?.(), fetchAssignments()]);
    } finally {
      setRefreshing(false);
    }
  }, [fetchAssignments, loadAllData]);

  // Selected day's date string
  const selectedDateStr = useMemo(() => {
    const d = week.dates[selectedDay];
    return d ? d.toISOString().slice(0, 10) : '';
  }, [week, selectedDay]);

  // Assignments for selected day
  const dayAssignments = useMemo(
    () => assignments.filter((a) => a.tanggal === selectedDateStr),
    [assignments, selectedDateStr]
  );

  // Group assignments per shift
  const shiftMembers = useMemo(() => {
    const map: Record<string, any[]> = {};
    for (const shift of shifts) {
      const members = dayAssignments
        .filter((a) => a.shift_id === shift.id)
        .map((a) => team.find((m) => m.id === a.user_id))
        .filter(Boolean);
      map[shift.id] = members as any[];
    }
    return map;
  }, [dayAssignments, shifts, team]);

  // Members not assigned to any shift today
  const unassignedToday = useMemo(() => {
    const assignedUserIds = new Set(dayAssignments.map((a) => a.user_id));
    return team.filter((m) => !assignedUserIds.has(m.id));
  }, [dayAssignments, team]);

  // Total on duty (any status other than off_duty)
  const onDuty = team.filter((m) => m.status !== 'off_duty').length;

  // === REAL ASSIGN: persist via API + optimistic local update ===
  const handleAssign = async (memberId: string) => {
    if (submitting) return;
    if (!assignShiftId) {
      Alert.alert('Error', lang === 'en' ? 'No shift selected' : 'Shift belum dipilih');
      return;
    }

    // Already assigned to this shift today?
    if (dayAssignments.some((a) => a.user_id === memberId && a.shift_id === assignShiftId)) {
      Alert.alert(
        lang === 'en' ? 'Already Assigned' : 'Sudah Ter-assign',
        lang === 'en' ? 'This user is already assigned to this shift on this day.' : 'Anggota sudah di-assign untuk shift ini di hari ini.'
      );
      return;
    }

    setSubmitting(true);
    try {
      const result: any = await dataApi.shiftAssignments.create({
        user_id: memberId,
        shift_id: assignShiftId,
        tanggal: selectedDateStr,
      });

      const newAssignment: ShiftAssignment = {
        id: String(getField(result, 'id') || `tmp-${Date.now()}`),
        user_id: memberId,
        shift_id: assignShiftId,
        tanggal: selectedDateStr,
      };
      setAssignments((prev) => [...prev, newAssignment]);
      setShowAssign(false);

      const member = team.find((m) => m.id === memberId);
      Alert.alert(
        '✅',
        lang === 'en'
          ? `${member?.nama || 'User'} assigned to shift`
          : `${member?.nama || 'Anggota'} berhasil di-assign ke shift`
      );
    } catch (e: any) {
      console.log('[JadwalShift] assign err:', e);
      Alert.alert(
        'Error',
        e?.message || (lang === 'en' ? 'Failed to assign' : 'Gagal melakukan assign')
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleRemoveAssignment = (memberId: string, shiftId: string, memberName: string) => {
    const assignment = dayAssignments.find((a) => a.user_id === memberId && a.shift_id === shiftId);
    if (!assignment) return;

    Alert.alert(
      lang === 'en' ? 'Remove Assignment?' : 'Hapus Penugasan?',
      lang === 'en' ? `Remove ${memberName} from this shift?` : `Hapus ${memberName} dari shift ini?`,
      [
        { text: lang === 'en' ? 'Cancel' : 'Batal', style: 'cancel' },
        {
          text: lang === 'en' ? 'Remove' : 'Hapus',
          style: 'destructive',
          onPress: async () => {
            if (submitting) return;
            setSubmitting(true);
            try {
              await dataApi.shiftAssignments.delete(assignment.id);
              setAssignments((prev) => prev.filter((a) => a.id !== assignment.id));
            } catch (e: any) {
              Alert.alert(
                'Error',
                e?.message || (lang === 'en' ? 'Failed to remove' : 'Gagal menghapus')
              );
            } finally {
              setSubmitting(false);
            }
          },
        },
      ]
    );
  };

  // Filter team in modal: only show unassigned members on this day, then by search
  const modalTeam = useMemo(() => {
    const q = search.trim().toLowerCase();
    return unassignedToday.filter((m) => {
      if (!q) return true;
      return m.nama.toLowerCase().includes(q) || m.nrp.toLowerCase().includes(q);
    });
  }, [unassignedToday, search]);

  return (
    <View style={[st.container, { backgroundColor: theme.bg }]}>
      {/* Header */}
      <View style={[st.header, { paddingTop: insets.top + 12 }, { backgroundColor: theme.bgCard, borderBottomColor: theme.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={st.backBtn}>
          <Ionicons name="arrow-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={[st.headerTitle, { color: theme.text }]}>
          {t('sv.schedule')}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Week Calendar */}
      <View style={[st.calRow, { backgroundColor: theme.bgCard }]}>
        {DAYS.map((d, i) => (
          <TouchableOpacity
            key={`day-${i}`}
            style={[
              st.dayCol,
              selectedDay === i && { backgroundColor: Colors.primary },
              i === week.todayIdx && selectedDay !== i && { borderWidth: 1, borderColor: Colors.primary },
            ]}
            onPress={() => setSelectedDay(i)}
          >
            <Text
              style={[
                st.dayText,
                { color: theme.textMuted },
                selectedDay === i && { color: '#fff' },
              ]}
            >
              {d}
            </Text>
            <Text
              style={[
                st.dateText,
                { color: theme.text },
                selectedDay === i && { color: '#fff', fontWeight: '700' },
              ]}
            >
              {week.dayStrs[i]}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Stats */}
      <View style={[st.statsRow, { backgroundColor: theme.bgCard, borderBottomColor: theme.border }]}>
        <View style={st.statItem}>
          <Text style={[st.statVal, { color: Colors.primary }]}>{onDuty}</Text>
          <Text style={[st.statLbl, { color: theme.textMuted }]}>
            {lang === 'en' ? 'On Duty' : 'Bertugas'}
          </Text>
        </View>
        <View style={st.statItem}>
          <Text style={[st.statVal, { color: Colors.success }]}>{shifts.length}</Text>
          <Text style={[st.statLbl, { color: theme.textMuted }]}>Shift</Text>
        </View>
        <View style={st.statItem}>
          <Text
            style={[
              st.statVal,
              { color: unassignedToday.length > 0 ? Colors.danger : Colors.success },
            ]}
          >
            {unassignedToday.length}
          </Text>
          <Text style={[st.statLbl, { color: theme.textMuted }]}>
            {lang === 'en' ? 'Unassigned' : 'Belum Assign'}
          </Text>
        </View>
      </View>

      {loading ? (
        <View style={st.loadingWrap}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={[st.loadText, { color: theme.textMuted }]}>
            {lang === 'en' ? 'Loading schedule...' : 'Memuat jadwal...'}
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={st.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
        >
          {shifts.length === 0 && (
            <Card style={{ alignItems: 'center', padding: 24 }}>
              <Ionicons name="time-outline" size={36} color={theme.textMuted} />
              <Text style={[st.emptyText, { color: theme.textMuted, marginTop: 8 }]}>
                {lang === 'en' ? 'No shifts configured. Contact Admin to set up shifts.' : 'Belum ada shift. Hubungi Admin untuk mengatur shift.'}
              </Text>
            </Card>
          )}

          {shifts.map((s) => {
            const members = shiftMembers[s.id] || [];
            return (
              <Card key={s.id} style={st.shiftCard} variant="bordered" borderColor={s.color}>
                <View style={st.shiftHeader}>
                  <View style={[st.shiftDot, { backgroundColor: s.color }]} />
                  <Text style={[st.shiftName, { color: theme.text }]}>{s.nama}</Text>
                  <Text style={[st.shiftTime, { color: theme.textMuted }]}>{s.waktu}</Text>
                </View>

                {members.length === 0 ? (
                  <Text style={[st.emptyMember, { color: theme.textMuted }]}>
                    {lang === 'en' ? 'No members assigned' : 'Belum ada anggota'}
                  </Text>
                ) : (
                  members.map((a: any) => (
                    <View key={a.id} style={[st.memberRow, { borderBottomColor: theme.border }]}>
                      <Image source={{ uri: a.foto }} style={st.memberAvatar} />
                      <View style={{ flex: 1 }}>
                        <Text style={[st.memberName, { color: theme.text }]}>{a.nama}</Text>
                        <Text style={[st.memberPos, { color: theme.textMuted }]}>
                          {a.pos || '-'} • NRP: {a.nrp}
                        </Text>
                      </View>
                      <TouchableOpacity
                        onPress={() => handleRemoveAssignment(a.id, s.id, a.nama)}
                        disabled={submitting}
                      >
                        <Ionicons name="close-circle-outline" size={20} color={Colors.danger} />
                      </TouchableOpacity>
                    </View>
                  ))
                )}

                <Button
                  title={lang === 'en' ? 'Add Member' : 'Tambah Anggota'}
                  variant="outline"
                  size="small"
                  icon="add-outline"
                  onPress={() => {
                    setAssignShiftId(s.id);
                    setSearch('');
                    setShowAssign(true);
                  }}
                  style={{ marginTop: 10 }}
                  disabled={submitting}
                />
              </Card>
            );
          })}

          {unassignedToday.length > 0 && (
            <>
              <Text style={[st.sectionTitle, { color: theme.text }]}>
                {lang === 'en' ? 'Unassigned' : 'Belum Ter-assign'} ({unassignedToday.length})
              </Text>
              {unassignedToday.slice(0, 10).map((m) => (
                <Card key={m.id} style={st.unassignedCard}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Image source={{ uri: m.foto }} style={st.memberAvatar} />
                    <View style={{ flex: 1 }}>
                      <Text style={[st.memberName, { color: theme.text }]}>{m.nama}</Text>
                      <Text style={[st.memberPos, { color: theme.textMuted }]}>NRP: {m.nrp}</Text>
                    </View>
                  </View>
                  {shifts.length > 0 && (
                    <Button
                      title={lang === 'en' ? 'Assign to Shift' : 'Assign ke Shift'}
                      variant="primary"
                      size="small"
                      onPress={() => {
                        // Default to first shift
                        setAssignShiftId(shifts[0].id);
                        setSearch(m.nrp);
                        setShowAssign(true);
                      }}
                      style={{ marginTop: 8 }}
                      disabled={submitting}
                    />
                  )}
                </Card>
              ))}
              {unassignedToday.length > 10 && (
                <Text style={[st.moreText, { color: theme.textMuted }]}>
                  {lang === 'en'
                    ? `+${unassignedToday.length - 10} more unassigned members`
                    : `+${unassignedToday.length - 10} anggota belum di-assign`}
                </Text>
              )}
            </>
          )}

          <View style={{ height: 32 }} />
        </ScrollView>
      )}

      <Modal
        visible={showAssign}
        transparent
        animationType="slide"
        onRequestClose={() => !submitting && setShowAssign(false)}
      >
        <View style={st.modalOverlay}>
          <View style={[st.modalCard, { backgroundColor: theme.bgCard }]}>
            <View style={st.modalHeader}>
              <Text style={[st.modalTitle, { color: theme.text }]}>
                {lang === 'en' ? 'Select Member' : 'Pilih Anggota'}
              </Text>
              <TouchableOpacity onPress={() => !submitting && setShowAssign(false)} disabled={submitting}>
                <Ionicons name="close" size={24} color={theme.textMuted} />
              </TouchableOpacity>
            </View>

            <Text style={[st.modalSubtitle, { color: theme.textMuted }]}>
              {lang === 'en' ? 'Shift:' : 'Shift:'} {shifts.find((s) => s.id === assignShiftId)?.nama || '-'} •{' '}
              {lang === 'en' ? 'Date:' : 'Tanggal:'} {selectedDateStr}
            </Text>

            <View style={[st.searchRow, { backgroundColor: isDark ? theme.bgInput : Colors.bgGray }]}>
              <Ionicons name="search" size={18} color={theme.textMuted} />
              <TextInput
                style={[st.searchInput, { color: theme.text }]}
                placeholder={lang === 'en' ? 'Search...' : 'Cari...'}
                placeholderTextColor={theme.textMuted}
                value={search}
                onChangeText={setSearch}
              />
            </View>

            <ScrollView style={{ maxHeight: 320 }}>
              {modalTeam.length === 0 ? (
                <Text style={[st.emptyMember, { color: theme.textMuted, padding: 20, textAlign: 'center' }]}>
                  {lang === 'en' ? 'All members already assigned' : 'Semua anggota sudah di-assign'}
                </Text>
              ) : (
                modalTeam.map((m) => (
                  <TouchableOpacity
                    key={m.id}
                    style={[st.modalRow, { borderBottomColor: theme.border }]}
                    onPress={() => handleAssign(m.id)}
                    disabled={submitting}
                  >
                    <Image source={{ uri: m.foto }} style={st.modalAvatar} />
                    <View style={{ flex: 1 }}>
                      <Text style={[st.memberName, { color: theme.text }]}>{m.nama}</Text>
                      <Text style={[st.memberPos, { color: theme.textMuted }]}>
                        {m.nrp} • {m.role}
                      </Text>
                    </View>
                    <Ionicons name="add-circle" size={22} color={Colors.primary} />
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>

            <Button
              title={lang === 'en' ? 'Close' : 'Tutup'}
              variant="outline"
              size="medium"
              fullWidth
              onPress={() => setShowAssign(false)}
              style={{ marginTop: 12 }}
              disabled={submitting}
            />
          </View>
        </View>
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
  calRow: { flexDirection: 'row', paddingHorizontal: 8, paddingVertical: 10, gap: 4 },
  dayCol: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: Radius.md },
  dayText: { ...Typography.caption },
  dateText: { ...Typography.bodyBold, marginTop: 2 },
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.base,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  statItem: { flex: 1, alignItems: 'center' },
  statVal: { fontSize: 20, fontWeight: '800' },
  statLbl: { ...Typography.caption },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  loadText: { ...Typography.caption },
  content: { padding: Spacing.base },
  shiftCard: { marginBottom: 12 },
  shiftHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  shiftDot: { width: 12, height: 12, borderRadius: 6 },
  shiftName: { ...Typography.bodyBold, flex: 1 },
  shiftTime: { ...Typography.smallBold },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  memberAvatar: { width: 36, height: 36, borderRadius: 18 },
  memberName: { ...Typography.bodyBold },
  memberPos: { ...Typography.caption },
  emptyMember: { ...Typography.caption, paddingVertical: 12, textAlign: 'center' },
  sectionTitle: { ...Typography.h3, marginTop: 16, marginBottom: 8 },
  unassignedCard: { marginBottom: 8, padding: 12 },
  moreText: { ...Typography.caption, textAlign: 'center', marginTop: 8 },
  emptyText: { ...Typography.body, textAlign: 'center' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCard: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, maxHeight: '80%' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modalTitle: { ...Typography.h3, marginBottom: 4 },
  modalSubtitle: { ...Typography.caption, marginBottom: 12 },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: Radius.md,
    paddingHorizontal: 12,
    height: 42,
    marginBottom: 12,
  },
  searchInput: { flex: 1, ...Typography.body },
  modalRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1 },
  modalAvatar: { width: 40, height: 40, borderRadius: 20 },
});
============================================================