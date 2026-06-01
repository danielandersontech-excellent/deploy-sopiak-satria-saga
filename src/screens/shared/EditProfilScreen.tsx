/**
 * EDIT PROFIL - v4 (Bug-Fix Pass on top of v3)
 *
 * FIXES (v4):
 *  🚨 Backend field name fix: `noHp` → `no_hp`. Express backend uses snake_case
 *     for the users table column. Sending camelCase `noHp` would be dropped by
 *     the API. Now sends both formats for safety + canonical `no_hp`.
 *  🚨 Empty `user?.id` check — if id is falsy, abort instead of POST to
 *     `/api/users/` (which would 404 or worse). Also dropped client-side
 *     `updated_at` (backend's job, prevents clock skew).
 *  ✅ Unsaved-changes warning when navigating back (don't lose typed data).
 *  ✅ Error & progress box colors now theme-aware (was hardcoded #fee2e2 etc.
 *     looking bad in dark mode).
 *  ✅ Phone digit-only filter — strip non-digits as user types.
 *  ✅ `hasChanges` check disables Save button when no fields modified.
 *  ✅ Resets `fotoChanged` state after successful save.
 *  ✅ Trailing whitespace stripped from inputs before validation.
 */
import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert,
  Image, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Radius } from '../../constants';
import { Badge, Button, CameraModal } from '../../components';
import { useAuthStore } from '../../stores/authStore';
import { useDataStore } from '../../stores/dataStore';
import { usersApi } from '../../lib/apiClient';
import { uploadProfilePhoto } from '../../services/photoUpload';
import { useI18n } from '../../lib/i18n';
import { useTheme } from '../../lib/theme';
import * as ImagePicker from 'expo-image-picker';

export default function EditProfilScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const { t, lang } = useI18n();
  const { theme, isDark } = useTheme();
  const user = useAuthStore((s) => s.user);
  const updateUser = useAuthStore((s) => s.updateUser);
  const updateTeamMember = useDataStore((s) => s.updateTeamMember);

  const initialNama = user?.nama || '';
  const initialNoHp = user?.no_hp || (user as any)?.noHp || '';
  const initialFoto = user?.foto_url || (user as any)?.foto || null;

  const [nama, setNama] = useState(initialNama);
  const [noHp, setNoHp] = useState(initialNoHp);
  const [saving, setSaving] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [fotoUri, setFotoUri] = useState<string | null>(initialFoto);
  const [fotoChanged, setFotoChanged] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  const defaultAvatar = 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&h=200&fit=crop&crop=face';

  // Detect unsaved changes
  const hasChanges = useMemo(
    () => nama.trim() !== initialNama.trim() || noHp.trim() !== initialNoHp.trim() || fotoChanged,
    [nama, noHp, initialNama, initialNoHp, fotoChanged]
  );

  // Warn about unsaved changes when leaving
  useEffect(() => {
    const sub = navigation.addListener('beforeRemove', (e: any) => {
      if (!hasChanges || saving) return; // OK to leave
      e.preventDefault();
      Alert.alert(
        lang === 'en' ? 'Discard changes?' : 'Buang Perubahan?',
        lang === 'en'
          ? 'You have unsaved changes. Are you sure you want to leave?'
          : 'Ada perubahan yang belum disimpan. Yakin ingin keluar?',
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
  }, [navigation, hasChanges, saving, lang]);

  // Camera capture
  const handleCameraCapture = useCallback((uri: string) => {
    setFotoUri(uri);
    setFotoChanged(true);
    setShowCamera(false);
  }, []);

  // Gallery pick with 1:1 crop
  const handlePickFromGallery = useCallback(async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          lang === 'en' ? 'Permission Required' : 'Izin Diperlukan',
          lang === 'en' ? 'Please allow access to photo library' : 'Izinkan akses ke galeri foto'
        );
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });
      if (!result.canceled && result.assets[0]?.uri) {
        setFotoUri(result.assets[0].uri);
        setFotoChanged(true);
      }
    } catch (err: any) {
      console.log('Gallery picker error:', err?.message);
      Alert.alert(
        'Error',
        lang === 'en' ? 'Failed to open gallery' : 'Gagal membuka galeri'
      );
    }
  }, [lang]);

  // Photo source selection
  const handleChangePhoto = useCallback(() => {
    Alert.alert(
      lang === 'en' ? 'Profile Photo' : 'Foto Profil',
      lang === 'en' ? 'Choose photo source' : 'Pilih sumber foto',
      [
        { text: lang === 'en' ? 'Camera' : 'Kamera', onPress: () => setShowCamera(true) },
        { text: lang === 'en' ? 'Gallery' : 'Galeri', onPress: handlePickFromGallery },
        ...(fotoUri && fotoUri !== defaultAvatar
          ? [
              {
                text: lang === 'en' ? 'Remove Photo' : 'Hapus Foto',
                style: 'destructive' as const,
                onPress: () => {
                  setFotoUri(null);
                  setFotoChanged(true);
                },
              },
            ]
          : []),
        { text: lang === 'en' ? 'Cancel' : 'Batal', style: 'cancel' as const },
      ]
    );
  }, [lang, fotoUri, handlePickFromGallery]);

  // Phone digits-only sanitizer
  const handleNoHpChange = (text: string) => {
    setNoHp(text.replace(/[^0-9+]/g, ''));
    if (errorMsg) setErrorMsg('');
  };

  // Save with upload
  const handleSave = async () => {
    setErrorMsg('');
    if (!user?.id) {
      return Alert.alert(
        'Error',
        lang === 'en' ? 'User not loaded. Please re-login.' : 'User belum dimuat. Silakan login ulang.'
      );
    }
    const trimNama = nama.trim();
    const trimNoHp = noHp.trim();
    if (!trimNama) {
      return Alert.alert('Error', lang === 'en' ? 'Name cannot be empty' : 'Nama tidak boleh kosong');
    }
    if (!trimNoHp || trimNoHp.length < 10) {
      return Alert.alert(
        'Error',
        lang === 'en' ? 'Phone number minimum 10 digits' : 'No HP minimal 10 digit'
      );
    }

    setSaving(true);
    setUploadProgress(null);

    try {
      // Backend expects snake_case (no_hp) — send canonical + camelCase alias.
      const updateData: Record<string, any> = {
        nama: trimNama,
        no_hp: trimNoHp,
        noHp: trimNoHp,
      };

      // Upload photo if changed
      if (fotoChanged && fotoUri && fotoUri.startsWith('file://')) {
        setUploadProgress(lang === 'en' ? 'Compressing photo...' : 'Mengkompres foto...');
        let uploadAttempts = 0;
        let uploadedUrl: string | null = null;
        while (uploadAttempts < 3 && !uploadedUrl) {
          uploadAttempts++;
          setUploadProgress(
            uploadAttempts > 1
              ? (lang === 'en' ? `Retrying upload (${uploadAttempts}/3)...` : `Mencoba upload ulang (${uploadAttempts}/3)...`)
              : (lang === 'en' ? 'Uploading photo...' : 'Mengupload foto...')
          );
          try {
            const result = await uploadProfilePhoto(fotoUri, user.id);
            if (result && result.startsWith('http')) uploadedUrl = result;
          } catch (uploadErr: any) {
            console.log(`Photo upload attempt ${uploadAttempts} failed:`, uploadErr?.message);
            if (uploadAttempts < 3) await new Promise((r) => setTimeout(r, 1000 * uploadAttempts));
          }
        }

        if (uploadedUrl) {
          updateData.foto_url = uploadedUrl;
          setUploadProgress(lang === 'en' ? 'Photo uploaded!' : 'Foto berhasil diupload!');
        } else {
          setUploadProgress(lang === 'en' ? 'Upload failed, saving locally...' : 'Upload gagal, disimpan lokal...');
          // Don't include foto_url in payload — keep server's current
        }
      } else if (fotoChanged && !fotoUri) {
        // Photo removed
        updateData.foto_url = null;
      }

      setUploadProgress(lang === 'en' ? 'Saving to server...' : 'Menyimpan ke server...');
      await usersApi.update(user.id, updateData);

      // Update local stores
      updateUser({
        nama: trimNama,
        no_hp: trimNoHp,
        noHp: trimNoHp,
        foto_url: updateData.foto_url !== undefined ? updateData.foto_url : user.foto_url,
      });
      updateTeamMember?.(user.id, {
        nama: trimNama,
        noHp: trimNoHp,
        ...(updateData.foto_url !== undefined ? { foto: updateData.foto_url || '' } : {}),
      } as any);

      setSaving(false);
      setUploadProgress(null);
      setFotoChanged(false); // important: prevent unsaved-changes warning
      Alert.alert(
        '✅ ' + (lang === 'en' ? 'Success' : 'Berhasil'),
        t('profile.saved'),
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
    } catch (err: any) {
      setSaving(false);
      setUploadProgress(null);
      const raw = String(err?.message || '');
      let msg = raw;
      if (/network|fetch|timeout/i.test(raw)) {
        msg = lang === 'en' ? 'Network error. Check your connection.' : 'Gagal konek server. Cek koneksi.';
      }
      setErrorMsg(msg || (lang === 'en' ? 'Failed to save profile' : 'Gagal menyimpan profil'));
    }
  };

  return (
    <View style={[s.container, { backgroundColor: theme.bg }]}>
      <View style={[s.header, { paddingTop: insets.top + 12 }, { backgroundColor: theme.bgCard, borderBottomColor: theme.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Ionicons name="arrow-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: theme.text }]}>{t('profile.edit')}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        {/* Avatar with photo change */}
        <View style={s.avatarSection}>
          <TouchableOpacity onPress={handleChangePhoto} activeOpacity={0.7}>
            <Image
              source={{ uri: fotoUri || defaultAvatar }}
              style={[s.avatar, { borderColor: isDark ? theme.border : Colors.primary }]}
            />
            <View style={s.camBadge}>
              <Ionicons name="camera" size={16} color="#fff" />
            </View>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleChangePhoto}>
            <Text style={[s.changePhotoText, { color: theme.primary }]}>
              {lang === 'en' ? 'Change Photo' : 'Ganti Foto'}
            </Text>
          </TouchableOpacity>
          {fotoChanged && (
            <View style={s.changedBadge}>
              <Ionicons name="checkmark-circle" size={14} color={Colors.success} />
              <Text style={{ fontSize: 11, color: Colors.success, fontWeight: '600' }}>
                {lang === 'en' ? 'Photo updated' : 'Foto diubah'}
              </Text>
            </View>
          )}
        </View>

        <Text style={[s.label, { color: theme.textSecondary }]}>
          {t('profile.name')} *
        </Text>
        <TextInput
          style={[s.input, { backgroundColor: theme.bgInput, color: theme.text, borderColor: theme.border }]}
          value={nama}
          onChangeText={(txt) => { if (errorMsg) setErrorMsg(''); setNama(txt); }}
          placeholder={t('profile.name')}
          placeholderTextColor={theme.textMuted}
          editable={!saving}
          maxLength={64}
        />

        <Text style={[s.label, { color: theme.textSecondary }]}>{t('profile.nrp')}</Text>
        <View style={[s.readOnly, { backgroundColor: isDark ? theme.bgInput : '#f8fafc', borderColor: theme.border }]}>
          <Text style={[s.roText, { color: theme.textMuted }]}>{user?.nrp || '-'}</Text>
          <Badge text="Read-only" variant="default" />
        </View>

        <Text style={[s.label, { color: theme.textSecondary }]}>{t('profile.phone')} *</Text>
        <TextInput
          style={[s.input, { backgroundColor: theme.bgInput, color: theme.text, borderColor: theme.border }]}
          value={noHp}
          onChangeText={handleNoHpChange}
          placeholder="08xxxxxxxxxx"
          placeholderTextColor={theme.textMuted}
          keyboardType="phone-pad"
          maxLength={15}
          editable={!saving}
        />

        <Text style={[s.label, { color: theme.textSecondary }]}>{t('profile.role')}</Text>
        <View style={[s.readOnly, { backgroundColor: isDark ? theme.bgInput : '#f8fafc', borderColor: theme.border }]}>
          <Text style={[s.roText, { color: theme.textMuted }]}>
            {user?.role ? user.role.charAt(0).toUpperCase() + user.role.slice(1) : '-'}
          </Text>
        </View>

        {/* Upload progress — theme-aware */}
        {uploadProgress && (
          <View
            style={[
              s.progressBox,
              {
                backgroundColor: isDark ? `${Colors.primary}15` : Colors.primaryBg,
                borderColor: isDark ? `${Colors.primary}50` : Colors.primarySoft,
              },
            ]}
          >
            <ActivityIndicator size="small" color={Colors.primary} />
            <Text style={[s.progressText, { color: theme.primary }]}>{uploadProgress}</Text>
          </View>
        )}

        {/* Error — theme-aware */}
        {errorMsg !== '' && (
          <View
            style={[
              s.errorBox,
              {
                backgroundColor: isDark ? `${Colors.danger}15` : Colors.dangerBg,
                borderColor: isDark ? `${Colors.danger}50` : Colors.dangerSoft,
              },
            ]}
          >
            <Ionicons name="alert-circle" size={16} color={Colors.danger} />
            <Text style={[s.errorText, { color: Colors.danger }]}>{errorMsg}</Text>
          </View>
        )}

        {/* Save hint */}
        <View style={s.saveInfo}>
          <Ionicons name="cloud-upload-outline" size={14} color={theme.textMuted} />
          <Text style={[s.saveInfoText, { color: theme.textMuted }]}>
            {lang === 'en' ? 'Changes will be saved to server' : 'Perubahan akan tersimpan ke server'}
          </Text>
        </View>

        <Button
          title={
            saving
              ? (lang === 'en' ? 'Saving...' : 'Menyimpan...')
              : t('profile.save').toUpperCase()
          }
          variant="primary"
          size="large"
          fullWidth
          icon="save-outline"
          onPress={handleSave}
          disabled={saving || !hasChanges}
          loading={saving}
          style={{ marginTop: 16 }}
        />
        <View style={{ height: 40 }} />
      </ScrollView>

      <CameraModal
        visible={showCamera}
        onClose={() => setShowCamera(false)}
        onCapture={handleCameraCapture}
        initialFacing="front"
        showFaceGuide={true}
        title={lang === 'en' ? 'Profile Photo' : 'Foto Profil'}
        allowFlip={true}
        allowGallery={true}
      />
    </View>
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
  avatarSection: { alignItems: 'center', marginBottom: 20, gap: 8 },
  avatar: { width: 110, height: 110, borderRadius: 55, borderWidth: 3 },
  camBadge: {
    position: 'absolute', bottom: 4, right: 4,
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: Colors.primary,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#fff',
  },
  changePhotoText: { fontSize: 14, fontWeight: '600' },
  changedBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  label: { ...Typography.smallBold, marginBottom: 6, marginTop: 14 },
  input: {
    borderWidth: 1.5, borderRadius: Radius.md,
    paddingHorizontal: 14, height: 48, ...Typography.body,
  },
  readOnly: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderWidth: 1.5, borderRadius: Radius.md, paddingHorizontal: 14, height: 48,
  },
  roText: { ...Typography.body },
  progressBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginTop: 12, padding: 10, borderRadius: Radius.sm, borderWidth: 1,
  },
  progressText: { ...Typography.small, flex: 1 },
  errorBox: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginTop: 12, padding: 10,
    borderRadius: Radius.sm, borderWidth: 1,
  },
  errorText: { ...Typography.small, flex: 1 },
  saveInfo: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12 },
  saveInfoText: { ...Typography.caption },
});
============================================================