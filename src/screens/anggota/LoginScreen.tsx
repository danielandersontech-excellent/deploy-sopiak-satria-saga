/**
 * ============================================
 * LOGIN SCREEN - All Roles
 * ============================================
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
  ActivityIndicator, Image, Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Radius, Shadows } from '../../constants';
import { Button } from '../../components';
import { useAuthStore } from '../../stores/authStore';
import { useDataStore } from '../../stores/dataStore';
import { API_URL, testConnection } from '../../lib/apiClient';
import type { UserRole } from '../../types';
import { useI18n } from '../../lib/i18n';

const { width } = Dimensions.get('window');

const ROLE_QUICK_LOGIN: { role: UserRole; label: string; icon: keyof typeof Ionicons.glyphMap; color: string; nrp: string; desc: string }[] = [
  { role: 'anggota', label: 'Anggota', icon: 'shield', color: Colors.primary, nrp: 'AGT001', desc: 'Security Officer' },
  { role: 'komandan', label: 'Komandan', icon: 'people', color: Colors.success, nrp: 'KMD001', desc: 'Team Leader' },
  { role: 'supervisor', label: 'Supervisor', icon: 'bar-chart', color: Colors.purple, nrp: 'SPV001', desc: 'Manager Operasional' },
  { role: 'admin', label: 'Admin', icon: 'settings', color: Colors.warning, nrp: 'ADM001', desc: 'System Administrator' },
  { role: 'klien', label: 'Klien', icon: 'business', color: '#607D8B', nrp: 'K001', desc: 'Client / Perusahaan' },
];

export default function LoginScreen({ navigation }: any) {
  const { t } = useI18n();
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

  // Test connection on mount
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

  const retryConnection = async () => {
    setConnOk(null);
    const result = await testConnection(API_URL);
    setConnOk(result.ok);
    setConnMs(result.ms);
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView 
        contentContainerStyle={styles.scroll} 
        keyboardShouldPersistTaps="handled" 
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        {/* Logo */}
        <View style={styles.logoWrap}>
          <Image 
            source={require('../../../assets/logo-ptsss.png')} 
            style={styles.logoImage} 
            resizeMode="contain" 
          />
          <Text style={styles.appName}>PT Sopiak Satria Saga</Text>
          <Text style={styles.tagline}>Security Management System</Text>
        </View>

        {/* Backend Not Running Warning */}
        {connOk === false && (
          <View style={styles.warningBox}>
            <Ionicons name="warning" size={18} color={Colors.warning} />
            <Text style={styles.warningText}>
              Backend belum berjalan. Buka terminal baru:{'\n'}
              cd backend && npm run dev
            </Text>
          </View>
        )}

        {/* Form Card */}
        <Animated.View style={[styles.formCard, { transform: [{ translateX: shakeAnim }] }]}>
          <Text style={styles.formTitle}>Masuk ke Akun</Text>

          <View style={styles.fieldWrap}>
            <Text style={styles.label}>NRP / Kode Klien</Text>
            <View style={[styles.inputRow, error && !nrp ? styles.inputError : null]}>
              <Ionicons name="person-outline" size={20} color={Colors.textMuted} />
              <TextInput 
                style={styles.input} 
                placeholder="Masukkan NRP atau Kode Klien" 
                placeholderTextColor={Colors.textMuted} 
                value={nrp} 
                onChangeText={(t) => { setNrp(t); setError(''); }} 
                autoCapitalize="characters" 
              />
            </View>
          </View>

          <View style={styles.fieldWrap}>
            <Text style={styles.label}>PIN</Text>
            <View style={[styles.inputRow, error && pin.length < 6 ? styles.inputError : null]}>
              <Ionicons name="lock-closed-outline" size={20} color={Colors.textMuted} />
              <TextInput 
                style={styles.input} 
                placeholder="Masukkan 6 digit PIN" 
                placeholderTextColor={Colors.textMuted} 
                value={pin} 
                onChangeText={(t) => { setPin(t.replace(/[^0-9]/g, '').slice(0, 6)); setError(''); }} 
                secureTextEntry={!showPin} 
                keyboardType="number-pad" 
                maxLength={6} 
              />
              <TouchableOpacity onPress={() => setShowPin(!showPin)}>
                <Ionicons name={showPin ? 'eye-off-outline' : 'eye-outline'} size={20} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>
          </View>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <Button 
            title={loading ? '' : 'MASUK'} 
            variant="primary" 
            size="large" 
            fullWidth 
            onPress={handleLogin} 
            disabled={loading} 
            icon={loading ? undefined : 'log-in-outline'} 
          />
          {loading && <ActivityIndicator color={Colors.primary} style={{ marginTop: -36 }} />}
        </Animated.View>

        {/* Loading Indicator */}
        {loading && (
          <View style={styles.demoSection}>
            <View style={styles.demoLine} />
            <Text style={styles.demoLabel}>Menghubungkan...</Text>
            <View style={styles.demoLine} />
          </View>
        )}

        <Text style={styles.footerText}>Hubungi Admin untuk bantuan akun</Text>
        <Text style={styles.versionText}>PT Sopiak Satria Saga</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgLight },
  scroll: { 
    paddingHorizontal: Spacing.lg, 
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.xl, 
    flexGrow: 1,
    justifyContent: 'center',
  },
  logoWrap: { alignItems: 'center', marginBottom: Spacing.xl },
  logoImage: { 
    width: width * 0.3, height: width * 0.3,
    marginBottom: Spacing.sm, maxWidth: 140, maxHeight: 140,
  },
  appName: { fontSize: 24, fontWeight: '800', color: Colors.textPrimary, letterSpacing: 1, textAlign: 'center' },
  tagline: { ...Typography.small, color: Colors.textMuted, marginTop: 2, fontSize: 12 },
  warningBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: '#fff8e1', borderRadius: Radius.sm, padding: 12, marginBottom: 12,
    borderWidth: 1, borderColor: '#ffe082',
  },
  warningText: { flex: 1, fontSize: 12, color: '#795548', lineHeight: 18 },
  formCard: {
    backgroundColor: Colors.bgWhite, borderRadius: Radius.lg, padding: Spacing.lg,
    ...Shadows.md, marginBottom: Spacing.lg, width: '100%',
  },
  formTitle: { ...Typography.h3, color: Colors.textPrimary, marginBottom: Spacing.lg, textAlign: 'center', fontSize: 20 },
  fieldWrap: { marginBottom: Spacing.md },
  label: { ...Typography.smallBold, color: Colors.textSecondary, marginBottom: 6, fontSize: 14 },
  inputRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: 1.5, borderColor: Colors.border, borderRadius: Radius.md,
    paddingHorizontal: 14, height: 52, backgroundColor: Colors.bgLight,
  },
  inputError: { borderColor: Colors.danger },
  input: { flex: 1, ...Typography.body, color: Colors.textPrimary, height: '100%', fontSize: 16 },
  errorText: { ...Typography.small, color: Colors.danger, marginBottom: Spacing.md, textAlign: 'center', fontSize: 14 },
  demoSection: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: Spacing.md, marginTop: Spacing.sm },
  demoLine: { flex: 1, height: 1, backgroundColor: Colors.border },
  demoLabel: { ...Typography.caption, color: Colors.textMuted, fontWeight: '700', fontSize: 13 },
  footerText: { ...Typography.small, color: Colors.textMuted, textAlign: 'center', marginBottom: 4, fontSize: 13, marginTop: Spacing.sm },
  versionText: { ...Typography.caption, color: Colors.textMuted, textAlign: 'center', fontSize: 11 },
});