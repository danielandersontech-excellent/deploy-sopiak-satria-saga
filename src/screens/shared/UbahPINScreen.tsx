/**
 * UBAH PIN - v2 (Bug-Fix Pass)
 *
 * FIXES (v2):
 *  ðŸš¨ PINField was defined INSIDE the render function â€” React recreates the
 *     component on every render, causing the TextInput to LOSE FOCUS on every
 *     keystroke. User couldn't type a 6-digit PIN! Moved PINField OUTSIDE the
 *     component to fix focus retention.
 *  ðŸš¨ Dead code removed â€” `nrp` and `email` variables were leftover from legacy
 *     Supabase email-auth flow; the actual call is `authApi.changePin(old, new)`.
 *
 *  âœ… Dark mode support (was importing useTheme but using Colors directly).
 *  âœ… i18n support (was importing useI18n but using hardcoded Indonesian).
 *  âœ… Unsaved-changes warning when navigating back (prevents losing typed PIN).
 *  âœ… KeyboardAvoidingView so keyboard doesn't cover input fields.
 *  âœ… Submitting state on save button to prevent double-tap.
 *  âœ… Empty error state when user starts typing again.
 *  âœ… Visual indicator when PIN is being shown (eye toggle).
 *  âœ… Live validation feedback.
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Radius } from '../../constants';
import { Card, Button } from '../../components';
import { useAuthStore } from '../../stores/authStore';
import { authApi } from '../../lib/apiClient';
import { useI18n } from '../../lib/i18n';
import { useTheme } from '../../lib/theme';

interface PINFieldProps {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  show: boolean;
  toggle: () => void;
  editable?: boolean;
  theme: any;
  isDark: boolean;
}

// CRITICAL FIX: Defined OUTSIDE the render function so React doesn't recreate
// the component on every keystroke (which made the TextInput lose focus).
function PINField({ label, value, onChangeText, show, toggle, editable = true, theme, isDark }: PINFieldProps) {
  return (
    <View style={st.fieldWrap}>
      <Text style={[st.label, { color: theme.textSecondary }]}>{label}</Text>
      <View style={st.inputRow}>
        <TextInput
          style={[
            st.input,
            {
              borderColor: theme.border,
              color: theme.text,
              backgroundColor: isDark ? theme.bgInput : Colors.bgWhite,
            },
          ]}
          value={value}
          onChangeText={(txt: string) => onChangeText(txt.replace(/[^0-9]/g, ''))}
          secureTextEntry={!show}
          keyboardType="number-pad"
          maxLength={6}
          placeholder="â€¢â€¢â€¢â€¢â€¢â€¢"
          placeholderTextColor={theme.textMuted}
          editable={editable}
        />
        <TouchableOpacity onPress={toggle} style={st.eyeBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Ionicons name={show ? 'eye-off' : 'eye'} size={20} color={theme.textMuted} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function UbahPINScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const { t, lang } = useI18n();
  const { theme, isDark } = useTheme();
  const [pinLama, setPinLama] = useState('');
  const [pinBaru, setPinBaru] = useState('');
  const [konfirmasi, setKonfirmasi] = useState('');
  const [showLama, setShowLama] = useState(false);
  const [showBaru, setShowBaru] = useState(false);
  const [showKonfir, setShowKonfir] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const hasInput = pinLama.length > 0 || pinBaru.length > 0 || konfirmasi.length > 0;
  const canSubmit =
    pinLama.length === 6 &&
    pinBaru.length === 6 &&
    konfirmasi.length === 6 &&
    pinBaru === konfirmasi &&
    pinLama !== pinBaru &&
    !saving;

  // Warn about unsaved changes when leaving
  useEffect(() => {
    const sub = navigation.addListener('beforeRemove', (e: any) => {
      if (!hasInput || saving) return; // OK to leave
      e.preventDefault();
      Alert.alert(
        lang === 'en' ? 'Discard changes?' : 'Buang Perubahan?',
        lang === 'en'
          ? 'You have typed PIN values. Are you sure you want to leave?'
          : 'Anda sudah mengetik PIN. Yakin ingin keluar?',
        [
          { text: lang === 'en' ? 'Cancel' : 'Batal', style: 'cancel' },
          {
            text: lang === 'en' ? 'Leave' : 'Keluar',
            style: 'destructive',
            onPress: () => navigation.dispatch(e.data.action),
          },
        ]
      );
    });
    return sub;
  }, [navigation, hasInput, saving, lang]);

  // Clear error when user types
  const wrapSet = useCallback((setter: (v: string) => void) => (v: string) => {
    if (errorMsg) setErrorMsg('');
    setter(v);
  }, [errorMsg]);

  const handleSave = async () => {
    setErrorMsg('');
    if (pinLama.length !== 6) {
      return Alert.alert('Error', lang === 'en' ? 'Current PIN must be 6 digits' : 'PIN lama harus 6 digit');
    }
    if (pinBaru.length !== 6) {
      return Alert.alert('Error', lang === 'en' ? 'New PIN must be 6 digits' : 'PIN baru harus 6 digit');
    }
    if (pinBaru !== konfirmasi) {
      return Alert.alert('Error', lang === 'en' ? 'PIN confirmation mismatch' : 'Konfirmasi PIN tidak cocok');
    }
    if (pinLama === pinBaru) {
      return Alert.alert(
        'Error',
        lang === 'en' ? 'New PIN must differ from current PIN' : 'PIN baru harus berbeda dari PIN lama'
      );
    }

    setSaving(true);
    try {
      await authApi.changePin(pinLama, pinBaru);
      setSaving(false);
      // Reset so beforeRemove guard doesn't trigger on success path
      setPinLama('');
      setPinBaru('');
      setKonfirmasi('');
      Alert.alert(
        'âœ… ' + (lang === 'en' ? 'Success' : 'Berhasil'),
        lang === 'en'
          ? 'PIN changed successfully. Use the new PIN for your next login.'
          : 'PIN berhasil diubah. Gunakan PIN baru untuk login berikutnya.',
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
    } catch (err: any) {
      setSaving(false);
      const raw = String(err?.message || '');
      // Translate common errors
      let msg = raw;
      if (/pin.*lama.*salah|incorrect|wrong/i.test(raw)) {
        msg = lang === 'en' ? 'Current PIN is incorrect' : 'PIN lama salah';
      } else if (/network|fetch|timeout/i.test(raw)) {
        msg = lang === 'en'
          ? 'Network error. Check your connection.'
          : 'Gagal konek ke server. Cek koneksi internet.';
      }
      setErrorMsg(msg || (lang === 'en' ? 'Failed to change PIN' : 'Gagal mengubah PIN'));
    }
  };

  return (
    <View style={[st.container, { backgroundColor: theme.bg }]}>
      <View style={[st.header, { paddingTop: insets.top + 12 }, { backgroundColor: theme.bgCard, borderBottomColor: theme.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={st.backBtn}>
          <Ionicons name="arrow-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={[st.headerTitle, { color: theme.text }]}>{t('pin.title')}</Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}
      >
        <ScrollView contentContainerStyle={st.content} keyboardShouldPersistTaps="handled">
          <Card variant="bordered" borderColor={Colors.primary} style={{ marginBottom: 16, backgroundColor: theme.bgCard }}>
            <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
              <Ionicons name="shield-checkmark" size={24} color={Colors.primary} />
              <View style={{ flex: 1 }}>
                <Text style={{ ...Typography.smallBold, color: Colors.primary }}>
                  {lang === 'en' ? 'Security Tips' : 'Tips Keamanan'}
                </Text>
                <Text style={{ ...Typography.caption, color: theme.textMuted, marginTop: 2 }}>
                  {lang === 'en'
                    ? 'Use a 6-digit PIN that is easy to remember but hard to guess. Avoid birthdays.'
                    : 'Gunakan 6 digit PIN yang mudah diingat tapi sulit ditebak. Jangan gunakan tanggal lahir.'}
                </Text>
              </View>
            </View>
          </Card>

          <PINField
            label={t('pin.current')}
            value={pinLama}
            onChangeText={wrapSet(setPinLama)}
            show={showLama}
            toggle={() => setShowLama(!showLama)}
            editable={!saving}
            theme={theme}
            isDark={isDark}
          />
          <PINField
            label={t('pin.new')}
            value={pinBaru}
            onChangeText={wrapSet(setPinBaru)}
            show={showBaru}
            toggle={() => setShowBaru(!showBaru)}
            editable={!saving}
            theme={theme}
            isDark={isDark}
          />
          <PINField
            label={t('pin.confirm')}
            value={konfirmasi}
            onChangeText={wrapSet(setKonfirmasi)}
            show={showKonfir}
            toggle={() => setShowKonfir(!showKonfir)}
            editable={!saving}
            theme={theme}
            isDark={isDark}
          />

          {/* Live validation indicators */}
          {konfirmasi.length > 0 && pinBaru !== konfirmasi && (
            <View style={st.feedbackRow}>
              <Ionicons name="alert-circle" size={14} color={Colors.danger} />
              <Text style={{ ...Typography.caption, color: Colors.danger }}>
                {t('pin.mismatch')}
              </Text>
            </View>
          )}
          {konfirmasi.length > 0 && pinBaru === konfirmasi && konfirmasi.length === 6 && pinLama !== pinBaru && (
            <View style={st.feedbackRow}>
              <Ionicons name="checkmark-circle" size={14} color={Colors.success} />
              <Text style={{ ...Typography.caption, color: Colors.success }}>
                {lang === 'en' ? 'PIN matches' : 'PIN cocok'}
              </Text>
            </View>
          )}
          {pinLama.length === 6 && pinBaru.length === 6 && pinLama === pinBaru && (
            <View style={st.feedbackRow}>
              <Ionicons name="alert-circle" size={14} color={Colors.warning} />
              <Text style={{ ...Typography.caption, color: Colors.warning }}>
                {lang === 'en' ? 'New PIN must differ from old PIN' : 'PIN baru harus berbeda dari PIN lama'}
              </Text>
            </View>
          )}

          {errorMsg !== '' && (
            <Card
              variant="bordered"
              borderColor={Colors.danger}
              style={{ marginTop: 12, backgroundColor: isDark ? `${Colors.danger}15` : Colors.dangerBg }}
            >
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                <Ionicons name="alert-circle" size={18} color={Colors.danger} />
                <Text style={{ ...Typography.small, color: Colors.danger, flex: 1 }}>{errorMsg}</Text>
              </View>
            </Card>
          )}

          <Button
            title={saving ? (lang === 'en' ? 'Saving...' : 'Menyimpan...') : t('pin.save')}
            variant="primary"
            size="large"
            fullWidth
            icon="key-outline"
            onPress={handleSave}
            disabled={!canSubmit}
            loading={saving}
            style={{ marginTop: 24 }}
          />

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
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
  content: { padding: Spacing.base },
  fieldWrap: { marginBottom: 14 },
  label: { ...Typography.smallBold, marginBottom: 6 },
  inputRow: { flexDirection: 'row', alignItems: 'center' },
  input: {
    flex: 1,
    borderWidth: 1.5,
    borderRadius: Radius.md,
    paddingHorizontal: 14,
    paddingRight: 44,
    height: 48,
    ...Typography.body,
    letterSpacing: 8,
  },
  eyeBtn: { position: 'absolute', right: 12 },
  feedbackRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
});
============================================================
