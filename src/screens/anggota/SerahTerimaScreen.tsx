import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, Switch } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Radius } from '../../constants';
import { Card, Badge, Button } from '../../components';
import SignaturePad from '../../components/SignaturePad';
import { useAuthStore } from '../../stores/authStore';
import { useDataStore } from '../../stores/dataStore';
import { useTheme } from '../../lib/theme';
import { useI18n } from '../../lib/i18n';

const INVENTARIS_ITEMS = ['Radio HT', 'Senter', 'Kunci Pos Jaga', 'Buku Log', 'P3K Kit'];
const KONDISI = [
  { key: 'aman', label: '✅ Aman', color: Colors.success },
  { key: 'masalah', label: '⚠️ Masalah', color: Colors.warning },
  { key: 'perhatian', label: '🔴 Perhatian', color: Colors.danger },
] as const;

export default function SerahTerimaScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const user = useAuthStore((s) => s.user);
  const addSerahTerima = useDataStore((s) => s.addSerahTerima);
  const [kondisi, setKondisi] = useState<'aman' | 'masalah' | 'perhatian'>('aman');
  const [inventaris, setInventaris] = useState<Record<string, boolean>>(Object.fromEntries(INVENTARIS_ITEMS.map((i) => [i, true])));
  const [catatan, setCatatan] = useState('');
  const [signature, setSignature] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { theme } = useTheme();
  const { t } = useI18n();

  const handleSubmit = async () => {
    if (!signature) {
      Alert.alert('Tanda Tangan Diperlukan', 'Silakan tanda tangan digital sebelum mengirim serah terima.');
      return;
    }
    setSubmitting(true);
    // [3-1] Tunggu hasil API sebenarnya (hapus delay setTimeout palsu).
    // [3-3] Alirkan tanda tangan (signature) ke backend agar tersimpan.
    const res = await addSerahTerima({
      userId: user?.id || 'T1', nama: user?.nama || 'User', kondisiArea: kondisi,
      inventaris: INVENTARIS_ITEMS.map((nama) => ({ nama, tersedia: inventaris[nama] })),
      catatan, waktu: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
    }, signature);
    setSubmitting(false);

    if (res.status === 'error') {
      Alert.alert('Gagal', res.error || 'Server menolak serah terima. Silakan coba lagi.');
      return;
    }
    if (res.status === 'queued') {
      Alert.alert('Tersimpan', 'Tidak ada koneksi. Serah terima tersimpan & akan dikirim otomatis saat online.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
      return;
    }
    Alert.alert('✅ Serah Terima Berhasil', 'Shift berikutnya akan menerima notifikasi.', [
      { text: 'OK', onPress: () => navigation.goBack() },
    ]);
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}><Ionicons name="arrow-back" size={24} color={Colors.textPrimary} /></TouchableOpacity>
        <Text style={styles.headerTitle}>Serah Terima</Text>
        <View style={{ width: 40 }} />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.fieldLabel}>Kondisi Area</Text>
        <View style={styles.chipRow}>
          {KONDISI.map((k) => (
            <TouchableOpacity key={k.key} style={[styles.chip, kondisi === k.key && { backgroundColor: k.color, borderColor: k.color }]} onPress={() => setKondisi(k.key)}>
              <Text style={[styles.chipText, kondisi === k.key && { color: '#fff' }]}>{k.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.fieldLabel}>Checklist Inventaris</Text>
        <Card>
          {INVENTARIS_ITEMS.map((item, idx) => (
            <View key={item} style={[styles.invRow, idx < INVENTARIS_ITEMS.length - 1 && styles.invBorder]}>
              <Ionicons name={inventaris[item] ? 'checkmark-circle' : 'close-circle'} size={20} color={inventaris[item] ? Colors.success : Colors.danger} />
              <Text style={styles.invText}>{item}</Text>
              <Switch value={inventaris[item]} onValueChange={(v) => setInventaris({ ...inventaris, [item]: v })} trackColor={{ false: Colors.bgGray, true: Colors.successSoft }} thumbColor={inventaris[item] ? Colors.success : Colors.textMuted} />
            </View>
          ))}
        </Card>

        <Text style={styles.fieldLabel}>Catatan Khusus</Text>
        <TextInput style={styles.textarea} multiline numberOfLines={4} textAlignVertical="top" placeholder="Informasi penting untuk shift berikutnya..." placeholderTextColor={Colors.textMuted} value={catatan} onChangeText={setCatatan} />

        <Text style={styles.fieldLabel}>{t('handover.signature')}</Text>
        <SignaturePad
          onSign={(sig) => setSignature(sig)}
          label={t('handover.sign_here')}
          height={160}
        />
        {signature ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <Ionicons name="checkmark-circle" size={16} color={Colors.success} />
            <Text style={{ fontSize: 12, color: Colors.success, fontWeight: '600' }}>Tanda tangan tersimpan</Text>
          </View>
        ) : null}

        <Button title={submitting ? 'Mengirim...' : t('handover.submit').toUpperCase()} variant="primary" size="large" fullWidth icon="swap-horizontal-outline" onPress={handleSubmit} disabled={submitting || !signature} style={{ marginTop: 8 }} />
        <View style={{ height: 32 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgLight },
  header: { flexDirection: 'row', alignItems: 'center', paddingBottom: 12, paddingHorizontal: Spacing.base, backgroundColor: Colors.bgWhite, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  headerTitle: { ...Typography.h3, color: Colors.textPrimary, flex: 1, textAlign: 'center' },
  content: { padding: Spacing.base },
  fieldLabel: { ...Typography.bodyBold, color: Colors.textPrimary, marginBottom: 8, marginTop: 12 },
  chipRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  chip: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: Radius.md, borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.bgWhite },
  chipText: { ...Typography.smallBold, color: Colors.textPrimary },
  invRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
  invBorder: { borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  invText: { ...Typography.body, color: Colors.textPrimary, flex: 1 },
  textarea: { borderWidth: 1.5, borderColor: Colors.border, borderRadius: Radius.md, padding: 14, ...Typography.body, color: Colors.textPrimary, height: 100, backgroundColor: Colors.bgWhite },
});
