import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Alert, Vibration } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Radius, Shadows } from '../../constants';
import { Button } from '../../components';
import { useDataStore } from '../../stores/dataStore';
import { getCurrentLocation } from '../../services/locationService';
import { useI18n } from '../../lib/i18n';
import { useTheme } from '../../lib/theme';

export default function PanicButtonScreen({ navigation }: any) {
  const { t } = useI18n();
  const { theme, isDark } = useTheme();
  const panicActive = useDataStore((s) => s.panicActive);
  const activatePanic = useDataStore((s) => s.activatePanic);
  const deactivatePanic = useDataStore((s) => s.deactivatePanic);

  const [phase, setPhase] = useState<'confirm' | 'activating' | 'active'>(panicActive ? 'active' : 'confirm');
  const [holdProgress, setHoldProgress] = useState(0);
  const [timer, setTimer] = useState(0);
  const holdRef = useRef<any>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const [loc, setLoc] = useState<any>(null);

  // Get GPS immediately
  useEffect(() => {
    getCurrentLocation().then(l => l && setLoc(l));
  }, []);

  useEffect(() => {
    if (phase !== 'active') return;
    const iv = setInterval(() => setTimer((t) => t + 1), 1000);
    return () => clearInterval(iv);
  }, [phase]);

  useEffect(() => {
    if (phase !== 'active' && phase !== 'activating') return;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulseAnim, { toValue: 1.1, duration: 600, useNativeDriver: true }),
      Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [phase]);

  const startHold = () => {
    let p = 0;
    holdRef.current = setInterval(() => {
      p += 3.33;
      setHoldProgress(Math.min(p, 100));
      if (p >= 100) {
        clearInterval(holdRef.current);
        Vibration.vibrate(500);
        setPhase('activating');
        setTimeout(() => { activatePanic(); setPhase('active'); setTimer(0); }, 2000);
      }
    }, 100);
  };

  const stopHold = () => {
    if (holdRef.current) clearInterval(holdRef.current);
    setHoldProgress(0);
  };

  const handleDeactivate = () => {
    Alert.alert('Yakin Sudah Aman?', 'Status darurat akan dinonaktifkan', [
      { text: 'Belum Aman', style: 'cancel' },
      { text: 'Ya, Sudah Aman', onPress: () => { deactivatePanic(); navigation.goBack(); } },
    ]);
  };

  const fmtTimer = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  if (phase === 'activating') {
    return (
      <View style={[styles.container, { backgroundColor: Colors.danger }]}>
        <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
          <Ionicons name="warning" size={80} color="#fff" />
        </Animated.View>
        <Text style={styles.activatingTitle}>DARURAT AKTIF!</Text>
        <Text style={styles.activatingMsg}>Mengirim lokasi GPS...</Text>
        <Text style={styles.activatingMsg}>Mengirim notifikasi ke Komandan...</Text>
      </View>
    );
  }

  if (phase === 'active') {
    return (
      <View style={styles.container}>
        <View style={styles.activeHeader}>
          <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
            <Ionicons name="warning" size={28} color="#fff" />
          </Animated.View>
          <Text style={styles.activeHeaderText}>STATUS DARURAT AKTIF</Text>
          <Text style={styles.activeTimer}>{fmtTimer(timer)}</Text>
        </View>
        <View style={styles.activeContent}>
          <View style={styles.activeCard}>
            <Ionicons name="shield-checkmark" size={32} color={Colors.primary} />
            <Text style={styles.activeCardTitle}>Bantuan Sedang Dikirim</Text>
            <Text style={styles.activeCardText}>Komandan sudah dihubungi dan mengirim bantuan ke lokasi Anda</Text>
          </View>
          <View style={styles.activeCard}>
            <Ionicons name="location" size={32} color={Colors.success} />
            <Text style={styles.activeCardTitle}>Lokasi Anda</Text>
            <Text style={styles.activeCardText}>{loc?.address || 'Mengambil lokasi...'}{'\n'}{loc ? `${loc.coords.latitude.toFixed(5)}, ${loc.coords.longitude.toFixed(5)}` : ''}</Text>
            <Text style={styles.liveText}>🔴 Live tracking aktif</Text>
          </View>
          <View style={styles.contactCard}>
            <Text style={styles.contactTitle}>Kontak Darurat</Text>
            {[
              { nama: 'Budi Santoso (Komandan)', hp: '081234567891' },
              { nama: 'Dian Pratama (Supervisor)', hp: '081234567892' },
            ].map((c, i) => (
              <View key={i} style={styles.contactRow}>
                <Ionicons name="person" size={18} color={Colors.primary} />
                <Text style={styles.contactName}>{c.nama}</Text>
                <TouchableOpacity style={styles.callBtn}><Ionicons name="call" size={16} color={Colors.success} /></TouchableOpacity>
              </View>
            ))}
          </View>
          <Button title="NONAKTIFKAN DARURAT" variant="danger" size="large" fullWidth onPress={handleDeactivate} style={{ marginTop: 20 }} />
        </View>
      </View>
    );
  }

  // Confirm phase
  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.closeBtn} onPress={() => navigation.goBack()}>
        <Ionicons name="close" size={28} color={Colors.textPrimary} />
      </TouchableOpacity>
      <View style={styles.confirmContent}>
        <Ionicons name="warning" size={48} color={Colors.danger} />
        <Text style={styles.confirmTitle}>AKTIVASI DARURAT?</Text>
        <Text style={styles.confirmDesc}>Tekan dan tahan tombol selama 3 detik untuk mengaktifkan status darurat</Text>
        <TouchableOpacity style={styles.panicButton} onPressIn={startHold} onPressOut={stopHold} activeOpacity={0.9}>
          <View style={[styles.panicFill, { height: `${holdProgress}%` }]} />
          <Text style={styles.panicText}>{holdProgress > 0 ? `${Math.ceil(3 - holdProgress / 33.3)}...` : 'TEKAN\n& TAHAN'}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.cancelBtn}>
          <Text style={styles.cancelText}>Batal</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgLight, alignItems: 'center', justifyContent: 'center' },
  closeBtn: { position: 'absolute', top: 50, left: 20, zIndex: 2 },
  confirmContent: { alignItems: 'center', padding: 32 },
  confirmTitle: { ...Typography.h2, color: Colors.danger, marginTop: 16 },
  confirmDesc: { ...Typography.body, color: Colors.textMuted, textAlign: 'center', marginTop: 8, marginBottom: 32 },
  panicButton: {
    width: 180, height: 180, borderRadius: 90, backgroundColor: Colors.danger,
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden', ...Shadows.lg,
  },
  panicFill: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(255,255,255,0.3)' },
  panicText: { color: '#fff', fontSize: 20, fontWeight: '800', textAlign: 'center', zIndex: 1 },
  cancelBtn: { marginTop: 24 },
  cancelText: { ...Typography.bodyBold, color: Colors.textMuted },
  activatingTitle: { ...Typography.h1, color: '#fff', marginTop: 20 },
  activatingMsg: { ...Typography.body, color: 'rgba(255,255,255,0.8)', marginTop: 8 },
  activeHeader: {
    width: '100%', backgroundColor: Colors.danger, paddingTop: 50, paddingBottom: 16,
    alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 12, paddingHorizontal: 20,
  },
  activeHeaderText: { ...Typography.bodyBold, color: '#fff' },
  activeTimer: { ...Typography.h3, color: '#fff', fontVariant: ['tabular-nums'] },
  activeContent: { flex: 1, padding: 20, width: '100%' },
  activeCard: {
    backgroundColor: Colors.bgWhite, borderRadius: Radius.lg, padding: 20, alignItems: 'center',
    marginBottom: 12, ...Shadows.sm,
  },
  activeCardTitle: { ...Typography.bodyBold, color: Colors.textPrimary, marginTop: 8 },
  activeCardText: { ...Typography.small, color: Colors.textMuted, textAlign: 'center', marginTop: 4 },
  liveText: { ...Typography.smallBold, color: Colors.danger, marginTop: 8 },
  contactCard: { backgroundColor: Colors.bgWhite, borderRadius: Radius.lg, padding: 16, ...Shadows.sm },
  contactTitle: { ...Typography.bodyBold, color: Colors.textPrimary, marginBottom: 8 },
  contactRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  contactName: { ...Typography.small, color: Colors.textPrimary, flex: 1 },
  callBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.successBg, alignItems: 'center', justifyContent: 'center' },
});
