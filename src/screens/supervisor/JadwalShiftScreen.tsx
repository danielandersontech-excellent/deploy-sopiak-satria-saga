import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, Alert, Modal, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Radius } from '../../constants';
import { Card, Badge, Button } from '../../components';
import { useDataStore } from '../../stores/dataStore';
import { useI18n } from '../../lib/i18n';
import { useTheme } from '../../lib/theme';

const DAYS = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];
const DATES = ['02', '03', '04', '05', '06', '07', '08'];

export default function JadwalShiftScreen({ navigation }: any) {
  const { t } = useI18n();
  const { theme, isDark } = useTheme();
  const shifts = useDataStore((s) => s.shifts);
  const team = useDataStore((s) => s.team);
  const [selectedDay, setSelectedDay] = useState(5); // index for today (Sabtu)
  const [showAssign, setShowAssign] = useState(false);
  const [assignShiftId, setAssignShiftId] = useState('');

  const onDuty = team.filter((m) => m.status !== 'off_duty').length;
  const unassigned = team.filter((m) => !shifts.some((s) => s.anggota.some((a) => a.id === m.id)));

  const handleAssign = (memberId: string, memberName: string) => {
    Alert.alert('✅ Berhasil', `${memberName} di-assign ke shift (simulasi)`);
    setShowAssign(false);
  };

  return (
    <View style={st.container}>
      <View style={st.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={st.backBtn}><Ionicons name="arrow-back" size={24} color={Colors.textPrimary} /></TouchableOpacity>
        <Text style={st.headerTitle}>Jadwal Shift</Text>
        <View style={{ width: 40 }} />
      </View>
      {/* Week Calendar */}
      <View style={st.calRow}>
        {DAYS.map((d, i) => (
          <TouchableOpacity key={i} style={[st.dayCol, selectedDay === i && st.dayColActive]} onPress={() => setSelectedDay(i)}>
            <Text style={[st.dayText, selectedDay === i && { color: '#fff' }]}>{d}</Text>
            <Text style={[st.dateText, selectedDay === i && { color: '#fff', fontWeight: '700' }]}>{DATES[i]}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {/* Stats */}
      <View style={st.statsRow}>
        <View style={st.statItem}><Text style={[st.statVal, { color: Colors.primary }]}>{onDuty}</Text><Text style={st.statLbl}>Bertugas</Text></View>
        <View style={st.statItem}><Text style={[st.statVal, { color: Colors.success }]}>{shifts.length}</Text><Text style={st.statLbl}>Shift</Text></View>
        <View style={st.statItem}><Text style={[st.statVal, { color: unassigned.length > 0 ? Colors.danger : Colors.success }]}>{unassigned.length}</Text><Text style={st.statLbl}>Unassigned</Text></View>
      </View>
      <ScrollView contentContainerStyle={st.content}>
        {shifts.map((s) => (
          <Card key={s.id} style={st.shiftCard} variant="bordered" borderColor={s.color}>
            <View style={st.shiftHeader}>
              <View style={[st.shiftDot, { backgroundColor: s.color }]} />
              <Text style={st.shiftName}>{s.nama}</Text>
              <Text style={st.shiftTime}>{s.waktu}</Text>
            </View>
            {s.anggota.map((a) => (
              <View key={a.id} style={st.memberRow}>
                <Image source={{ uri: a.foto }} style={st.memberAvatar} />
                <View style={{ flex: 1 }}><Text style={st.memberName}>{a.nama}</Text><Text style={st.memberPos}>{a.pos}</Text></View>
                <TouchableOpacity onPress={() => Alert.alert('Swap', `Tukar jadwal ${a.nama} (simulasi)`)}><Ionicons name="swap-horizontal" size={18} color={Colors.primary} /></TouchableOpacity>
              </View>
            ))}
            <Button title="Tambah Anggota" variant="outline" size="small" icon="add-outline" onPress={() => { setAssignShiftId(s.id); setShowAssign(true); }} style={{ marginTop: 10 }} />
          </Card>
        ))}

        {unassigned.length > 0 && (
          <>
            <Text style={st.sectionTitle}>Belum Ter-assign ({unassigned.length})</Text>
            {unassigned.map((m) => (
              <Card key={m.id} style={st.unassignedCard}>
                <Text style={st.memberName}>{m.nama}</Text>
                <Text style={st.memberPos}>NRP: {m.nrp}</Text>
                <Button title="Assign" variant="primary" size="small" onPress={() => Alert.alert('Assign', `Assign ${m.nama} ke shift (simulasi)`)} style={{ marginTop: 8 }} />
              </Card>
            ))}
          </>
        )}
        <View style={{ height: 32 }} />
      </ScrollView>

      <Modal visible={showAssign} transparent animationType="slide">
        <View style={st.modalOverlay}>
          <View style={st.modalCard}>
            <Text style={st.modalTitle}>Pilih Anggota</Text>
            {team.slice(0, 5).map((m) => (
              <TouchableOpacity key={m.id} style={st.modalRow} onPress={() => handleAssign(m.id, m.nama)}>
                <Image source={{ uri: m.foto }} style={st.modalAvatar} />
                <View style={{ flex: 1 }}><Text style={st.memberName}>{m.nama}</Text><Text style={st.memberPos}>{m.nrp}</Text></View>
                <Ionicons name="add-circle" size={22} color={Colors.primary} />
              </TouchableOpacity>
            ))}
            <Button title="Tutup" variant="outline" size="medium" fullWidth onPress={() => setShowAssign(false)} style={{ marginTop: 12 }} />
          </View>
        </View>
      </Modal>
    </View>
  );
}
const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgLight },
  header: { flexDirection: 'row', alignItems: 'center', paddingTop: 50, paddingBottom: 12, paddingHorizontal: Spacing.base, backgroundColor: Colors.bgWhite, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  headerTitle: { ...Typography.h3, color: Colors.textPrimary, flex: 1, textAlign: 'center' },
  calRow: { flexDirection: 'row', paddingHorizontal: 8, paddingVertical: 10, backgroundColor: Colors.bgWhite, gap: 4 },
  dayCol: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: Radius.md },
  dayColActive: { backgroundColor: Colors.primary },
  dayText: { ...Typography.caption, color: Colors.textMuted },
  dateText: { ...Typography.bodyBold, color: Colors.textPrimary, marginTop: 2 },
  statsRow: { flexDirection: 'row', paddingHorizontal: Spacing.base, paddingVertical: 10, backgroundColor: Colors.bgWhite, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  statItem: { flex: 1, alignItems: 'center' },
  statVal: { fontSize: 20, fontWeight: '800' },
  statLbl: { ...Typography.caption, color: Colors.textMuted },
  content: { padding: Spacing.base },
  shiftCard: { marginBottom: 12 },
  shiftHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  shiftDot: { width: 12, height: 12, borderRadius: 6 },
  shiftName: { ...Typography.bodyBold, color: Colors.textPrimary, flex: 1 },
  shiftTime: { ...Typography.smallBold, color: Colors.textMuted },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  memberAvatar: { width: 36, height: 36, borderRadius: 18 },
  memberName: { ...Typography.bodyBold, color: Colors.textPrimary },
  memberPos: { ...Typography.caption, color: Colors.textMuted },
  sectionTitle: { ...Typography.h3, color: Colors.textPrimary, marginTop: 16, marginBottom: 8 },
  unassignedCard: { marginBottom: 8, padding: 12 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, maxHeight: '60%' },
  modalTitle: { ...Typography.h3, color: Colors.textPrimary, marginBottom: 12 },
  modalRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  modalAvatar: { width: 40, height: 40, borderRadius: 20 },
});
