import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Radius } from '../../constants';
import { Card, Badge, Button } from '../../components';
import { useDataStore } from '../../stores/dataStore';
import { useI18n } from '../../lib/i18n';
import { useTheme } from '../../lib/theme';

export default function SetupRuteScreen({ navigation }: any) {
  const { t } = useI18n();
  const { theme, isDark } = useTheme();
  const routes = useDataStore((s) => s.routes);
  const checkpoints = useDataStore((s) => s.checkpoints);
  const addRoute = useDataStore((s) => s.addRoute);
  const deleteRoute = useDataStore((s) => s.deleteRoute);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [selectedCps, setSelectedCps] = useState<string[]>([]);

  const handleAdd = () => {
    if (!newName.trim()) return Alert.alert('Error', 'Nama rute wajib diisi');
    if (selectedCps.length < 2) return Alert.alert('Error', 'Pilih minimal 2 checkpoint');
    addRoute({ nama: newName, checkpointIds: selectedCps, waktuEstimasi: selectedCps.length * 6, assignedShift: 'Semua', status: 'active' });
    setShowAdd(false); setNewName(''); setSelectedCps([]);
    Alert.alert('✅', 'Rute baru ditambahkan');
  };

  const toggleCp = (id: string) => setSelectedCps((prev) => prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]);

  return (
    <View style={st.container}>
      <View style={st.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={st.backBtn}><Ionicons name="arrow-back" size={24} color={Colors.textPrimary} /></TouchableOpacity>
        <Text style={st.headerTitle}>Setup Rute</Text>
        <TouchableOpacity onPress={() => setShowAdd(true)}><Ionicons name="add-circle" size={28} color={Colors.primary} /></TouchableOpacity>
      </View>
      <ScrollView contentContainerStyle={st.content}>
        {routes.map((r) => {
          const cpNames = r.checkpointIds.map((id) => checkpoints.find((c) => c.id === id)?.nama || id);
          return (
            <Card key={r.id} style={st.card} variant="bordered" borderColor={r.status === 'active' ? Colors.success : Colors.textMuted}>
              <View style={st.cardTop}>
                <Ionicons name="navigate" size={20} color={Colors.primary} />
                <Text style={st.routeName}>{r.nama}</Text>
                <Badge text={r.status === 'active' ? 'Aktif' : 'Off'} variant={r.status === 'active' ? 'success' : 'default'} />
              </View>
              <Text style={st.routeMeta}>{r.checkpointIds.length} checkpoint • ~{r.waktuEstimasi} menit • {r.assignedShift}</Text>
              <Text style={st.routeCps}>{cpNames.join(' → ')}</Text>
              <View style={st.cardActions}>
                <Button title="Edit" variant="outline" size="small" icon="create-outline" onPress={() => Alert.alert('Edit', `Edit rute ${r.nama} (simulasi)`)} style={{ flex: 1 }} />
                <Button title="Duplikat" variant="outline" size="small" icon="copy-outline" onPress={() => { addRoute({ ...r, nama: `${r.nama} (Copy)` }); Alert.alert('✅', 'Rute diduplikat'); }} style={{ flex: 1 }} />
                <Button title="Hapus" variant="outline" size="small" icon="trash-outline" onPress={() => Alert.alert('Hapus?', `Hapus "${r.nama}"?`, [{ text: 'Batal' }, { text: 'Hapus', style: 'destructive', onPress: () => deleteRoute(r.id) }])} style={{ flex: 1 }} textStyle={{ color: Colors.danger }} />
              </View>
            </Card>
          );
        })}
        <View style={{ height: 32 }} />
      </ScrollView>
      <Modal visible={showAdd} transparent animationType="slide">
        <View style={st.modalOverlay}>
          <View style={st.modalCard}>
            <Text style={st.modalTitle}>Tambah Rute Baru</Text>
            <Text style={st.fLabel}>Nama Rute *</Text>
            <TextInput style={st.fInput} value={newName} onChangeText={setNewName} placeholder="Nama rute patroli" placeholderTextColor={Colors.textMuted} />
            <Text style={st.fLabel}>Pilih Checkpoint (min 2)</Text>
            <ScrollView style={{ maxHeight: 200 }}>
              {checkpoints.map((cp) => (
                <TouchableOpacity key={cp.id} style={[st.cpRow, selectedCps.includes(cp.id) && st.cpRowActive]} onPress={() => toggleCp(cp.id)}>
                  <Ionicons name={selectedCps.includes(cp.id) ? 'checkbox' : 'square-outline'} size={20} color={selectedCps.includes(cp.id) ? Colors.primary : Colors.textMuted} />
                  <Text style={st.cpName}>{cp.nama} ({cp.area})</Text>
                  {selectedCps.includes(cp.id) && <Text style={st.cpOrder}>#{selectedCps.indexOf(cp.id) + 1}</Text>}
                </TouchableOpacity>
              ))}
            </ScrollView>
            <View style={st.modalActions}>
              <Button title="Batal" variant="outline" size="medium" onPress={() => setShowAdd(false)} style={{ flex: 1 }} />
              <Button title="Tambah" variant="primary" size="medium" onPress={handleAdd} style={{ flex: 1 }} />
            </View>
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
  content: { padding: Spacing.base },
  card: { marginBottom: 12 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  routeName: { ...Typography.bodyBold, color: Colors.textPrimary, flex: 1 },
  routeMeta: { ...Typography.caption, color: Colors.textMuted, marginBottom: 4 },
  routeCps: { ...Typography.caption, color: Colors.primary, fontWeight: '600' },
  cardActions: { flexDirection: 'row', gap: 6, marginTop: 10 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24 },
  modalTitle: { ...Typography.h3, color: Colors.textPrimary, marginBottom: 12 },
  fLabel: { ...Typography.smallBold, color: Colors.textSecondary, marginBottom: 4, marginTop: 10 },
  fInput: { borderWidth: 1.5, borderColor: Colors.border, borderRadius: Radius.md, paddingHorizontal: 14, height: 44, ...Typography.body, color: Colors.textPrimary },
  cpRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  cpRowActive: { backgroundColor: Colors.primaryBg },
  cpName: { ...Typography.body, color: Colors.textPrimary, flex: 1 },
  cpOrder: { ...Typography.smallBold, color: Colors.primary },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
});
