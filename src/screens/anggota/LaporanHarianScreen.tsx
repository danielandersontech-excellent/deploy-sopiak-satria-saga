/**
 * LAPORAN HARIAN - Real Camera Integration
 * Uses CameraModal for documentation photos + ImagePicker for gallery
 */
import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, Modal, Image,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Colors, Typography, Spacing, Radius, Shadows } from '../../constants';
import { Card, Badge, Button, CameraModal } from '../../components';
import { useAuthStore } from '../../stores/authStore';
import { useDataStore } from '../../stores/dataStore';
import { uploadEvidencePhotos } from '../../services/photoUpload';
import { useClock } from '../../hooks/useClock';
import { useI18n } from '../../lib/i18n';
import { useTheme } from '../../lib/theme';

const KONDISI_OPTIONS = [
  { key: 'aman', label: 'Aman', color: Colors.success, icon: 'âœ…' },
  { key: 'ada_masalah', label: 'Ada Masalah', color: Colors.warning, icon: 'âš ï¸' },
  { key: 'perhatian_khusus', label: 'Perhatian Khusus', color: Colors.danger, icon: 'ðŸ”´' },
] as const;

export default function LaporanHarianScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  const { theme, isDark } = useTheme();
  const user = useAuthStore((s) => s.user);
  const { tanggal } = useClock();
  const addLaporanHarian = useDataStore((s) => s.addLaporanHarian);

  const [kondisi, setKondisi] = useState<'aman' | 'ada_masalah' | 'perhatian_khusus'>('aman');
  const [aktivitas, setAktivitas] = useState('');
  const [temuan, setTemuan] = useState('');
  const [fotoUris, setFotoUris] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [showCamera, setShowCamera] = useState(false);

  const canSubmit = aktivitas.length >= 50;

  const handleCameraCapture = (uri: string) => {
    if (fotoUris.length < 5) {
      setFotoUris((prev) => [...prev, uri]);
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
        selectionLimit: 5 - fotoUris.length,
        quality: 0.7,
      });
      if (!result.canceled && result.assets.length > 0) {
        const newUris = result.assets.map((a) => a.uri).slice(0, 5 - fotoUris.length);
        setFotoUris((prev) => [...prev, ...newUris]);
      }
    } catch (err) {
      console.error('Gallery picker error:', err);
    }
  };

  const handleRemovePhoto = (idx: number) => {
    setFotoUris((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = async () => {
    if (!canSubmit) return Alert.alert('Error', 'Aktivitas minimal 50 karakter');
    setSubmitting(true);

    // Upload photos to server
    const uploadedUrls = fotoUris.length > 0
      ? await uploadEvidencePhotos(fotoUris, user?.id || 'unknown')
      : [];

    addLaporanHarian({
      userId: user?.id || 'T1',
      nama: user?.nama || 'User',
      nrp: user?.nrp || '220001',
      tanggal,
      shift: user?.shift || '08:00-16:00',
      posJaga: user?.posJaga || 'Pos Utama',
      kondisi,
      aktivitas,
      temuan,
      fotos: uploadedUrls,
      status: 'pending',
      catatanKomandan: '',
      waktuSubmit: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
    });

    setSubmitting(false);
    setShowSuccess(true);
  };

  const handleSaveDraft = () => {
    Alert.alert('Draft Disimpan', 'Laporan tersimpan sebagai draft. Anda bisa melanjutkan nanti.');
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Laporan Harian</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Auto Info */}
        <Card variant="bordered" borderColor={Colors.primary} style={styles.infoCard}>
          <View style={styles.infoRow}><Text style={styles.infoLabel}>Nama</Text><Text style={styles.infoValue}>{user?.nama}</Text></View>
          <View style={styles.infoRow}><Text style={styles.infoLabel}>NRP</Text><Text style={styles.infoValue}>{user?.nrp}</Text></View>
          <View style={styles.infoRow}><Text style={styles.infoLabel}>Tanggal</Text><Text style={styles.infoValue}>{tanggal}</Text></View>
          <View style={styles.infoRow}><Text style={styles.infoLabel}>Shift</Text><Text style={styles.infoValue}>{user?.shift}</Text></View>
          <View style={[styles.infoRow, { borderBottomWidth: 0 }]}><Text style={styles.infoLabel}>Pos Jaga</Text><Text style={styles.infoValue}>{user?.posJaga}</Text></View>
        </Card>

        {/* Kondisi Umum */}
        <Text style={styles.fieldLabel}>Kondisi Umum</Text>
        <View style={styles.chipRow}>
          {KONDISI_OPTIONS.map((opt) => (
            <TouchableOpacity key={opt.key} style={[styles.chip, kondisi === opt.key && { backgroundColor: opt.color, borderColor: opt.color }]} onPress={() => setKondisi(opt.key)}>
              <Text style={styles.chipEmoji}>{opt.icon}</Text>
              <Text style={[styles.chipText, kondisi === opt.key && { color: '#fff' }]}>{opt.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Aktivitas */}
        <Text style={styles.fieldLabel}>Aktivitas & Kegiatan *</Text>
        <View style={styles.textareaWrap}>
          <TextInput
            style={styles.textarea}
            multiline
            numberOfLines={6}
            textAlignVertical="top"
            placeholder="Deskripsikan kegiatan selama shift Anda... (min 50 karakter)"
            placeholderTextColor={Colors.textMuted}
            value={aktivitas}
            onChangeText={setAktivitas}
            maxLength={500}
          />
          <Text style={[styles.charCount, aktivitas.length < 50 && { color: Colors.danger }]}>
            {aktivitas.length}/500 {aktivitas.length < 50 ? `(min ${50 - aktivitas.length} lagi)` : 'âœ“'}
          </Text>
        </View>

        {/* Temuan */}
        <Text style={styles.fieldLabel}>Temuan (Opsional)</Text>
        <TextInput
          style={[styles.textarea, { height: 80 }]}
          multiline
          textAlignVertical="top"
          placeholder="Temuan atau hal yang perlu ditindaklanjuti..."
          placeholderTextColor={Colors.textMuted}
          value={temuan}
          onChangeText={setTemuan}
        />

        {/* Foto Dokumentasi - Real Camera & Gallery */}
        <Text style={styles.fieldLabel}>Foto Dokumentasi ({fotoUris.length}/5)</Text>
        <View style={styles.btnRow}>
          <Button
            title="Kamera"
            variant="outline"
            size="small"
            icon="camera-outline"
            onPress={() => {
              if (fotoUris.length >= 5) { Alert.alert('Maksimal', 'Maksimal 5 foto'); return; }
              setShowCamera(true);
            }}
            style={{ flex: 1 }}
          />
          <Button
            title="Galeri"
            variant="outline"
            size="small"
            icon="images-outline"
            onPress={() => {
              if (fotoUris.length >= 5) { Alert.alert('Maksimal', 'Maksimal 5 foto'); return; }
              handlePickGallery();
            }}
            style={{ flex: 1 }}
          />
        </View>

        {/* Photo Grid - Real Photos */}
        <View style={styles.photoGrid}>
          {fotoUris.map((uri, idx) => (
            <View key={idx} style={styles.photoThumb}>
              <Image source={{ uri }} style={styles.thumbImage} />
              <TouchableOpacity style={styles.photoRemove} onPress={() => handleRemovePhoto(idx)}>
                <Ionicons name="close-circle" size={20} color={Colors.danger} />
              </TouchableOpacity>
            </View>
          ))}
          {fotoUris.length < 5 && fotoUris.length > 0 && (
            <TouchableOpacity style={styles.addPhotoBtn} onPress={() => setShowCamera(true)}>
              <Ionicons name="add" size={28} color={Colors.primary} />
              <Text style={styles.addPhotoText}>Tambah</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Actions */}
        <View style={styles.actionRow}>
          <Button title="Simpan Draft" variant="outline" size="medium" icon="save-outline" onPress={handleSaveDraft} style={{ flex: 1 }} />
          <Button title={submitting ? 'Mengirim...' : 'KIRIM LAPORAN'} variant="primary" size="medium" icon="send-outline" onPress={handleSubmit} disabled={!canSubmit || submitting} style={{ flex: 1.5 }} />
        </View>

        <View style={{ height: 32 }} />
      </ScrollView>

      {/* Real Camera Modal */}
      <CameraModal
        visible={showCamera}
        onClose={() => setShowCamera(false)}
        onCapture={handleCameraCapture}
        initialFacing="back"
        showFaceGuide={false}
        title="Foto Dokumentasi"
        allowFlip={true}
        allowGallery={true}
      />

      {/* Success Modal */}
      <Modal visible={showSuccess} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.successCircle}><Ionicons name="checkmark" size={40} color="#fff" /></View>
            <Text style={styles.modalTitle}>Laporan Terkirim! âœ…</Text>
            <Text style={styles.modalDesc}>Menunggu validasi dari Komandan</Text>
            {fotoUris.length > 0 && (
              <Text style={styles.modalFoto}>{fotoUris.length} foto dokumentasi terlampir</Text>
            )}
            <Button title="Kembali ke Dashboard" variant="primary" size="large" fullWidth onPress={() => { setShowSuccess(false); navigation.goBack(); }} />
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgLight },
  header: { flexDirection: 'row', alignItems: 'center', paddingBottom: 12, paddingHorizontal: Spacing.base, backgroundColor: Colors.bgWhite, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  headerTitle: { ...Typography.h3, color: Colors.textPrimary, flex: 1, textAlign: 'center' },
  content: { padding: Spacing.base },
  infoCard: { marginBottom: 16 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  infoLabel: { ...Typography.small, color: Colors.textMuted },
  infoValue: { ...Typography.smallBold, color: Colors.textPrimary },
  fieldLabel: { ...Typography.bodyBold, color: Colors.textPrimary, marginBottom: 8, marginTop: 12 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: Radius.full, borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.bgWhite },
  chipEmoji: { fontSize: 14 },
  chipText: { ...Typography.smallBold, color: Colors.textPrimary },
  textareaWrap: { marginBottom: 4 },
  textarea: { borderWidth: 1.5, borderColor: Colors.border, borderRadius: Radius.md, padding: 14, ...Typography.body, color: Colors.textPrimary, height: 120, backgroundColor: Colors.bgWhite },
  charCount: { ...Typography.caption, color: Colors.textMuted, textAlign: 'right', marginTop: 4 },
  btnRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  photoThumb: { width: 76, height: 76, borderRadius: Radius.md, position: 'relative', overflow: 'visible' },
  thumbImage: { width: 76, height: 76, borderRadius: Radius.md },
  photoRemove: { position: 'absolute', top: -6, right: -6, backgroundColor: '#fff', borderRadius: 10 },
  addPhotoBtn: { width: 76, height: 76, borderRadius: Radius.md, borderWidth: 1.5, borderStyle: 'dashed', borderColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },
  addPhotoText: { ...Typography.caption, color: Colors.primary, fontWeight: '600' },
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 8 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 32 },
  modalCard: { backgroundColor: '#fff', borderRadius: Radius.lg, padding: 24, alignItems: 'center' },
  successCircle: { width: 72, height: 72, borderRadius: 36, backgroundColor: Colors.success, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  modalTitle: { ...Typography.h3, color: Colors.textPrimary, marginBottom: 4 },
  modalDesc: { ...Typography.body, color: Colors.textMuted, marginBottom: 8 },
  modalFoto: { ...Typography.small, color: Colors.success, marginBottom: 16 },
});
============================================================
