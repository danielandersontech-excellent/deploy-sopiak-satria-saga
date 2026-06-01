/**
 * BROADCAST PESAN - Komandan - v10 (Bug-Fix Pass)
 * Komandan hanya bisa broadcast ke anggota di perusahaan klien yang sama
 *
 * CRITICAL FIXES (v10):
 *  ðŸš¨ Removed DUPLICATE API call. Previously:
 *      1) handleSend â†’ dataApi.broadcasts.create({...lokasi_id})  (with scope)
 *      2) addBroadcast() in dataStore â†’ dataApi.broadcasts.create({...}) AGAIN
 *         (WITHOUT lokasi_id - so the duplicate copy is visible to everyone!)
 *     Result: 2 broadcasts created per send, second one not scope-restricted.
 *     New flow: API call once (with lokasi_id), then update local Zustand
 *     state directly via useDataStore.setState - no second API request.
 *
 *  âœ… setSubmitting moved to try/finally for guaranteed cleanup
 *  âœ… getField() used consistently for user fields (snake_case + camelCase)
 *  âœ… Disabled inputs while submitting (prevents double-tap submission)
 *  âœ… Error message localized
 *  âœ… Team count filter uses getField fallback (handles both casing)
 *  âœ… Defensive null-checks for user data
 *
 * PRIOR FIXES:
 *  - Komandan scoped to their lokasi_id only
 *  - Dark mode support
 *  - Improved UI with priority chips
 */
import React, { useState, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Radius } from '../../constants';
import { Card, Badge, Button } from '../../components';
import { useAuthStore } from '../../stores/authStore';
import { useDataStore } from '../../stores/dataStore';
import { dataApi } from '../../lib/apiClient';
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

const BASE_TARGETS_ID = ['Semua Anggota', 'Shift Pagi', 'Shift Siang', 'Shift Malam'];
const BASE_TARGETS_EN = ['All Members', 'Morning Shift', 'Day Shift', 'Night Shift'];

export default function BroadcastPesanScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const { lang } = useI18n();
  const { theme, isDark } = useTheme();
  const user = useAuthStore((s) => s.user);
  const broadcasts = useDataStore((s) => s.broadcasts);
  const team = useDataStore((s) => s.team);
  const allLokasi = useDataStore((s) => s.lokasi);

  // Komandan's lokasi - ONLY broadcast to their company
  const myLokasiId = getField(user, 'lokasi_id', 'lokasiId') || null;
  const myLokasi = useMemo(() => {
    if (!myLokasiId) return null;
    return allLokasi.find((l) => String(getField(l, 'id', '_id')) === String(myLokasiId));
  }, [allLokasi, myLokasiId]);

  const myLokasiNama =
    getField(myLokasi, 'nama', 'name') ||
    getField(user, 'lokasi_nama', 'lokasiNama') ||
    (lang === 'en' ? 'My Location' : 'Lokasi Saya');

  // Filter team strictly by lokasi_id (DB column)
  const myTeam = useMemo(() => {
    if (!myLokasiId) return team;
    return team.filter((m) => {
      const mLokId = String(getField(m, 'lokasi_id', 'lokasiId') || '');
      return mLokId === String(myLokasiId);
    });
  }, [team, myLokasiId]);
  const teamCount = myTeam.length;

  const BASE_TARGETS = lang === 'en' ? BASE_TARGETS_EN : BASE_TARGETS_ID;
  const defaultTarget = BASE_TARGETS[0];

  const [judul, setJudul] = useState('');
  const [pesan, setPesan] = useState('');
  const [target, setTarget] = useState<string>(defaultTarget);
  const [prioritas, setPrioritas] = useState<'normal' | 'urgent'>('normal');
  const [submitting, setSubmitting] = useState(false);

  // Keep target in sync when language changes (find equivalent in new array by index)
  useEffect(() => {
    const currentIdx = BASE_TARGETS_ID.indexOf(target);
    const altIdx = BASE_TARGETS_EN.indexOf(target);
    const idx = currentIdx >= 0 ? currentIdx : altIdx;
    if (idx >= 0 && idx < BASE_TARGETS.length && BASE_TARGETS[idx] !== target) {
      setTarget(BASE_TARGETS[idx]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);

  const handleSend = async () => {
    if (!judul.trim() || !pesan.trim()) {
      Alert.alert(
        'Error',
        lang === 'en' ? 'Title and message are required' : 'Judul dan pesan wajib diisi'
      );
      return;
    }
    if (submitting) return;

    setSubmitting(true);
    const targetWithLokasi = `${target} (${myLokasiNama})`;
    const senderName = getField(user, 'nama', 'name') || 'Komandan';
    const nowTime = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

    try {
      // Single API call with lokasi_id scope restriction
      await dataApi.broadcasts.create({
        judul: judul.trim(),
        pesan: pesan.trim(),
        prioritas,
        target: targetWithLokasi,
        lokasi_id: myLokasiId, // CRITICAL: restrict to this lokasi only
      });

      // CRITICAL FIX: Update local store DIRECTLY (no addBroadcast() call,
      // because addBroadcast triggers another API call WITHOUT lokasi_id).
      useDataStore.setState((s) => ({
        broadcasts: [
          {
            id: `tmp-${Date.now()}`,
            pengirim: senderName,
            judul: judul.trim(),
            pesan: pesan.trim(),
            prioritas,
            target: targetWithLokasi,
            waktu: nowTime,
          },
          ...s.broadcasts,
        ],
      }));

      Alert.alert(
        'âœ… ' + (lang === 'en' ? 'Message Sent' : 'Pesan Terkirim'),
        lang === 'en'
          ? `Broadcast to ${target} sent successfully`
          : `Broadcast ke ${target} berhasil dikirim`,
        [
          {
            text: 'OK',
            onPress: () => {
              setJudul('');
              setPesan('');
            },
          },
        ]
      );
    } catch (e: any) {
      console.log('[Broadcast] Send error:', e);
      Alert.alert(
        'Error',
        e?.message || (lang === 'en' ? 'Failed to send broadcast' : 'Gagal mengirim broadcast')
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[s.container, { backgroundColor: theme.bg }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
    >
      <View style={[s.header, { paddingTop: insets.top + 12 }, { backgroundColor: theme.bgCard, borderBottomColor: theme.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn} disabled={submitting}>
          <Ionicons name="arrow-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: theme.text }]}>
          {lang === 'en' ? 'Broadcast Message' : 'Broadcast Pesan'}
        </Text>
        <View style={{ width: 40 }} />
      </View>
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        {/* Company info box */}
        <View
          style={[
            s.noteBox,
            {
              backgroundColor: isDark ? `${theme.primary}15` : '#EFF6FF',
              borderColor: isDark ? `${theme.primary}30` : '#BFDBFE',
            },
          ]}
        >
          <Ionicons name="business" size={18} color={theme.primary} />
          <View style={{ flex: 1 }}>
            <Text style={[s.noteTitle, { color: theme.primary }]}>{myLokasiNama}</Text>
            <Text style={[s.noteText, { color: isDark ? theme.textMuted : Colors.primary }]}>
              {lang === 'en'
                ? `Broadcast to ${teamCount} members in this location only`
                : `Broadcast dikirim ke ${teamCount} anggota di lokasi ini`}
            </Text>
          </View>
        </View>

        <Text style={[s.fieldLabel, { color: theme.text }]}>Target</Text>
        <View style={s.chipRow}>
          {BASE_TARGETS.map((tgt) => (
            <TouchableOpacity
              key={tgt}
              style={[
                s.chip,
                { backgroundColor: theme.bgCard, borderColor: theme.border },
                target === tgt && { backgroundColor: theme.primary, borderColor: theme.primary },
              ]}
              onPress={() => !submitting && setTarget(tgt)}
              disabled={submitting}
            >
              <Text
                style={[
                  s.chipText,
                  { color: theme.textSecondary },
                  target === tgt && { color: '#fff' },
                ]}
              >
                {tgt}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={[s.fieldLabel, { color: theme.text }]}>
          {lang === 'en' ? 'Priority' : 'Prioritas'}
        </Text>
        <View style={s.prioRow}>
          <TouchableOpacity
            style={[
              s.prioBtn,
              { backgroundColor: theme.bgCard, borderColor: theme.border },
              prioritas === 'normal' && { backgroundColor: theme.primary, borderColor: theme.primary },
            ]}
            onPress={() => !submitting && setPrioritas('normal')}
            disabled={submitting}
          >
            <Ionicons
              name="chatbubble-outline"
              size={16}
              color={prioritas === 'normal' ? '#fff' : theme.primary}
            />
            <Text
              style={[
                s.prioText,
                { color: theme.textSecondary },
                prioritas === 'normal' && { color: '#fff' },
              ]}
            >
              Normal
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              s.prioBtn,
              { backgroundColor: theme.bgCard, borderColor: theme.border },
              prioritas === 'urgent' && { backgroundColor: Colors.danger, borderColor: Colors.danger },
            ]}
            onPress={() => !submitting && setPrioritas('urgent')}
            disabled={submitting}
          >
            <Ionicons
              name="warning-outline"
              size={16}
              color={prioritas === 'urgent' ? '#fff' : Colors.danger}
            />
            <Text
              style={[
                s.prioText,
                { color: theme.textSecondary },
                prioritas === 'urgent' && { color: '#fff' },
              ]}
            >
              Urgent
            </Text>
          </TouchableOpacity>
        </View>

        <Text style={[s.fieldLabel, { color: theme.text }]}>
          {lang === 'en' ? 'Title' : 'Judul'}
        </Text>
        <TextInput
          style={[
            s.input,
            { borderColor: theme.border, backgroundColor: theme.bgInput, color: theme.text },
          ]}
          value={judul}
          onChangeText={setJudul}
          placeholder={lang === 'en' ? 'Message title...' : 'Judul pesan...'}
          placeholderTextColor={theme.textMuted}
          editable={!submitting}
          maxLength={120}
        />

        <Text style={[s.fieldLabel, { color: theme.text }]}>
          {lang === 'en' ? 'Message' : 'Pesan'}
        </Text>
        <TextInput
          style={[
            s.textarea,
            { borderColor: theme.border, backgroundColor: theme.bgInput, color: theme.text },
          ]}
          multiline
          numberOfLines={6}
          textAlignVertical="top"
          value={pesan}
          onChangeText={setPesan}
          placeholder={
            lang === 'en' ? 'Write broadcast message...' : 'Tulis pesan broadcast...'
          }
          placeholderTextColor={theme.textMuted}
          editable={!submitting}
          maxLength={2000}
        />

        <Button
          title={
            submitting
              ? lang === 'en'
                ? 'Sending...'
                : 'Mengirim...'
              : lang === 'en'
              ? 'SEND BROADCAST'
              : 'KIRIM BROADCAST'
          }
          variant="primary"
          size="large"
          fullWidth
          icon="megaphone-outline"
          onPress={handleSend}
          disabled={submitting}
          loading={submitting}
          style={{ marginTop: 16 }}
        />

        {broadcasts.length > 0 && (
          <>
            <Text style={[s.fieldLabel, { marginTop: 24, color: theme.text }]}>
              {lang === 'en' ? 'Broadcast History' : 'Riwayat Broadcast'}
            </Text>
            {broadcasts.map((b) => (
              <Card key={b.id} style={s.histCard}>
                <View style={s.histTop}>
                  <Badge
                    text={b.prioritas === 'urgent' ? 'URGENT' : 'Normal'}
                    variant={b.prioritas === 'urgent' ? 'danger' : 'info'}
                  />
                  <Text style={[s.histTime, { color: theme.textMuted }]}>{b.waktu}</Text>
                </View>
                <Text style={[s.histTitle, { color: theme.text }]}>{b.judul}</Text>
                <Text style={[s.histMsg, { color: theme.textSecondary }]} numberOfLines={2}>
                  {b.pesan}
                </Text>
                <Text style={[s.histTarget, { color: theme.primary }]}>â†’ {b.target}</Text>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 12,
    paddingHorizontal: Spacing.base,
    borderBottomWidth: 1,
  },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  headerTitle: { ...Typography.h3, flex: 1, textAlign: 'center' },
  content: { padding: Spacing.base },
  fieldLabel: { ...Typography.bodyBold, marginBottom: 8, marginTop: 12 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: Radius.full, borderWidth: 1.5 },
  chipText: { ...Typography.smallBold },
  prioRow: { flexDirection: 'row', gap: 10 },
  prioBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: Radius.md,
    borderWidth: 1.5,
  },
  prioText: { ...Typography.smallBold },
  input: {
    borderWidth: 1.5,
    borderRadius: Radius.md,
    paddingHorizontal: 14,
    height: 48,
    ...Typography.body,
  },
  textarea: {
    borderWidth: 1.5,
    borderRadius: Radius.md,
    padding: 14,
    ...Typography.body,
    height: 120,
  },
  noteBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: Radius.md,
    marginBottom: 4,
    borderWidth: 1,
  },
  noteTitle: { fontWeight: '700', fontSize: 14 },
  noteText: { ...Typography.small, marginTop: 2 },
  histCard: { marginBottom: 8 },
  histTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  histTime: { ...Typography.caption },
  histTitle: { ...Typography.bodyBold },
  histMsg: { ...Typography.small, marginTop: 2 },
  histTarget: { ...Typography.caption, marginTop: 4 },
});
============================================================
