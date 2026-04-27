/**
 * UBAH PIN - JWT Auth
 * Verifies old PIN via signInWithPassword, then updateUser({ password })
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Radius } from '../../constants';
import { Card, Button } from '../../components';
import { useAuthStore } from '../../stores/authStore';
import { authApi } from '../../lib/apiClient';
import { useI18n } from '../../lib/i18n';
import { useTheme } from '../../lib/theme';

export default function UbahPINScreen({ navigation }: any) {
  const { t } = useI18n();
  const { theme, isDark } = useTheme();
  const user = useAuthStore((s) => s.user);
  const [pinLama, setPinLama] = useState('');
  const [pinBaru, setPinBaru] = useState('');
  const [konfirmasi, setKonfirmasi] = useState('');
  const [showLama, setShowLama] = useState(false);
  const [showBaru, setShowBaru] = useState(false);
  const [showKonfir, setShowKonfir] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const canSubmit = pinLama.length === 6 && pinBaru.length === 6 && konfirmasi.length === 6 && pinBaru === konfirmasi && !saving;

  const handleSave = async () => {
    setErrorMsg('');
    if (pinLama.length !== 6) return Alert.alert('Error', 'PIN lama harus 6 digit');
    if (pinBaru.length !== 6) return Alert.alert('Error', 'PIN baru harus 6 digit');
    if (pinBaru !== konfirmasi) return Alert.alert('Error', 'Konfirmasi PIN tidak cocok');
    if (pinLama === pinBaru) return Alert.alert('Error', 'PIN baru harus berbeda dari PIN lama');

    setSaving(true);
    try {
      // Step 1: Verify old PIN by re-signing in
      const nrp = user?.nrp || '';
      const email = `${nrp.toLowerCase().replace(/[^a-z0-9]/g, '')}@ptsss.app`;

      await authApi.changePin(pinLama, pinBaru);

      setSaving(false);
      Alert.alert('✅ Berhasil', 'PIN berhasil diubah. Gunakan PIN baru untuk login berikutnya.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (err: any) {
      setSaving(false);
      setErrorMsg(`Terjadi kesalahan: ${err.message || 'Unknown'}`);
    }
  };

  const PINField = ({ label, value, onChangeText, show, toggle }: any) => (
    <View style={st.fieldWrap}>
      <Text style={st.label}>{label}</Text>
      <View style={st.inputRow}>
        <TextInput
          style={st.input}
          value={value}
          onChangeText={(t: string) => { setErrorMsg(''); onChangeText(t.replace(/[^0-9]/g, '')); }}
          secureTextEntry={!show}
          keyboardType="number-pad"
          maxLength={6}
          placeholder="••••••"
          placeholderTextColor={Colors.textMuted}
        />
        <TouchableOpacity onPress={toggle} style={st.eyeBtn}>
          <Ionicons name={show ? 'eye-off' : 'eye'} size={20} color={Colors.textMuted} />
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={st.container}>
      <View style={st.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={st.backBtn}>
          <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={st.headerTitle}>Ubah PIN</Text>
        <View style={{ width: 40 }} />
      </View>
      <ScrollView contentContainerStyle={st.content} keyboardShouldPersistTaps="handled">
        <Card variant="bordered" borderColor={Colors.primary} style={{ marginBottom: 16 }}>
          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
            <Ionicons name="shield-checkmark" size={24} color={Colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={{ ...Typography.smallBold, color: Colors.primary }}>Tips Keamanan</Text>
              <Text style={{ ...Typography.caption, color: Colors.textMuted }}>
                Gunakan 6 digit PIN yang mudah diingat tapi sulit ditebak. Jangan gunakan tanggal lahir.
              </Text>
            </View>
          </View>
        </Card>

        <PINField label="PIN Lama" value={pinLama} onChangeText={setPinLama} show={showLama} toggle={() => setShowLama(!showLama)} />
        <PINField label="PIN Baru" value={pinBaru} onChangeText={setPinBaru} show={showBaru} toggle={() => setShowBaru(!showBaru)} />
        <PINField label="Konfirmasi PIN Baru" value={konfirmasi} onChangeText={setKonfirmasi} show={showKonfir} toggle={() => setShowKonfir(!showKonfir)} />

        {konfirmasi.length > 0 && pinBaru !== konfirmasi && (
          <Text style={{ ...Typography.caption, color: Colors.danger, marginTop: 4 }}>PIN tidak cocok</Text>
        )}
        {konfirmasi.length > 0 && pinBaru === konfirmasi && konfirmasi.length === 6 && (
          <Text style={{ ...Typography.caption, color: Colors.success, marginTop: 4 }}>✓ PIN cocok</Text>
        )}

        {errorMsg !== '' && (
          <Card variant="bordered" borderColor={Colors.danger} style={{ marginTop: 12, backgroundColor: Colors.dangerBg }}>
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
              <Ionicons name="alert-circle" size={18} color={Colors.danger} />
              <Text style={{ ...Typography.small, color: Colors.danger, flex: 1 }}>{errorMsg}</Text>
            </View>
          </Card>
        )}

        <Button title={saving ? 'Menyimpan...' : 'UBAH PIN'} variant="primary" size="large" fullWidth icon="key-outline" onPress={handleSave} disabled={!canSubmit} style={{ marginTop: 24 }} />
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgLight },
  header: { flexDirection: 'row', alignItems: 'center', paddingTop: 50, paddingBottom: 12, paddingHorizontal: Spacing.base, backgroundColor: Colors.bgWhite, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  headerTitle: { ...Typography.h3, color: Colors.textPrimary, flex: 1, textAlign: 'center' },
  content: { padding: Spacing.base },
  fieldWrap: { marginBottom: 14 },
  label: { ...Typography.smallBold, color: Colors.textSecondary, marginBottom: 6 },
  inputRow: { flexDirection: 'row', alignItems: 'center' },
  input: { flex: 1, borderWidth: 1.5, borderColor: Colors.border, borderRadius: Radius.md, paddingHorizontal: 14, height: 48, ...Typography.body, color: Colors.textPrimary, backgroundColor: Colors.bgWhite, letterSpacing: 8 },
  eyeBtn: { position: 'absolute', right: 12 },
});
