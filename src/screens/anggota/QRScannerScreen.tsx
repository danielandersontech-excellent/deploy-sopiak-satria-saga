import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Animated, Alert, TextInput, Modal,
  ActivityIndicator, StatusBar,
} from 'react-native';
import { CameraView, useCameraPermissions, BarcodeScanningResult } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Radius } from '../../constants';
import { Button } from '../../components';
import { useDataStore } from '../../stores/dataStore';
import { useAuthStore } from '../../stores/authStore';
import { useI18n } from '../../lib/i18n';
import { useTheme } from '../../lib/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Phase = 'scanning' | 'success';

export default function QRScannerScreen({ navigation, route }: any) {
  const { t } = useI18n();
  const { theme, isDark } = useTheme();
  const { checkpointId } = route.params || {};
  const scanCheckpoint = useDataStore((s) => s.scanCheckpoint);
  const activePatrol = useDataStore((s) => s.activePatrol);
  const checkpoints = useDataStore((s) => s.checkpoints);
  const user = useAuthStore((s) => s.user);

  const [permission, requestPermission] = useCameraPermissions();
  const [phase, setPhase] = useState<Phase>('scanning');
  const [showManual, setShowManual] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [flashOn, setFlashOn] = useState(false);
  const [hasScanned, setHasScanned] = useState(false);
  const [matchedCp, setMatchedCp] = useState<any>(null);
  // [P1-2] true bila checkpoint berhasil DIANTREKAN offline (bukan langsung
  // dikonfirmasi server) — layar sukses menampilkan pesan berbeda.
  const [wasQueued, setWasQueued] = useState(false);
  const scanLineY = useRef(new Animated.Value(0)).current;
  const successScale = useRef(new Animated.Value(0)).current;

  const insets = useSafeAreaInsets();
  // Math.max guards against useSafeAreaInsets() returning 0 inside an RN <Modal> on Android edge-to-edge.
  const topPad = Math.max(insets.top, StatusBar.currentHeight ?? 0, 24);
  const bottomPad = Math.max(insets.bottom, 16);

  const scannedCount = activePatrol?.checkpoints.filter((c) => c.scanned).length || 0;
  const totalCount = activePatrol?.checkpoints.length || 0;

  // Target checkpoint name for display
  const targetCpName = checkpoints.find((c) => c.id === checkpointId)?.nama || 'Scan QR';

  useEffect(() => {
    if (!permission?.granted) requestPermission();
  }, []);

  // Scan line animation
  useEffect(() => {
    if (phase !== 'scanning') return;
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(scanLineY, { toValue: 230, duration: 2000, useNativeDriver: true }),
        Animated.timing(scanLineY, { toValue: 0, duration: 2000, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [phase]);

  // Success animation
  useEffect(() => {
    if (phase !== 'success') return;
    Animated.spring(successScale, {
      toValue: 1,
      friction: 5,
      tension: 80,
      useNativeDriver: true,
    }).start();
  }, [phase]);

  /**
   * Ketika QR cocok: kirim scan checkpoint ke server dan tampilkan hasil
   * SESUNGGUHNYA — sukses hanya bila server menerima (atau menerima antrean
   * offline); penolakan server TIDAK menandai checkpoint berhasil dan
   * mengizinkan scan ulang. [P1-2]
   */
  const onMatched = useCallback(async (cp: any) => {
    setMatchedCp(cp);
    const res = await scanCheckpoint(cp.id, null);
    if (res.status === 'success' || res.status === 'queued') {
      setWasQueued(res.status === 'queued');
      setPhase('success');
    } else if (res.error === 'Checkpoint sudah pernah di-scan sebelumnya') {
      Alert.alert(
        '⚠️ Sudah Di-scan',
        `Checkpoint "${cp.nama}" sudah pernah di-scan sebelumnya.`,
        [{ text: 'Kembali', onPress: () => navigation.goBack() }]
      );
    } else {
      Alert.alert(
        'Gagal Menyimpan Checkpoint',
        res.error || 'Server menolak checkpoint ini. Silakan coba lagi.',
        [{ text: 'Coba Lagi', onPress: () => setHasScanned(false) }]
      );
    }
  }, [scanCheckpoint, navigation]);

  /**
   * Handle barcode scan result
   */
  const handleBarcodeScanned = useCallback((result: BarcodeScanningResult) => {
    if (hasScanned || phase !== 'scanning') return;
    const data = result.data;

    // Try to match QR code with checkpoint
    const cp = checkpoints.find(
      (c) => c.qrCode === data || c.id === data || c.qrCode === data.toUpperCase()
    );

    if (cp) {
      setHasScanned(true);
      onMatched(cp);
    } else {
      // [4-3] Tidak ada lagi fallback "terima scan apa pun": QR yang tidak cocok
      // checkpoint manapun SELALU ditolak — verifikasi kehadiran fisik dijaga.
      showUnrecognizedAlert(data);
    }
  }, [hasScanned, phase, checkpoints, checkpointId, onMatched]);

  const showUnrecognizedAlert = (data: string) => {
    setHasScanned(true);
    Alert.alert(
      'QR Tidak Dikenali',
      `Kode: ${data}\n\nPastikan Anda scan QR code yang benar pada checkpoint ini.`,
      [
        { text: 'Coba Lagi', onPress: () => setHasScanned(false) },
        { text: 'Input Manual', onPress: () => { setHasScanned(false); setShowManual(true); } },
      ]
    );
  };

  /**
   * Handle manual code submit
   */
  const handleManualSubmit = () => {
    const code = manualCode.trim().toUpperCase();
    if (!code) {
      Alert.alert('Error', 'Masukkan kode QR checkpoint.');
      return;
    }
    const cp = checkpoints.find(
      (c) => c.qrCode === code || c.qrCode === code.replace(/\s/g, '')
    );
    if (cp) {
      setShowManual(false);
      setManualCode('');
      onMatched(cp);
    } else {
      Alert.alert('Tidak Ditemukan', `Kode "${code}" tidak cocok dengan checkpoint manapun.`);
    }
  };

  /**
   * Kembali ke patrol setelah sukses
   */
  const handleBackToPatrol = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

  // ========== PERMISSION SCREEN ==========
  if (!permission?.granted) {
    return (
      <View style={s.container}>
        <StatusBar barStyle="light-content" />
        <View style={s.permWrap}>
          <Ionicons name="camera-outline" size={64} color="rgba(255,255,255,0.6)" />
          <Text style={s.permTitle}>Izin Kamera Diperlukan</Text>
          <Text style={s.permDesc}>
            Kamera diperlukan untuk memindai QR Code pada setiap checkpoint patroli
          </Text>
          <TouchableOpacity style={s.permBtn} onPress={requestPermission}>
            <Text style={s.permBtnText}>Berikan Izin Kamera</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={s.permCancelText}>Kembali</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ========== SUCCESS SCREEN ==========
  if (phase === 'success' && matchedCp) {
    const newScannedCount = scannedCount + 1;
    const allDone = newScannedCount >= totalCount;

    return (
      <View style={[s.container, { backgroundColor: '#0D1117' }]}>
        <StatusBar barStyle="light-content" backgroundColor="#0D1117" />
        <View style={s.successContainer}>
          {/* Animated success icon */}
          <Animated.View style={[s.successCircle, { transform: [{ scale: successScale }] }]}>
            <Ionicons name="checkmark" size={48} color="#fff" />
          </Animated.View>

          <Text style={s.successTitle}>{wasQueued ? 'Tersimpan Offline' : 'Checkpoint Berhasil! ✅'}</Text>
          <Text style={s.successCpName}>{matchedCp.nama}</Text>

          {matchedCp.area && (
            <Text style={s.successArea}>{matchedCp.area}</Text>
          )}

          {wasQueued && (
            <Text style={s.successArea}>Tersimpan offline, akan dikirim saat online</Text>
          )}

          {/* Scan time */}
          <View style={s.successTimeRow}>
            <Ionicons name="time-outline" size={16} color="rgba(255,255,255,0.6)" />
            <Text style={s.successTime}>
              {new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })} WIB
            </Text>
          </View>

          {/* Progress */}
          <View style={s.successProgress}>
            <View style={s.successProgressBg}>
              <View style={[s.successProgressFill, { width: `${(newScannedCount / totalCount) * 100}%` }]} />
            </View>
            <Text style={s.successProgressText}>
              {newScannedCount}/{totalCount} checkpoint
            </Text>
          </View>

          {/* All done message */}
          {allDone && (
            <View style={s.allDoneBanner}>
              <Ionicons name="trophy" size={22} color="#FFD700" />
              <Text style={s.allDoneText}>Semua checkpoint selesai! 🎉</Text>
            </View>
          )}

          {/* Back button */}
          <TouchableOpacity style={s.successBtn} onPress={handleBackToPatrol} activeOpacity={0.8}>
            <Ionicons name={allDone ? 'flag' : 'arrow-forward'} size={20} color="#fff" />
            <Text style={s.successBtnText}>
              {allDone ? 'Kembali ke Patroli' : 'Lanjut Checkpoint Berikutnya'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ========== SCANNING SCREEN ==========
  return (
    <View style={s.container}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />

      {/* Camera */}
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        flash={flashOn ? 'on' : 'off'}
        barcodeScannerSettings={{ barcodeTypes: ['qr', 'code128', 'code39', 'ean13'] }}
        onBarcodeScanned={!hasScanned ? handleBarcodeScanned : undefined}
        onCameraReady={() => setCameraReady(true)}
        onMountError={(e: { message: string }) => { console.error('[QRScanner] Camera mount error:', e.message); setCameraError(e.message); }}
      />

      {/* Overlay UI */}
      <View style={s.overlays}>
        {/* Top Bar */}
        <View style={[s.topBar, { paddingTop: topPad }]}>
          <TouchableOpacity style={s.topBtn} onPress={() => navigation.goBack()}>
            <Ionicons name="close" size={28} color="#fff" />
          </TouchableOpacity>
          <View style={s.info}>
            <Text style={s.infoSub}>Checkpoint {scannedCount + 1}/{totalCount}</Text>
            <Text style={s.infoMain}>{targetCpName}</Text>
          </View>
          <TouchableOpacity style={s.topBtn} onPress={() => setFlashOn(!flashOn)}>
            <Ionicons
              name={flashOn ? 'flash' : 'flash-off'}
              size={24}
              color={flashOn ? '#FFD700' : '#fff'}
            />
          </TouchableOpacity>
        </View>

        {/* Scan Frame */}
        <View style={s.frameWrap}>
          <View style={s.scanFrame}>
            {/* Corner decorations */}
            <View style={[s.corner, { top: -1, left: -1, borderRightWidth: 0, borderBottomWidth: 0 }]} />
            <View style={[s.corner, { top: -1, right: -1, borderLeftWidth: 0, borderBottomWidth: 0 }]} />
            <View style={[s.corner, { bottom: -1, left: -1, borderRightWidth: 0, borderTopWidth: 0 }]} />
            <View style={[s.corner, { bottom: -1, right: -1, borderLeftWidth: 0, borderTopWidth: 0 }]} />
            {/* Animated scan line */}
            <Animated.View style={[s.scanLine, { transform: [{ translateY: scanLineY }] }]} />
          </View>
          {!cameraReady && (
            <ActivityIndicator size="large" color="#fff" style={{ position: 'absolute' }} />
          )}
        </View>

        {/* Bottom Bar */}
        <View style={[s.bottomBar, { paddingBottom: bottomPad }]}>
          <Text style={s.instruct}>Arahkan kamera ke QR Code checkpoint</Text>
          <View style={s.actions}>
            {/* Flash toggle */}
            <TouchableOpacity style={s.actBtn} onPress={() => setFlashOn(!flashOn)}>
              <Ionicons name="flash-outline" size={22} color="#fff" />
              <Text style={s.actLabel}>Flash</Text>
            </TouchableOpacity>

            {/* [4-3] Tombol "simulate scan" DIHAPUS: sebelumnya menandai checkpoint
                target tanpa scan QR apa pun (bypass verifikasi kehadiran fisik).
                Pemindaian sah dilakukan otomatis oleh kamera (handleBarcodeScanned);
                fallback resmi adalah Input Manual yang tetap wajib cocok kode. */}

            {/* Manual input */}
            <TouchableOpacity style={s.actBtn} onPress={() => setShowManual(true)}>
              <Ionicons name="keypad-outline" size={22} color="#fff" />
              <Text style={s.actLabel}>Manual</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Manual Input Modal */}
      <Modal visible={showManual} transparent animationType="slide">
        <View style={s.modalOv}>
          <View style={[s.modalCard, { paddingBottom: bottomPad }]}>
            <View style={s.modalHeader}>
              <Ionicons name="keypad" size={24} color={Colors.primary} />
              <Text style={s.modalTitle}>Input Kode Manual</Text>
            </View>
            <Text style={s.modalDesc}>
              Masukkan kode QR checkpoint jika scanner tidak dapat membaca QR code
            </Text>
            <TextInput
              style={s.modalInput}
              value={manualCode}
              onChangeText={setManualCode}
              placeholder="Contoh: CPI-CP-001"
              placeholderTextColor={Colors.textMuted}
              autoCapitalize="characters"
              autoFocus
              returnKeyType="done"
              onSubmitEditing={handleManualSubmit}
            />
            <View style={s.modalActs}>
              <Button
                title="Batal"
                variant="outline"
                size="medium"
                onPress={() => {
                  setShowManual(false);
                  setManualCode('');
                  setHasScanned(false);
                }}
                style={{ flex: 1 }}
              />
              <Button
                title="Submit"
                variant="primary"
                size="medium"
                onPress={handleManualSubmit}
                disabled={!manualCode.trim()}
                style={{ flex: 1 }}
              />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },

  // ===== Overlays =====
  overlays: { ...StyleSheet.absoluteFillObject, justifyContent: 'space-between' },
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 12,
    backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 10,
  },
  topBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  info: { alignItems: 'center', flex: 1 },
  infoSub: { fontSize: 12, color: 'rgba(255,255,255,0.7)' },
  infoMain: { fontSize: 16, fontWeight: '700', color: '#fff', marginTop: 2 },

  // ===== Scan Frame =====
  frameWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scanFrame: { width: 250, height: 250, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  corner: { position: 'absolute', width: 30, height: 30, borderColor: Colors.primary, borderWidth: 3 },
  scanLine: { position: 'absolute', left: 4, right: 4, height: 2, backgroundColor: Colors.primary },

  // ===== Bottom Bar =====
  bottomBar: {
    paddingHorizontal: 20, paddingTop: 16,
    backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center',
  },
  instruct: { fontSize: 14, color: '#fff', marginBottom: 16 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 36 },
  actBtn: { alignItems: 'center', gap: 4, minWidth: 50 },
  actLabel: { fontSize: 11, color: 'rgba(255,255,255,0.7)' },
  mainBtn: {
    width: 68, height: 68, borderRadius: 34,
    borderWidth: 3, borderColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
  },
  mainBtnInner: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: Colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },

  // ===== Success Screen =====
  successContainer: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 32,
  },
  successCircle: {
    width: 90, height: 90, borderRadius: 45,
    backgroundColor: Colors.success,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 20,
  },
  successTitle: {
    fontSize: 22, fontWeight: '800', color: '#fff',
    marginBottom: 8,
  },
  successCpName: {
    fontSize: 18, fontWeight: '600', color: Colors.primary,
    marginBottom: 4,
  },
  successArea: {
    fontSize: 14, color: 'rgba(255,255,255,0.5)',
    marginBottom: 12,
  },
  successTimeRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginBottom: 24,
  },
  successTime: {
    fontSize: 14, color: 'rgba(255,255,255,0.6)',
  },
  successProgress: {
    width: '100%', alignItems: 'center',
    marginBottom: 24,
  },
  successProgressBg: {
    width: '100%', height: 8,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 4, overflow: 'hidden',
    marginBottom: 8,
  },
  successProgressFill: {
    height: '100%', backgroundColor: Colors.success,
    borderRadius: 4,
  },
  successProgressText: {
    fontSize: 14, color: 'rgba(255,255,255,0.7)', fontWeight: '600',
  },
  allDoneBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(255, 215, 0, 0.15)',
    paddingHorizontal: 20, paddingVertical: 12,
    borderRadius: Radius.md, marginBottom: 24,
    borderWidth: 1, borderColor: 'rgba(255, 215, 0, 0.3)',
  },
  allDoneText: {
    fontSize: 15, fontWeight: '700', color: '#FFD700',
  },
  successBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: Colors.primary,
    paddingHorizontal: 28, paddingVertical: 16,
    borderRadius: Radius.md,
  },
  successBtnText: {
    fontSize: 16, fontWeight: '700', color: '#fff',
  },

  // ===== Permission Screen =====
  permWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  permTitle: { fontSize: 18, fontWeight: '700', color: '#fff', marginTop: 16, marginBottom: 8 },
  permDesc: {
    fontSize: 14, color: 'rgba(255,255,255,0.5)', textAlign: 'center',
    marginBottom: 24, lineHeight: 20,
  },
  permBtn: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 32, paddingVertical: 14,
    borderRadius: Radius.md, marginBottom: 12,
  },
  permBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  permCancelText: { fontSize: 14, color: 'rgba(255,255,255,0.6)', marginTop: 8 },

  // ===== Manual Input Modal =====
  modalOv: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalCard: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 24,
  },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginBottom: 8,
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: Colors.textPrimary },
  modalDesc: {
    fontSize: 13, color: Colors.textMuted,
    marginBottom: 16, lineHeight: 18,
  },
  modalInput: {
    borderWidth: 1.5, borderColor: Colors.border,
    borderRadius: Radius.md, paddingHorizontal: 14, height: 48,
    fontSize: 15, marginBottom: 16, color: Colors.textPrimary,
  },
  modalActs: { flexDirection: 'row', gap: 10 },
});