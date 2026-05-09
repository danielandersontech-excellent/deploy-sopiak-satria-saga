/**
 * ============================================
 * LOGIN SCREEN - All Roles (FIXED)
 * ============================================
 * FIXES:
 * - Uses useTheme() for all colors (no more invisible white text)
 * - Professional UI with gradient header
 * - Proper contrast on both light and dark mode
 * 
 * DATABASE ALIGNMENT:
 *   users table: id, nama, nrp, pin, role, no_hp, pos_jaga,
 *   shift, lokasi_id, foto, skor, created_at
 * 
 * LOGIN CREDENTIALS:
 *   ADMIN:      ADM001 / 123456
 *   SUPERVISOR: SPV001 / 123456
 *   KOMANDAN:   KMD001-KMD005 / 123456
 *   ANGGOTA:    AGT001-AGT023 / 123456
 *   KLIEN:      K001-K006 / 123456
 */
import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform, ScrollView, Animated,
  ActivityIndicator, Image, Dimensions, StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Typography, Spacing, Radius, Shadows } from '../../constants';
import { Button } from '../../components';
import { useAuthStore } from '../../stores/authStore';
import { useDataStore } from '../../stores/dataStore';
import { API_URL, testConnection } from '../../lib/apiClient';
import type { UserRole } from '../../types';
import { useI18n } from '../../lib/i18n';
import { useTheme } from '../../lib/theme';

const { width } = Dimensions.get('window');

export default function LoginScreen({ navigation }: any) {
  const { t } = useI18n();
  const { theme, isDark } = useTheme();
  const [nrp, setNrp] = useState('');
  const [pin, setPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [connOk, setConnOk] = useState<boolean | null>(null);
  const [connMs, setConnMs] = useState(0);
  const shakeAnim = useRef(new Animated.Value(0)).current;

  const login = useAuthStore((s) => s.login);
  const loginAsRole = useAuthStore((s) => s.loginAsRole);
  const loadAllData = useDataStore((s) => s.loadAllData);

  // Theme-aware colors for this screen
  const C = {
    bg: isDark ? '#0F172A' : '#F0F2F5',
    cardBg: isDark ? '#1E293B' : '#FFFFFF',
    inputBg: isDark ? '#334155' : '#F8FAFC',
    text: isDark ? '#F1F5F9' : '#0F172A',
    textSecondary: isDark ? '#94A3B8' : '#475569',
    textMuted: isDark ? '#64748B' : '#94A3B8',
    border: isDark ? '#475569' : '#E2E8F0',
    borderFocus: '#1A56DB',
    headerBg: '#1a5276',
    primary: '#1A56DB',
    danger: '#EF4444',
    warning: '#F59E0B',
    success: '#10B981',
  };

  useEffect(() => {
    (async () => {
      const result = await testConnection(API_URL);
      setConnOk(result.ok);
      setConnMs(result.ms);
      if (!result.ok) console.log('[Login] Connection test failed:', result.error);
    })();
  }, []);

  const shake = () => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start();
  };

  const handleLogin = async () => {
    if (!nrp.trim()) { setError('NRP / ID wajib diisi'); shake(); return; }
    if (pin.length < 6) { setError('PIN harus 6 digit'); shake(); return; }
    setError('');
    setLoading(true);
    const ok = await login(nrp.trim(), pin);
    if (ok) {
      await loadAllData();
      setLoading(false);
      navigation.reset({ index: 0, routes: [{ name: 'MainTabs' }] });
    } else {
      setLoading(false);
      const msg = useAuthStore.getState().error || 'Login gagal. Periksa NRP dan PIN Anda.';
      setError(msg);
      shake();
    }
  };

  const handleQuickLogin = async (role: UserRole) => {
    setLoading(true);
    setError('');
    const ok = await loginAsRole(role);
    if (ok) {
      await loadAllData();
      setLoading(false);
      navigation.reset({ index: 0, routes: [{ name: 'MainTabs' }] });
    } else {
      setLoading(false);
      const msg = useAuthStore.getState().error || 'Login gagal. Periksa koneksi server.';
      setError(msg);
      shake();
    }
  };

  return (
    <KeyboardAvoidingView style={[styles.container, { backgroundColor: C.bg }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StatusBar barStyle="light-content" backgroundColor={C.headerBg} />
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        {/* Header with Logo */}
        <View style={styles.headerSection}>
          <View style={styles.logoCircle}>
            <Image
              source={require('../../../assets/logo-ptsss.png')}
              style={styles.logoImage}
              resizeMode="contain"
            />
          </View>
          <Text style={styles.appName}>PT Sopiak Satria Saga</Text>
          <Text style={styles.tagline}>Security Management System</Text>
        </View>

        {/* Connection Warning */}
        {connOk === false && (
          <View style={styles.warningBox}>
            <Ionicons name="warning" size={18} color={C.warning} />
            <Text style={styles.warningText}>
              Backend belum berjalan. Buka terminal baru:{'\n'}
              cd backend && npm run dev
            </Text>
          </View>
        )}

        {/* Form Card */}
        <Animated.View style={[
          styles.formCard,
          { backgroundColor: C.cardBg, transform: [{ translateX: shakeAnim }] },
          !isDark && Shadows.md,
        ]}>
          <Text style={[styles.formTitle, { color: C.text }]}>Masuk ke Akun</Text>

          <View style={styles.fieldWrap}>
            <Text style={[styles.label, { color: C.textSecondary }]}>NRP / Kode Klien</Text>
            <View style={[styles.inputRow, { borderColor: error && !nrp ? C.danger : C.border, backgroundColor: C.inputBg }]}>
              <Ionicons name="person-outline" size={20} color={C.textMuted} />
              <TextInput
                style={[styles.input, { color: C.text }]}
                placeholder="Masukkan NRP atau Kode Klien"
                placeholderTextColor={C.textMuted}
                value={nrp}
                onChangeText={(t) => { setNrp(t); setError(''); }}
                autoCapitalize="characters"
              />
            </View>
          </View>

          <View style={styles.fieldWrap}>
            <Text style={[styles.label, { color: C.textSecondary }]}>PIN</Text>
            <View style={[styles.inputRow, { borderColor: error && pin.length < 6 ? C.danger : C.border, backgroundColor: C.inputBg }]}>
              <Ionicons name="lock-closed-outline" size={20} color={C.textMuted} />
              <TextInput
                style={[styles.input, { color: C.text }]}
                placeholder="Masukkan 6 digit PIN"
                placeholderTextColor={C.textMuted}
                value={pin}
                onChangeText={(t) => { setPin(t.replace(/[^0-9]/g, '').slice(0, 6)); setError(''); }}
                secureTextEntry={!showPin}
                keyboardType="number-pad"
                maxLength={6}
              />
              <TouchableOpacity onPress={() => setShowPin(!showPin)}>
                <Ionicons name={showPin ? 'eye-off-outline' : 'eye-outline'} size={20} color={C.textMuted} />
              </TouchableOpacity>
            </View>
          </View>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <TouchableOpacity
            style={[styles.loginBtn, loading && styles.loginBtnDisabled]}
            onPress={handleLogin}
            disabled={loading}
            activeOpacity={0.8}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="log-in-outline" size={20} color="#fff" />
                <Text style={styles.loginBtnText}>MASUK</Text>
              </>
            )}
          </TouchableOpacity>
        </Animated.View>

        {/* Connection status */}
        {connOk === true && (
          <View style={styles.connOkRow}>
            <View style={styles.connDot} />
            <Text style={[styles.connText, { color: C.textMuted }]}>Terhubung ke server ({connMs}ms)</Text>
          </View>
        )}

        <Text style={[styles.footerText, { color: C.textMuted }]}>Hubungi Admin untuk bantuan akun</Text>
        <Text style={[styles.versionText, { color: C.textMuted }]}>PT Sopiak Satria Saga v2.0</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xl,
  },
  // Header
  headerSection: {
    alignItems: 'center',
    marginBottom: Spacing.xl,
    paddingTop: Spacing.xl,
  },
  logoCircle: {
    width: 110, height: 110, borderRadius: 55,
    backgroundColor: '#1a5276',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 14,
    ...Shadows.md,
  },
  logoImage: {
    width: 80, height: 80,
  },
  appName: {
    fontSize: 22, fontWeight: '800', color: '#1a5276',
    letterSpacing: 0.8, textAlign: 'center',
  },
  tagline: {
    fontSize: 12, color: '#64748B', marginTop: 4, letterSpacing: 0.3,
  },
  // Warning
  warningBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: '#FFF8E1', borderRadius: Radius.sm, padding: 12, marginBottom: 12,
    borderWidth: 1, borderColor: '#FFE082',
  },
  warningText: { flex: 1, fontSize: 12, color: '#795548', lineHeight: 18 },
  // Form
  formCard: {
    borderRadius: Radius.lg, padding: Spacing.lg,
    marginBottom: Spacing.md, width: '100%',
    borderWidth: 1, borderColor: '#E2E8F0',
  },
  formTitle: {
    fontSize: 20, fontWeight: '700',
    marginBottom: Spacing.lg, textAlign: 'center',
  },
  fieldWrap: { marginBottom: Spacing.md },
  label: {
    fontSize: 14, fontWeight: '600', marginBottom: 6,
  },
  inputRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: 1.5, borderRadius: Radius.md,
    paddingHorizontal: 14, height: 52,
  },
  input: {
    flex: 1, fontSize: 16, height: '100%',
    fontFamily: 'Inter_400Regular',
  },
  errorText: {
    fontSize: 14, color: '#EF4444',
    marginBottom: Spacing.md, textAlign: 'center', fontWeight: '500',
  },
  // Login Button
  loginBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, backgroundColor: '#1A56DB', borderRadius: Radius.md,
    height: 52, marginTop: 4,
  },
  loginBtnDisabled: { opacity: 0.7 },
  loginBtnText: {
    fontSize: 16, fontWeight: '700', color: '#FFFFFF', letterSpacing: 0.5,
  },
  // Connection
  connOkRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, marginBottom: Spacing.sm,
  },
  connDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#10B981' },
  connText: { fontSize: 12 },
  // Footer
  footerText: {
    fontSize: 13, textAlign: 'center', marginBottom: 4, marginTop: Spacing.sm,
  },
  versionText: {
    fontSize: 11, textAlign: 'center',
  },
});
