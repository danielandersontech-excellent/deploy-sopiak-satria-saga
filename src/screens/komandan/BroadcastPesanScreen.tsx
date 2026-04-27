/**
 * BROADCAST PESAN - v9 FIXED
 * Komandan hanya bisa broadcast ke anggota di perusahaan klien yang sama
 * Dark mode support + improved UI
 */
import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Radius } from '../../constants';
import { Card, Badge, Button } from '../../components';
import { useAuthStore } from '../../stores/authStore';
import { useDataStore } from '../../stores/dataStore';
import { dataApi } from '../../lib/apiClient';
import { useI18n } from '../../lib/i18n';
import { useTheme } from '../../lib/theme';

const BASE_TARGETS = ['Semua Anggota', 'Shift Pagi', 'Shift Siang', 'Shift Malam'];

export default function BroadcastPesanScreen({ navigation }: any) {
  const { t, lang } = useI18n();
  const { theme, isDark } = useTheme();
  const user = useAuthStore((s) => s.user);
  const addBroadcast = useDataStore((s) => s.addBroadcast);
  const broadcasts = useDataStore((s) => s.broadcasts);
  const team = useDataStore((s) => s.team);
  const allLokasi = useDataStore((s) => s.lokasi);

  // Komandan's lokasi - ONLY broadcast to their company
  const myLokasiId = user?.lokasi_id || null;
  const myLokasi = useMemo(() => {
    if (!myLokasiId) return null;
    return allLokasi.find(l => String(l.id) === String(myLokasiId));
  }, [allLokasi, myLokasiId]);
  const myLokasiNama = myLokasi?.nama || user?.lokasi_nama || (lang === 'en' ? 'My Location' : 'Lokasi Saya');

  // FIXED: Filter team strictly by lokasi_id
  const myTeam = useMemo(() => {
    if (!myLokasiId) return team;
    return team.filter(m => {
      const mLokId = String(m.lokasiId || (m as any).lokasi_id || '');
      return mLokId === String(myLokasiId);
    });
  }, [team, myLokasiId]);
  const teamCount = myTeam.length;

  const [judul, setJudul] = useState('');
  const [pesan, setPesan] = useState('');
  const [target, setTarget] = useState('Semua Anggota');
  const [prioritas, setPrioritas] = useState<'normal' | 'urgent'>('normal');
  const [submitting, setSubmitting] = useState(false);

  const handleSend = async () => {
    if (!judul.trim() || !pesan.trim()) return Alert.alert('Error', lang === 'en' ? 'Title and message are required' : 'Judul dan pesan wajib diisi');
    setSubmitting(true);
    try {
      // Call backend API with lokasi_id to restrict broadcast
      await dataApi.broadcasts.create({
        judul, pesan, prioritas,
        target: `${target} (${myLokasiNama})`,
        lokasi_id: myLokasiId, // CRITICAL: restrict to this lokasi only
      });
      addBroadcast({
        pengirim: user?.nama || 'Komandan',
        judul, pesan, prioritas,
        target: `${target} (${myLokasiNama})`,
        waktu: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
      });
      Alert.alert(
        '✅ ' + (lang === 'en' ? 'Message Sent' : 'Pesan Terkirim'),
        lang === 'en' ? `Broadcast to ${target} sent successfully` : `Broadcast ke ${target} berhasil dikirim`,
        [{ text: 'OK', onPress: () => { setJudul(''); setPesan(''); } }]
      );
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Gagal mengirim broadcast');
    }
    setSubmitting(false);
  };

  return (
    <KeyboardAvoidingView style={[s.container, { backgroundColor: theme.bg }]} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}>
      <View style={[s.header, { backgroundColor: theme.bgCard, borderBottomColor: theme.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}><Ionicons name="arrow-back" size={24} color={theme.text} /></TouchableOpacity>
        <Text style={[s.headerTitle, { color: theme.text }]}>Broadcast Pesan</Text>
        <View style={{ width: 40 }} />
      </View>
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        {/* Company info box */}
        <View style={[s.noteBox, { backgroundColor: isDark ? `${theme.primary}15` : '#EFF6FF', borderColor: isDark ? `${theme.primary}30` : '#BFDBFE' }]}>
          <Ionicons name="business" size={18} color={theme.primary} />
          <View style={{ flex: 1 }}>
            <Text style={[s.noteTitle, { color: theme.primary }]}>{myLokasiNama}</Text>
            <Text style={[s.noteText, { color: isDark ? theme.textMuted : Colors.primary }]}>
              {lang === 'en' ? `Broadcast to ${teamCount} members in this location only` : `Broadcast dikirim ke ${teamCount} anggota di lokasi ini`}
            </Text>
          </View>
        </View>

        <Text style={[s.fieldLabel, { color: theme.text }]}>Target</Text>
        <View style={s.chipRow}>
          {BASE_TARGETS.map((tgt) => (
            <TouchableOpacity key={tgt} style={[s.chip, { backgroundColor: theme.bgCard, borderColor: theme.border }, target === tgt && { backgroundColor: theme.primary, borderColor: theme.primary }]} onPress={() => setTarget(tgt)}>
              <Text style={[s.chipText, { color: theme.textSecondary }, target === tgt && { color: '#fff' }]}>{tgt}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={[s.fieldLabel, { color: theme.text }]}>Prioritas</Text>
        <View style={s.prioRow}>
          <TouchableOpacity style={[s.prioBtn, { backgroundColor: theme.bgCard, borderColor: theme.border }, prioritas === 'normal' && { backgroundColor: theme.primary, borderColor: theme.primary }]} onPress={() => setPrioritas('normal')}>
            <Ionicons name="chatbubble-outline" size={16} color={prioritas === 'normal' ? '#fff' : theme.primary} />
            <Text style={[s.prioText, { color: theme.textSecondary }, prioritas === 'normal' && { color: '#fff' }]}>Normal</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.prioBtn, { backgroundColor: theme.bgCard, borderColor: theme.border }, prioritas === 'urgent' && { backgroundColor: Colors.danger, borderColor: Colors.danger }]} onPress={() => setPrioritas('urgent')}>
            <Ionicons name="warning-outline" size={16} color={prioritas === 'urgent' ? '#fff' : Colors.danger} />
            <Text style={[s.prioText, { color: theme.textSecondary }, prioritas === 'urgent' && { color: '#fff' }]}>Urgent</Text>
          </TouchableOpacity>
        </View>

        <Text style={[s.fieldLabel, { color: theme.text }]}>Judul</Text>
        <TextInput style={[s.input, { borderColor: theme.border, backgroundColor: theme.bgInput, color: theme.text }]} value={judul} onChangeText={setJudul} placeholder={lang === 'en' ? 'Message title...' : 'Judul pesan...'} placeholderTextColor={theme.textMuted} />

        <Text style={[s.fieldLabel, { color: theme.text }]}>Pesan</Text>
        <TextInput style={[s.textarea, { borderColor: theme.border, backgroundColor: theme.bgInput, color: theme.text }]} multiline numberOfLines={6} textAlignVertical="top" value={pesan} onChangeText={setPesan} placeholder={lang === 'en' ? 'Write broadcast message...' : 'Tulis pesan broadcast...'} placeholderTextColor={theme.textMuted} />

        <Button title={submitting ? (lang === 'en' ? 'Sending...' : 'Mengirim...') : (lang === 'en' ? 'SEND BROADCAST' : 'KIRIM BROADCAST')} variant="primary" size="large" fullWidth icon="megaphone-outline" onPress={handleSend} disabled={submitting} style={{ marginTop: 16 }} />

        {broadcasts.length > 0 && (
          <>
            <Text style={[s.fieldLabel, { marginTop: 24, color: theme.text }]}>{lang === 'en' ? 'Broadcast History' : 'Riwayat Broadcast'}</Text>
            {broadcasts.map((b) => (
              <Card key={b.id} style={s.histCard}>
                <View style={s.histTop}>
                  <Badge text={b.prioritas === 'urgent' ? 'URGENT' : 'Normal'} variant={b.prioritas === 'urgent' ? 'danger' : 'info'} />
                  <Text style={[s.histTime, { color: theme.textMuted }]}>{b.waktu}</Text>
                </View>
                <Text style={[s.histTitle, { color: theme.text }]}>{b.judul}</Text>
                <Text style={[s.histMsg, { color: theme.textSecondary }]} numberOfLines={2}>{b.pesan}</Text>
                <Text style={[s.histTarget, { color: theme.primary }]}>→ {b.target}</Text>
              </Card>
            ))}
          </>
        )}
        <View style={{ height: 32 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingTop: 50, paddingBottom: 12, paddingHorizontal: Spacing.base, borderBottomWidth: 1 },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  headerTitle: { ...Typography.h3, flex: 1, textAlign: 'center' },
  content: { padding: Spacing.base },
  fieldLabel: { ...Typography.bodyBold, marginBottom: 8, marginTop: 12 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: Radius.full, borderWidth: 1.5 },
  chipText: { ...Typography.smallBold },
  prioRow: { flexDirection: 'row', gap: 10 },
  prioBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: Radius.md, borderWidth: 1.5 },
  prioText: { ...Typography.smallBold },
  input: { borderWidth: 1.5, borderRadius: Radius.md, paddingHorizontal: 14, height: 48, ...Typography.body },
  textarea: { borderWidth: 1.5, borderRadius: Radius.md, padding: 14, ...Typography.body, height: 120 },
  noteBox: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: Radius.md, marginBottom: 4, borderWidth: 1 },
  noteTitle: { fontWeight: '700', fontSize: 14 },
  noteText: { ...Typography.small, marginTop: 2 },
  histCard: { marginBottom: 8 },
  histTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  histTime: { ...Typography.caption },
  histTitle: { ...Typography.bodyBold },
  histMsg: { ...Typography.small, marginTop: 2 },
  histTarget: { ...Typography.caption, marginTop: 4 },
});
