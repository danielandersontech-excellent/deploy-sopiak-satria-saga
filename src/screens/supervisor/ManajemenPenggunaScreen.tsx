import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, TextInput, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Radius, Shadows } from '../../constants';
import { Card, Badge, Button } from '../../components';
import { useDataStore } from '../../stores/dataStore';
import { useI18n } from '../../lib/i18n';
import { useTheme } from '../../lib/theme';

export default function ManajemenPenggunaScreen({ navigation }: any) {
  const { t } = useI18n();
  const { theme, isDark } = useTheme();
  const team = useDataStore((s) => s.team);
  const removeTeamMember = useDataStore((s) => s.removeTeamMember);
  const [search, setSearch] = useState('');
  const filtered = search ? team.filter((m) => m.nama.toLowerCase().includes(search.toLowerCase()) || m.nrp.includes(search)) : team;

  const handleDelete = (id: string, nama: string) => {
    Alert.alert('Hapus Anggota?', `Yakin hapus ${nama}?`, [
      { text: 'Batal', style: 'cancel' },
      { text: 'Hapus', style: 'destructive', onPress: () => { removeTeamMember(id); Alert.alert('✅ Dihapus'); } },
    ]);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Kelola Pengguna</Text>
        <TouchableOpacity style={styles.addBtn} onPress={() => navigation.navigate('TambahEditUser')}>
          <Ionicons name="person-add" size={20} color="#fff" />
        </TouchableOpacity>
      </View>
      <View style={styles.searchRow}>
        <Ionicons name="search" size={18} color={Colors.textMuted} />
        <TextInput style={styles.searchInput} placeholder="Cari nama atau NRP..." placeholderTextColor={Colors.textMuted} value={search} onChangeText={setSearch} />
      </View>
      <Text style={styles.countText}>{filtered.length} pengguna</Text>
      <ScrollView contentContainerStyle={styles.content}>
        {filtered.map((m) => (
          <Card key={m.id} style={styles.userCard}>
            <View style={styles.userRow}>
              <Image source={{ uri: m.foto }} style={styles.avatar} />
              <View style={{ flex: 1 }}>
                <Text style={styles.userName}>{m.nama}</Text>
                <Text style={styles.userNrp}>NRP: {m.nrp} • {m.role}</Text>
                <Text style={styles.userPos}>{m.pos} • {m.shift}</Text>
              </View>
              <Badge text={m.status === 'off_duty' ? 'Off' : 'Active'} variant={m.status !== 'off_duty' ? 'success' : 'default'} />
            </View>
            <View style={styles.userActions}>
              <Button title="Edit" variant="outline" size="small" icon="create-outline" onPress={() => navigation.navigate('TambahEditUser', { userId: m.id })} style={{ flex: 1 }} />
              <Button title="Hapus" variant="outline" size="small" icon="trash-outline" onPress={() => handleDelete(m.id, m.nama)} style={{ flex: 1 }} textStyle={{ color: Colors.danger }} />
            </View>
          </Card>
        ))}
        <View style={{ height: 32 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgLight },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 50, paddingBottom: 12, paddingHorizontal: Spacing.base, backgroundColor: Colors.bgWhite },
  headerTitle: { ...Typography.h2, color: Colors.textPrimary },
  addBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: Spacing.base, marginVertical: 8, backgroundColor: Colors.bgGray, borderRadius: Radius.md, paddingHorizontal: 12, height: 42 },
  searchInput: { flex: 1, ...Typography.body, color: Colors.textPrimary },
  countText: { ...Typography.caption, color: Colors.textMuted, paddingHorizontal: Spacing.base, marginBottom: 8 },
  content: { paddingHorizontal: Spacing.base },
  userCard: { marginBottom: 10 },
  userRow: { flexDirection: 'row', gap: 12, alignItems: 'center', marginBottom: 10 },
  avatar: { width: 46, height: 46, borderRadius: 23 },
  userName: { ...Typography.bodyBold, color: Colors.textPrimary },
  userNrp: { ...Typography.caption, color: Colors.primary, fontWeight: '600' },
  userPos: { ...Typography.caption, color: Colors.textMuted },
  userActions: { flexDirection: 'row', gap: 8 },
});
