/**
 * ABSENSI SCREEN - Real GPS + Geofence + Camera
 * 
 * Flow:
 * 1. App minta izin GPS â†’ ambil koordinat HP
 * 2. Reverse geocode â†’ dapat alamat
 * 3. Cek geofence: hitung jarak ke pos_jaga terdekat
 * 4. Jika dalam radius â†’ bisa absen
 * 5. Jika di luar radius â†’ peringatan, absen tetap tercatat tapi ditandai
 * 6. Selfie â†’ upload â†’ simpan ke DB
 */
import React, { useState, useMemo, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Image, ActivityIndicator,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Radius } from '../../constants';
import { Card, Badge, Button, CameraModal } from '../../components';
import { useAuthStore } from '../../stores/authStore';
import { useDataStore } from '../../stores/dataStore';
import { useClock } from '../../hooks/useClock';
import { uploadAbsensiPhoto } from '../../services/photoUpload';
import { useI18n } from '../../lib/i18n';
import { useTheme } from '../../lib/theme';
import {
  getCurrentLocation, checkGeofence, formatDistance,
  type GeofenceResult,
} from '../../services/locationService';

export default function AbsensiScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  const { theme, isDark } = useTheme();
  const user = useAuthStore((s) => s.user);
  const { jam, tanggal, tanggalPendek } = useClock();
  const addAbsensi = useDataStore((s) => s.addAbsensi);
  const absensiRecords = useDataStore((s) => s.absensiRecords);

  const todayAbs = useMemo(() => {
    // BUG #1 (P2-8, Tahap 8): the previous implementation built a
    // formatted Indonesian string ("15 Feb 2026") and used string
    // equality against r.tanggal. That breaks if the formatter on
    // either side ever changes â€” and "Mei"/"Agu"/"Okt"/"Des" are not
    // recognized by V8's Date parser, so a naive `new Date(r.tanggal)`
    // would also fail. We parse the Indonesian short-month format
    // back to a real Date, then compare via getFullYear / getMonth /
    // getDate which is fully locale-independent.
    const ID_MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
    const parseIdShortDate = (s: string | undefined | null): Date | null => {
      if (!s || typeof s !== 'string') return null;
      // Match "DD MMM YYYY" with Indonesian short month names.
      const m = /^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/.exec(s.trim());
      if (m) {
        const monIdx = ID_MONTH_SHORT.indexOf(m[2]);
        if (monIdx >= 0) {
          return new Date(parseInt(m[3], 10), monIdx, parseInt(m[1], 10));
        }
      }
      // Fallback: try the native parser (handles ISO timestamps coming
      // straight from the server, e.g. created_at).
      const d = new Date(s);
      return isNaN(d.getTime()) ? null : d;
    };
    const isSameDay = (a: Date, b: Date) =>
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate();

    const now = new Date();
    const uid = user?.id || 'T1';
    const recs = absensiRecords.filter((r) => {
      if (r.userId !== uid) return false;
      // `r.tanggal` is the Indonesian short-format string; fall back to
      // any `created_at` (ISO) the record may carry from offline sync.
      const recDate = parseIdShortDate(r.tanggal) || parseIdShortDate((r as any).created_at);
      return recDate ? isSameDay(recDate, now) : false;
    });
    return { masuk: recs.find((r) => r.tipe === 'masuk'), keluar: recs.find((r) => r.tipe === 'keluar') };
  }, [absensiRecords, user?.id]);

  const [location, setLocation] = useState<any>(null);
  const [geofence, setGeofence] = useState<GeofenceResult | null>(null);
  const [loadingGps, setLoadingGps] = useState(true);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [showCamera, setShowCamera] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const tipe = todayAbs.masuk && !todayAbs.keluar ? 'keluar' : 'masuk';
  const isAlreadyDone = todayAbs.masuk && todayAbs.keluar;

  useEffect(() => { fetchLocation(); }, []);

  const fetchLocation = async () => {
    setLoadingGps(true);
    setGpsError(null);
    const loc = await getCurrentLocation();
    if (!loc) { setGpsError('Tidak dapat mengakses GPS.\n\nâ€¢ Pastikan GPS/Lokasi HP aktif\nâ€¢ Beri izin akses lokasi pada aplikasi\nâ€¢ Coba di area terbuka'); setLoadingGps(false); return; }
    setLocation(loc);

    // Try local geofence check first
    const posJagaList = useDataStore.getState().lokasi?.flatMap((l: any) => l.posList || []) || [];
    let gf = checkGeofence(loc.coords.latitude, loc.coords.longitude, posJagaList);

    // If local check returns null (no pos data), try server-side geofence
    if (!gf) {
      try {
        const { geofenceApi } = await import('../../lib/apiClient');
        const serverResult = await geofenceApi.check(loc.coords.latitude, loc.coords.longitude, loc.coords.accuracy ?? undefined);
        if (serverResult && serverResult.lokasi_nama) {
          gf = {
            isInside: serverResult.dalam_radius,
            distance: serverResult.jarak || 0,
            posName: serverResult.lokasi_nama || '-',
            posId: '',
            radius: serverResult.radius || 100,
          };
          console.log('[Absensi] Using server geofence result:', gf);
        }
      } catch (e) {
        console.log('[Absensi] Server geofence check failed:', e);
      }
    }

    setGeofence(gf);
    setLoadingGps(false);
  };

  const handleSubmit = async () => {
    if (!photoUri) return Alert.alert('Error', 'Silakan ambil foto selfie terlebih dahulu');
    if (!location) return Alert.alert('Error', 'Lokasi GPS belum tersedia. Tekan Refresh GPS.');

    if (geofence && !geofence.isInside) {
      Alert.alert(
        'âš ï¸ Di Luar Radius Pos',
        `Anda berada ${formatDistance(geofence.distance)} dari ${geofence.posName} (radius ${geofence.radius}m).\n\nAbsensi tetap dicatat tapi ditandai "Di Luar Radius".`,
        [{ text: 'Batal', style: 'cancel' }, { text: 'Tetap Absen', onPress: doSubmit }],
      );
      return;
    }
    doSubmit();
  };

  const doSubmit = async () => {
    if (!location) return;
    setSubmitting(true);
    // Build watermark info for backend
    const wmInfo = {
      nama: user?.nama || 'User',
      nrp: user?.nrp || '000000',
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
      lokasi: geofence?.posName || '-',
      customText: `ABSENSI ${tipe.toUpperCase()}`,
    };
    const uploadedUrl = await uploadAbsensiPhoto(photoUri!, user?.id || 'unknown', wmInfo);

    const now = new Date();
    const shiftStart = user?.shift?.split('-')[0] || '08:00';
    const [shiftH, shiftM] = shiftStart.split(':').map(Number);
    const isLate = tipe === 'masuk' && (now.getHours() > shiftH || (now.getHours() === shiftH && now.getMinutes() > shiftM + 5));
    const isInsideRadius = geofence ? geofence.isInside : true;

    addAbsensi({
      userId: user?.id || 'T1', nama: user?.nama || 'User', nrp: user?.nrp || '000000', tipe, waktu: jam, tanggal: tanggalPendek, fotoUri: uploadedUrl,
      latitude: location.coords.latitude, longitude: location.coords.longitude, alamat: location.address,
      posJaga: geofence?.posName || '-', status: isLate ? 'terlambat' : 'hadir', dalamRadius: isInsideRadius,
    });

    if (!isInsideRadius && geofence) {
      useDataStore.getState().addNotifikasi({
        tipe: 'warning', judul: 'Absensi Di Luar Radius',
        pesan: `${user?.nama} absen ${tipe} di luar radius ${geofence.posName} (${formatDistance(geofence.distance)})`,
        waktu: new Date().toISOString(), targetRole: ['komandan', 'supervisor'], targetUserId: null, dibaca: false,
      });
    }
    setSubmitting(false);
    setSuccess(true);
  };

  if (isAlreadyDone) {
    return (
      <View style={styles.container}>
        <View style={[styles.header, { paddingTop: insets.top + 12 }]}><TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}><Ionicons name="arrow-back" size={24} color={Colors.textPrimary} /></TouchableOpacity><Text style={styles.headerTitle}>Absensi</Text><View style={{ width: 40 }} /></View>
        <ScrollView contentContainerStyle={styles.content}>
          {/* Info Sudah Absen */}
          <Card style={{ marginBottom: 16, backgroundColor: '#F0FDF4', borderWidth: 1, borderColor: '#BBF7D0' }}>
            <View style={{ alignItems: 'center', paddingVertical: 16 }}>
              <Ionicons name="checkmark-circle" size={56} color={Colors.success} />
              <Text style={[styles.doneTitle, { marginTop: 8 }]}>Absensi Hari Ini Selesai âœ“</Text>
              <Text style={styles.doneText}>Masuk: {todayAbs.masuk?.waktu} â€¢ Keluar: {todayAbs.keluar?.waktu}</Text>
            </View>
          </Card>

          {/* Info Pekerjaan */}
          <Card style={{ marginBottom: 12 }}>
            <Text style={styles.cardTitle}>ðŸ“‹ Info Penugasan Hari Ini</Text>
            <View style={{ gap: 8, marginTop: 8 }}>
              <View style={styles.shiftRow}><Ionicons name="person" size={16} color={Colors.primary} /><Text style={styles.shiftText}>{user?.nama || '-'} ({user?.nrp || '-'})</Text></View>
              <View style={styles.shiftRow}><Ionicons name="time" size={16} color={Colors.success} /><Text style={styles.shiftText}>Shift: {user?.shift || '08:00-16:00'} WIB</Text></View>
              <View style={styles.shiftRow}><Ionicons name="location" size={16} color={Colors.primary} /><Text style={styles.shiftText}>Lokasi: {geofence?.posName || user?.posJaga || 'Belum ditentukan'}</Text></View>
              <View style={styles.shiftRow}><Ionicons name="shield-checkmark" size={16} color={Colors.success} /><Text style={styles.shiftText}>Status: On Duty</Text></View>
            </View>
          </Card>

          {/* GPS Status */}
          <Card style={{ marginBottom: 12 }}>
            <Text style={styles.cardTitle}>ðŸ“ Posisi Saat Ini</Text>
            {location ? (
              <View style={{ marginTop: 8 }}>
                <View style={styles.gpsRow}><Ionicons name="location" size={18} color={Colors.success} /><Text style={styles.gpsAddr} numberOfLines={2}>{location.address}</Text></View>
                <View style={styles.gpsRow}><Ionicons name="navigate" size={14} color={Colors.textMuted} /><Text style={styles.gpsCoord}>{location.coords.latitude.toFixed(5)}, {location.coords.longitude.toFixed(5)}</Text></View>
                {geofence && (
                  <View style={[styles.geofenceBox, { backgroundColor: geofence.isInside ? Colors.successBg : '#FEF3C7' }]}>
                    <Ionicons name={geofence.isInside ? 'shield-checkmark' : 'alert-circle'} size={18} color={geofence.isInside ? Colors.success : '#D97706'} />
                    <Text style={[styles.geofenceTitle, { color: geofence.isInside ? Colors.success : '#D97706', marginLeft: 8 }]}>{geofence.isInside ? 'Dalam Radius âœ“' : 'âš ï¸ Di Luar Radius'}</Text>
                  </View>
                )}
              </View>
            ) : (
              <TouchableOpacity onPress={fetchLocation} style={{ marginTop: 8, padding: 12, alignItems: 'center' }}>
                <Ionicons name="refresh" size={24} color={Colors.primary} />
                <Text style={{ color: Colors.primary, marginTop: 4 }}>Ambil Lokasi</Text>
              </TouchableOpacity>
            )}
          </Card>

          <Button title="Kembali ke Dashboard" variant="primary" size="large" fullWidth onPress={() => navigation.goBack()} style={{ marginTop: 8 }} />
          <View style={{ height: 32 }} />
        </ScrollView>
      </View>
    );
  }

  if (success) {
    return (
      <View style={styles.container}>
        <View style={[styles.header, { paddingTop: insets.top + 12 }]}><TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}><Ionicons name="arrow-back" size={24} color={Colors.textPrimary} /></TouchableOpacity><Text style={styles.headerTitle}>Absensi</Text><View style={{ width: 40 }} /></View>
        <View style={styles.doneWrap}>
          <View style={styles.successCircle}><Ionicons name="checkmark" size={48} color="#fff" /></View>
          <Text style={styles.doneTitle}>Absensi {tipe === 'masuk' ? 'Masuk' : 'Keluar'} Berhasil!</Text>
          <Text style={styles.doneText}>Tercatat pukul {jam} WIB</Text>
          {geofence && <Text style={styles.doneText}>{geofence.posName} â€¢ {formatDistance(geofence.distance)}</Text>}
          {geofence && !geofence.isInside && <Badge text={`âš ï¸ Di luar radius (${formatDistance(geofence.distance)})`} variant="warning" style={{ marginTop: 8 }} />}
          {photoUri && <Image source={{ uri: photoUri }} style={styles.successPhoto} />}
          <Button title="Kembali ke Dashboard" variant="primary" size="large" onPress={() => navigation.goBack()} style={{ marginTop: 20 }} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}><TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}><Ionicons name="arrow-back" size={24} color={Colors.textPrimary} /></TouchableOpacity><Text style={styles.headerTitle}>Absensi {tipe === 'masuk' ? 'Masuk' : 'Keluar'}</Text><View style={styles.liveRow}><View style={styles.liveDot} /><Text style={styles.liveTime}>{jam}</Text></View></View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.dateLabel}>{tanggal}</Text>

        {/* Camera */}
        <Card style={styles.cameraCard}>
          <Text style={styles.cardTitle}>ðŸ“¸ Foto Selfie</Text>
          {!photoUri ? (
            <View style={styles.cameraPlaceholder}>
              <View style={styles.ovalGuide}><Ionicons name="person" size={48} color={Colors.textMuted} /></View>
              <Text style={styles.cameraHint}>Posisikan wajah dalam oval</Text>
              <Button title="Buka Kamera" variant="primary" size="medium" icon="camera-outline" onPress={() => setShowCamera(true)} style={{ marginTop: 12 }} />
            </View>
          ) : (
            <View style={styles.photoPreview}>
              <Image source={{ uri: photoUri }} style={styles.capturedPhoto} />
              <Badge text="âœ“ Foto Diambil" variant="success" />
              <View style={styles.photoActions}>
                <Button title="Ulangi" variant="outline" size="small" icon="refresh-outline" onPress={() => { setPhotoUri(null); setShowCamera(true); }} style={{ flex: 1 }} />
              </View>
            </View>
          )}
        </Card>

        {/* GPS */}
        <Card style={styles.gpsCard}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <Text style={styles.cardTitle}>ðŸ“ Lokasi GPS</Text>
            <TouchableOpacity onPress={fetchLocation} style={styles.refreshBtn}><Ionicons name="refresh" size={16} color={Colors.primary} /><Text style={{ fontSize: 12, color: Colors.primary, fontWeight: '600', marginLeft: 4 }}>Refresh</Text></TouchableOpacity>
          </View>
          {loadingGps ? (
            <View style={styles.gpsLoading}><ActivityIndicator color={Colors.primary} /><Text style={styles.gpsLoadingText}>Mengambil lokasi GPS...</Text></View>
          ) : gpsError ? (
            <View style={styles.gpsErrorWrap}><Ionicons name="warning" size={24} color={Colors.danger} /><Text style={styles.gpsErrorText}>{gpsError}</Text><Button title="Coba Lagi" variant="outline" size="small" onPress={fetchLocation} style={{ marginTop: 8 }} /></View>
          ) : location ? (
            <View>
              <View style={styles.gpsRow}><Ionicons name="location" size={20} color={Colors.success} /><Text style={styles.gpsAddr} numberOfLines={2}>{location.address}</Text></View>
              <View style={styles.gpsRow}><Ionicons name="navigate" size={16} color={Colors.textMuted} /><Text style={styles.gpsCoord}>{location.coords.latitude.toFixed(5)}, {location.coords.longitude.toFixed(5)}{location.coords.accuracy ? ` (Â±${Math.round(location.coords.accuracy)}m)` : ''}</Text></View>
              {geofence ? (
                <View style={[styles.geofenceBox, { backgroundColor: geofence.isInside ? Colors.successBg : '#FEF3C7' }]}>
                  <Ionicons name={geofence.isInside ? 'shield-checkmark' : 'alert-circle'} size={20} color={geofence.isInside ? Colors.success : '#D97706'} />
                  <View style={{ flex: 1, marginLeft: 8 }}>
                    <Text style={[styles.geofenceTitle, { color: geofence.isInside ? Colors.success : '#D97706' }]}>{geofence.isInside ? 'Dalam Radius Pos âœ“' : 'âš ï¸ Di Luar Radius Pos'}</Text>
                    <Text style={styles.geofenceDetail}>{geofence.posName} â€¢ {formatDistance(geofence.distance)} dari pos (radius {geofence.radius}m)</Text>
                  </View>
                </View>
              ) : (
                <View style={[styles.geofenceBox, { backgroundColor: '#F1F5F9' }]}><Ionicons name="help-circle" size={20} color={Colors.textMuted} /><Text style={{ marginLeft: 8, fontSize: 12, color: Colors.textMuted }}>Tidak ada pos jaga terdaftar di area ini</Text></View>
              )}
            </View>
          ) : null}
        </Card>

        {/* Shift */}
        <Card variant="bordered" borderColor={Colors.success} style={{ marginTop: 12 }}>
          <View style={styles.shiftRow}><Ionicons name="time" size={18} color={Colors.success} /><Text style={styles.shiftText}>Shift: {user?.shift || '08:00-16:00'} WIB</Text></View>
        </Card>

        <Button title={submitting ? 'Mengirim...' : `KIRIM ABSENSI ${tipe.toUpperCase()}`} variant={tipe === 'masuk' ? 'success' : 'danger'} size="large" fullWidth icon={tipe === 'masuk' ? 'log-in-outline' : 'log-out-outline'} onPress={handleSubmit} disabled={!photoUri || submitting || loadingGps} style={{ marginTop: 16 }} />
        <View style={{ height: 32 }} />
      </ScrollView>

      <CameraModal visible={showCamera} onClose={() => setShowCamera(false)} onCapture={(uri: string) => { setPhotoUri(uri); setShowCamera(false); }} initialFacing="front" showFaceGuide={true} title="Selfie Absensi" allowFlip={true} allowGallery={false} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgLight },
  header: { flexDirection: 'row', alignItems: 'center', paddingBottom: 12, paddingHorizontal: Spacing.base, backgroundColor: Colors.bgWhite, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  headerTitle: { ...Typography.h3, color: Colors.textPrimary, flex: 1, textAlign: 'center' },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.success },
  liveTime: { ...Typography.bodyBold, color: Colors.success, fontVariant: ['tabular-nums'] },
  content: { padding: Spacing.base },
  dateLabel: { ...Typography.small, color: Colors.textMuted, marginBottom: 12 },
  cameraCard: { marginBottom: 12 },
  cardTitle: { ...Typography.bodyBold, color: Colors.textPrimary, marginBottom: 8 },
  cameraPlaceholder: { alignItems: 'center', paddingVertical: 20 },
  ovalGuide: { width: 120, height: 150, borderRadius: 60, borderWidth: 2, borderStyle: 'dashed', borderColor: Colors.primary, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.primaryBg },
  cameraHint: { ...Typography.small, color: Colors.textMuted, marginTop: 8 },
  photoPreview: { alignItems: 'center', gap: 10 },
  capturedPhoto: { width: 180, height: 220, borderRadius: 12, backgroundColor: Colors.bgGray },
  photoActions: { flexDirection: 'row', gap: 10, width: '100%', marginTop: 4 },
  successPhoto: { width: 120, height: 150, borderRadius: 10, marginTop: 16, borderWidth: 2, borderColor: Colors.success },
  gpsCard: { marginBottom: 12 },
  refreshBtn: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4, paddingHorizontal: 10, borderRadius: 16, backgroundColor: Colors.primaryBg },
  gpsLoading: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 16 },
  gpsLoadingText: { ...Typography.small, color: Colors.textMuted },
  gpsErrorWrap: { alignItems: 'center', paddingVertical: 16 },
  gpsErrorText: { ...Typography.small, color: Colors.danger, textAlign: 'center', marginTop: 8 },
  gpsRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  gpsAddr: { ...Typography.small, color: Colors.textPrimary, flex: 1 },
  gpsCoord: { ...Typography.caption, color: Colors.textMuted },
  geofenceBox: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: Radius.md, marginTop: 8 },
  geofenceTitle: { fontSize: 13, fontWeight: '700' },
  geofenceDetail: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  shiftRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  shiftText: { ...Typography.smallBold, color: Colors.textPrimary, flex: 1 },
  doneWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  successCircle: { width: 80, height: 80, borderRadius: 40, backgroundColor: Colors.success, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  doneTitle: { ...Typography.h3, color: Colors.textPrimary, textAlign: 'center' },
  doneText: { ...Typography.body, color: Colors.textMuted, textAlign: 'center', marginTop: 4 },
});
============================================================
