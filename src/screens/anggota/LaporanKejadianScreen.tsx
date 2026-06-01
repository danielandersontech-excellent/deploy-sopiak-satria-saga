/**
 * LAPORAN KEJADIAN - Real Camera Integration
 * Uses CameraModal for evidence photo capture + ImagePicker for gallery
 */
import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, Modal, Image, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Colors, Typography, Spacing, Radius } from '../../constants';
import { Card, Badge, Button, CameraModal } from '../../components';
import { useAuthStore } from '../../stores/authStore';
import { useDataStore } from '../../stores/dataStore';
import { uploadKejadianPhotos } from '../../services/photoUpload';
import { useClock } from '../../hooks/useClock';
import { getCurrentLocation } from '../../services/locationService';
import { useI18n } from '../../lib/i18n';
import { useTheme } from '../../lib/theme';

const JENIS = ['Pencurian', 'Vandalisme', 'Kebakaran', 'Orang Mencurigakan', 'Konflik', 'Kecelakaan', 'Lainnya'];
const PRIORITAS = [
  { key: 'rendah', label: 'Rendah', color: Colors.textMuted },
  { key: 'sedang', label: 'Sedang', color: Colors.warning },
  { key: 'tinggi', label: 'Tinggi', color: '#e67e22' },
  { key: 'kritis', label: 'KRITIS', color: Colors.danger },
] as const;

export default function LaporanKejadianScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  const { theme, isDark } = useTheme();
  const user = useAuthStore((s) => s.user);
  const { jam, tanggal } = useClock();
  const addLaporanKejadian = useDataStore((s) => s.addLaporanKejadian);

  // GPS
  const [loc, setLoc] = useState<any>(null);
  const [loadingGps, setLoadingGps] = useState(true);
  useEffect(() => {
    (async () => {
      const l = await getCurrentLocation();
      setLoc(l);
      setLoadingGps(false);
    })();
  }, []);

  const [jenis, setJenis] = useState('');
  const [showJenisPicker, setShowJenisPicker] = useState(false);
  const [prioritas, setPrioritas] = useState<'rendah' | 'sedang' | 'tinggi' | 'kritis'>('sedang');
  const [kronologi, setKronologi] = useState('');
  const [buktiUris, setBuktiUris] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [showCamera, setShowCamera] = useState(false);

  const canSubmit = jenis && kronologi.length >= 100;

  const handleCameraCapture = (uri: string) => {
    if (buktiUris.length < 10) {
      setBuktiUris((prev) => [...prev, uri]);
    }
    setShowCamera(false);
  };

  const handlePickGallery = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Izin Diperlukan', 'Akses galeri diperlukan untuk memilih foto.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
        selectionLimit: 10 - buktiUris.length,
        quality: 0.7,
      });

      if (!result.canceled && result.assets.length > 0) {
        const newUris = result.assets.map((a) => a.uri).slice(0, 10 - buktiUris.length);
        setBuktiUris((prev) => [...prev, ...newUris]);
      }
    } catch (err) {
      console.error('Gallery picker error:', err);
    }
  };

  const handleRemoveBukti = (index: number) => {
    setBuktiUris((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = () => {
    if (!canSubmit) return Alert.alert('Error', 'Jenis kejadian dan kronologi (min 100 karakter) wajib diisi');
    Alert.alert('Konfirmasi Kirim', `Kirim laporan ${jenis} (${prioritas.toUpperCase()})?`, [
      { text: 'Batal', style: 'cancel' },
      { text: 'Kirim', onPress: doSubmit },
    ]);
  };

  const doSubmit = async () => {
    setSubmitting(true);

    // Upload evidence photos to server
    const uploadedUrls = buktiUris.length > 0
      ? await uploadKejadianPhotos(buktiUris, user?.id || 'unknown')
      : [];

    addLaporanKejadian({
      userId: user?.id || 'T1', nama: user?.nama || 'User', nrp: user?.nrp || '220001',
      jenis, prioritas, waktuKejadian: jam, lokasi: loc?.address || 'Lokasi tidak tersedia',
      latitude: loc?.coords.latitude || 0, longitude: loc?.coords.longitude || 0, kronologi, buktiMedia: uploadedUrls,
      status: 'pending', catatanKomandan: '', waktuSubmit: jam,
    });
    setSubmitting(false);
    setShowSuccess(true);
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}><Ionicons name="arrow-back" size={24} color={Colors.textPrimary} /></TouchableOpacity>
        <Text style={styles.headerTitle}>Laporan Kejadian</Text>
        <View style={{ width: 40 }} />
      </View>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Alert */}
        <Card variant="bordered" borderColor={Colors.danger} style={styles.alertCard}>
          <View style={styles.alertRow}>
            <Ionicons name="warning" size={20} color={Colors.danger} />
            <Text style={styles.alertText}>Untuk darurat, tekan tombol PANIC BUTTON di dashboard</Text>
          </View>
        </Card>

        {/* Jenis Kejadian */}
        <Text style={styles.fieldLabel}>Jenis Kejadian *</Text>
        <TouchableOpacity style={styles.pickerBtn} onPress={() => setShowJenisPicker(!showJenisPicker)}>
          <Text style={[styles.pickerText, !jenis && { color: Colors.textMuted }]}>{jenis || 'Pilih jenis kejadian'}</Text>
          <Ionicons name="chevron-down" size={20} color={Colors.textMuted} />
        </TouchableOpacity>
        {showJenisPicker && (
          <View style={styles.pickerList}>
            {JENIS.map((j) => (
              <TouchableOpacity key={j} style={[styles.pickerItem, jenis === j && styles.pickerItemActive]} onPress={() => { setJenis(j); setShowJenisPicker(false); }}>
                <Text style={[styles.pickerItemText, jenis === j && { color: Colors.primary, fontWeight: '600' }]}>{j}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Prioritas */}
        <Text style={styles.fieldLabel}>Prioritas *</Text>
        <View style={styles.chipRow}>
          {PRIORITAS.map((p) => (
            <TouchableOpacity key={p.key} style={[styles.prioChip, prioritas === p.key && { backgroundColor: p.color, borderColor: p.color }]} onPress={() => setPrioritas(p.key)}>
              <Text style={[styles.prioText, prioritas === p.key && { color: '#fff', fontWeight: '700' }]}>{p.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Waktu & Lokasi */}
        <View style={styles.metaRow}>
          <Card style={styles.metaCard}><Ionicons name="time" size={16} color={Colors.primary} /><Text style={styles.metaText}>{jam} WIB</Text></Card>
          <Card style={styles.metaCard}><Ionicons name="calendar" size={16} color={Colors.primary} /><Text style={styles.metaText}>{tanggal}</Text></Card>
        </View>
        <Card variant="bordered" borderColor={Colors.success} style={{ marginBottom: 12 }}>
          <View style={styles.locRow}><Ionicons name="location" size={18} color={loadingGps ? Colors.textMuted : Colors.success} /><Text style={styles.locText}>{loadingGps ? 'Mengambil lokasi...' : (loc?.address || 'GPS tidak tersedia')}</Text></View>
          <Text style={styles.coordText}>{loc ? `${loc.coords.latitude.toFixed(5)}, ${loc.coords.longitude.toFixed(5)}` : '-'}</Text>
        </Card>

        {/* Kronologi */}
        <Text style={styles.fieldLabel}>Kronologi Kejadian *</Text>
        <View>
          <TextInput style={styles.textarea} multiline numberOfLines={8} textAlignVertical="top" placeholder="Deskripsikan kronologi kejadian secara detail... (min 100 karakter)" placeholderTextColor={Colors.textMuted} value={kronologi} onChangeText={setKronologi} maxLength={1000} />
          <Text style={[styles.charCount, kronologi.length < 100 && { color: Colors.danger }]}>{kronologi.length}/1000 {kronologi.length < 100 ? `(min ${100 - kronologi.length} lagi)` : 'âœ“'}</Text>
        </View>

        {/* Bukti Media - Real Camera & Gallery */}
        <Text style={styles.fieldLabel}>Bukti Media ({buktiUris.length}/10)</Text>
        <View style={styles.buktiRow}>
          <Button
            title="Ambil Foto"
            variant="outline"
            size="small"
            icon="camera-outline"
            onPress={() => {
              if (buktiUris.length >= 10) {
                Alert.alert('Maksimum', 'Maksimal 10 foto bukti.');
                return;
              }
              setShowCamera(true);
            }}
            style={{ flex: 1 }}
          />
          <Button
            title="Pilih Galeri"
            variant="outline"
            size="small"
            icon="images-outline"
            onPress={() => {
              if (buktiUris.length >= 10) {
                Alert.alert('Maksimum', 'Maksimal 10 foto bukti.');
                return;
              }
              handlePickGallery();
            }}
            style={{ flex: 1 }}
          />
        </View>
        {buktiUris.length > 0 && (
          <View style={styles.photoGrid}>
            {buktiUris.map((uri, i) => (
              <View key={i} style={styles.photoThumb}>
                <Image source={{ uri }} style={styles.thumbImage} />
                <TouchableOpacity style={styles.photoRemove} onPress={() => handleRemoveBukti(i)}>
                  <Ionicons name="close-circle" size={20} color={Colors.danger} />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {/* Actions */}
        <View style={styles.actionRow}>
          <Button title="Simpan Draft" variant="outline" size="medium" icon="save-outline" onPress={() => Alert.alert('Draft Disimpan')} style={{ flex: 1 }} />
          <Button title={submitting ? 'Mengirim...' : 'KIRIM LAPORAN'} variant="danger" size="medium" icon="send-outline" onPress={handleSubmit} disabled={!canSubmit || submitting} style={{ flex: 1.5 }} />
        </View>
        <View style={{ height: 32 }} />
      </ScrollView>

      {/* Real Camera Modal for evidence photos */}
      <CameraModal
        visible={showCamera}
        onClose={() => setShowCamera(false)}
        onCapture={handleCameraCapture}
        initialFacing="back"
        showFaceGuide={false}
        title="Foto Bukti Kejadian"
        allowFlip={true}
        allowGallery={true}
      />

      <Modal visible={showSuccess} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.successCircle}><Ionicons name="checkmark" size={40} color="#fff" /></View>
            <Text style={styles.modalTitle}>Laporan Kejadian Terkirim!</Text>
            <Text style={styles.modalDesc}>Komandan dan Supervisor akan segera ditindaklanjuti</Text>
            {buktiUris.length > 0 && (
              <Text style={styles.modalBukti}>{buktiUris.length} foto bukti terlampir</Text>
            )}
            <Button title="Kembali" variant="primary" size="large" fullWidth onPress={() => { setShowSuccess(false); navigation.goBack(); }} />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgLight },
  header: { flexDirection: 'row', alignItems: 'center', paddingBottom: 12, paddingHorizontal: Spacing.base, backgroundColor: Colors.bgWhite, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  headerTitle: { ...Typography.h3, color: Colors.textPrimary, flex: 1, textAlign: 'center' },
  content: { padding: Spacing.base },
  alertCard: { marginBottom: 12, backgroundColor: Colors.dangerBg },
  alertRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  alertText: { ...Typography.small, color: Colors.dangerDark, flex: 1 },
  fieldLabel: { ...Typography.bodyBold, color: Colors.textPrimary, marginBottom: 8, marginTop: 8 },
  pickerBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1.5, borderColor: Colors.border, borderRadius: Radius.md, paddingHorizontal: 14, height: 48, backgroundColor: Colors.bgWhite },
  pickerText: { ...Typography.body, color: Colors.textPrimary },
  pickerList: { borderWidth: 1, borderColor: Colors.borderLight, borderRadius: Radius.md, overflow: 'hidden', marginTop: 4, marginBottom: 8 },
  pickerItem: { paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  pickerItemActive: { backgroundColor: Colors.primaryBg },
  pickerItemText: { ...Typography.body, color: Colors.textPrimary },
  chipRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  prioChip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: Radius.full, borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.bgWhite },
  prioText: { ...Typography.smallBold, color: Colors.textSecondary },
  metaRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  metaCard: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12 },
  metaText: { ...Typography.smallBold, color: Colors.textPrimary },
  locRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  locText: { ...Typography.small, color: Colors.textPrimary, flex: 1 },
  coordText: { ...Typography.caption, color: Colors.textMuted, marginTop: 4 },
  textarea: { borderWidth: 1.5, borderColor: Colors.border, borderRadius: Radius.md, padding: 14, ...Typography.body, color: Colors.textPrimary, height: 150, backgroundColor: Colors.bgWhite },
  charCount: { ...Typography.caption, color: Colors.textMuted, textAlign: 'right', marginTop: 4 },
  buktiRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  photoThumb: { width: 72, height: 72, borderRadius: Radius.md, backgroundColor: Colors.primaryBg, position: 'relative', overflow: 'visible' },
  thumbImage: { width: 72, height: 72, borderRadius: Radius.md },
  photoRemove: { position: 'absolute', top: -6, right: -6, backgroundColor: '#fff', borderRadius: 10 },
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 32 },
  modalCard: { backgroundColor: '#fff', borderRadius: Radius.lg, padding: 24, alignItems: 'center' },
  successCircle: { width: 72, height: 72, borderRadius: 36, backgroundColor: Colors.success, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  modalTitle: { ...Typography.h3, color: Colors.textPrimary, marginBottom: 4 },
  modalDesc: { ...Typography.body, color: Colors.textMuted, marginBottom: 8, textAlign: 'center' },
  modalBukti: { ...Typography.small, color: Colors.success, marginBottom: 16 },
});
============================================================
