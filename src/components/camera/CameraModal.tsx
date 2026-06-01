/**
 * ============================================
 * CAMERA MODAL - Real Camera Component (FIXED)
 * ============================================
 * FIXES:
 * - Added onMountError handler for CameraView
 * - Added camera initialization timeout (8s)
 * - Fixed race condition: capture waits for cameraReady
 * - Added error recovery with retry mechanism
 * - Fixed flash toggle for expo-camera SDK 54
 * - Added proper cleanup on unmount
 * - Fallback to ImagePicker.launchCameraAsync when CameraView fails
 */
import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Image,
  ActivityIndicator,
  Dimensions,
  StatusBar,
  Alert,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import type { CameraType, FlashMode } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Radius } from '../../constants';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CAMERA_INIT_TIMEOUT = 8000; // 8 seconds to initialize camera

interface CameraModalProps {
  visible: boolean;
  onClose: () => void;
  onCapture: (uri: string) => void;
  initialFacing?: 'front' | 'back';
  showFaceGuide?: boolean;
  title?: string;
  allowFlip?: boolean;
  allowGallery?: boolean;
}

export default function CameraModal({
  visible,
  onClose,
  onCapture,
  initialFacing = 'front',
  showFaceGuide = false,
  title = 'Ambil Foto',
  allowFlip = true,
  allowGallery = true,
}: CameraModalProps) {
  const insets = useSafeAreaInsets();
  // Math.max guards against useSafeAreaInsets() returning 0 inside an RN <Modal> on Android edge-to-edge.
  const topPad = Math.max(insets.top, StatusBar.currentHeight ?? 0, 24);
  const bottomPad = Math.max(insets.bottom, 16);

  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<'front' | 'back'>(initialFacing);
  const [flash, setFlash] = useState<'off' | 'on'>('off');
  const [isCapturing, setIsCapturing] = useState(false);
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [faceWarning, setFaceWarning] = useState(false);
  const cameraRef = useRef<CameraView>(null);
  const initTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef(true);

  // Track mounted state
  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  // Reset state when modal opens
  useEffect(() => {
    if (visible) {
      setPreviewUri(null);
      setIsCapturing(false);
      setCameraReady(false);
      setCameraError(null);
      setFacing(initialFacing);
      setFlash('off');
      setFaceWarning(false);

      // Camera init timeout - if camera doesn't initialize in 8s, show fallback
      initTimeoutRef.current = setTimeout(() => {
        if (isMountedRef.current && !cameraReady) {
          console.log('[Camera] Init timeout - offering fallback');
          setCameraError('Kamera terlalu lama memuat. Gunakan tombol galeri atau coba lagi.');
        }
      }, CAMERA_INIT_TIMEOUT);
    } else {
      // Cleanup timeout on close
      if (initTimeoutRef.current) {
        clearTimeout(initTimeoutRef.current);
        initTimeoutRef.current = null;
      }
    }

    return () => {
      if (initTimeoutRef.current) {
        clearTimeout(initTimeoutRef.current);
        initTimeoutRef.current = null;
      }
    };
  }, [visible, initialFacing]);

  // Request permission when modal becomes visible
  useEffect(() => {
    if (visible && !permission?.granted) {
      requestPermission();
    }
  }, [visible, permission]);

  const handleCapture = useCallback(async () => {
    if (!cameraRef.current || isCapturing || !cameraReady) {
      console.log('[Camera] Cannot capture: ref=', !!cameraRef.current, 'capturing=', isCapturing, 'ready=', cameraReady);
      return;
    }

    try {
      setIsCapturing(true);
      setFaceWarning(false);
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.7,
        base64: false,
        exif: true,
        skipProcessing: false, // FIX: was true on Android, can cause issues
      });
      if (photo?.uri && isMountedRef.current) {
        if (showFaceGuide && facing === 'front' && photo.width && photo.height) {
          if (photo.width < 200 || photo.height < 200) {
            setFaceWarning(true);
          }
        }
        setPreviewUri(photo.uri);
      }
    } catch (err: any) {
      console.error('[Camera] Capture error:', err);
      if (isMountedRef.current) {
        // Offer fallback via system camera
        Alert.alert(
          'Gagal Mengambil Foto',
          'Terjadi kesalahan pada kamera. Gunakan kamera sistem?',
          [
            { text: 'Batal', style: 'cancel' },
            { text: 'Buka Kamera Sistem', onPress: handleFallbackCamera },
          ]
        );
      }
    } finally {
      if (isMountedRef.current) setIsCapturing(false);
    }
  }, [isCapturing, cameraReady, showFaceGuide, facing]);

  // Fallback: use system camera via ImagePicker
  const handleFallbackCamera = useCallback(async () => {
    try {
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [3, 4],
        quality: 0.7,
        cameraType: facing === 'front' ? ImagePicker.CameraType.front : ImagePicker.CameraType.back,
      });
      if (!result.canceled && result.assets[0]?.uri && isMountedRef.current) {
        setPreviewUri(result.assets[0].uri);
      }
    } catch (err) {
      console.error('[Camera] Fallback camera error:', err);
      Alert.alert('Error', 'Tidak dapat membuka kamera. Pastikan izin kamera sudah diberikan.');
    }
  }, [facing]);

  const handlePickImage = useCallback(async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') return;
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.7,
      });
      if (!result.canceled && result.assets[0]?.uri && isMountedRef.current) {
        setPreviewUri(result.assets[0].uri);
      }
    } catch (err) {
      console.error('[Camera] Image picker error:', err);
    }
  }, []);

  const handleConfirm = useCallback(() => {
    if (previewUri) {
      onCapture(previewUri);
      setPreviewUri(null);
    }
  }, [previewUri, onCapture]);

  const handleRetake = useCallback(() => {
    setPreviewUri(null);
    setFaceWarning(false);
  }, []);

  const toggleFacing = useCallback(() => {
    setCameraReady(false); // Reset ready state when switching
    setFacing((prev) => (prev === 'front' ? 'back' : 'front'));
  }, []);

  const toggleFlash = useCallback(() => {
    setFlash((prev) => (prev === 'off' ? 'on' : 'off'));
  }, []);

  const handleCameraReady = useCallback(() => {
    if (isMountedRef.current) {
      setCameraReady(true);
      setCameraError(null);
      // Clear init timeout
      if (initTimeoutRef.current) {
        clearTimeout(initTimeoutRef.current);
        initTimeoutRef.current = null;
      }
      console.log('[Camera] Ready!');
    }
  }, []);

  const handleCameraMountError = useCallback((error: { message: string }) => {
    console.error('[Camera] Mount error:', error.message);
    if (isMountedRef.current) {
      setCameraError(`Kamera gagal dimuat: ${error.message}`);
    }
  }, []);

  const handleRetryCamera = useCallback(() => {
    setCameraError(null);
    setCameraReady(false);
    // Force re-mount by toggling facing
    setFacing(prev => {
      setTimeout(() => {
        if (isMountedRef.current) setFacing(prev);
      }, 100);
      return prev === 'front' ? 'back' : 'front';
    });
  }, []);

  // Render permission request screen
  const renderPermissionScreen = () => (
    <View style={styles.permissionContainer}>
      <Ionicons name="camera-outline" size={64} color="#94A3B8" />
      <Text style={styles.permissionTitle}>Izin Kamera Diperlukan</Text>
      <Text style={styles.permissionDesc}>
        Aplikasi membutuhkan akses kamera untuk mengambil foto.
      </Text>
      <TouchableOpacity style={styles.permissionBtn} onPress={requestPermission}>
        <Text style={styles.permissionBtnText}>Berikan Izin Kamera</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
        <Text style={styles.cancelBtnText}>Batal</Text>
      </TouchableOpacity>
    </View>
  );

  // Render preview screen
  const renderPreview = () => (
    <View style={styles.previewContainer}>
      <View style={[styles.previewHeader, { paddingTop: topPad }]}>
        <Text style={styles.previewTitle}>Preview Foto</Text>
      </View>
      {showFaceGuide && faceWarning && (
        <View style={styles.faceWarningBanner}>
          <Ionicons name="warning" size={18} color="#fff" />
          <Text style={styles.faceWarningText}>Pastikan wajah terlihat jelas dalam foto. Foto gelap/buram mungkin ditolak.</Text>
        </View>
      )}
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        <Image source={{ uri: previewUri! }} style={styles.previewImage} resizeMode="contain" />
      </View>
      <View style={[styles.previewActions, { paddingBottom: bottomPad }]}>
        <TouchableOpacity style={styles.previewActionBtn} onPress={handleRetake}>
          <Ionicons name="refresh-outline" size={28} color="#fff" />
          <Text style={styles.previewActionText}>Ulangi</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.confirmBtn} onPress={handleConfirm}>
          <Ionicons name="checkmark-circle" size={32} color="#fff" />
          <Text style={styles.confirmBtnText}>Gunakan Foto</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  // Render camera error state
  const renderCameraError = () => (
    <View style={styles.errorContainer}>
      <Ionicons name="camera-outline" size={64} color="#94A3B8" />
      <Text style={styles.errorTitle}>Kamera Bermasalah</Text>
      <Text style={styles.errorDesc}>{cameraError}</Text>
      <View style={styles.errorActions}>
        <TouchableOpacity style={styles.retryBtn} onPress={handleRetryCamera}>
          <Ionicons name="refresh" size={20} color="#fff" />
          <Text style={styles.retryBtnText}>Coba Lagi</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.fallbackBtn} onPress={handleFallbackCamera}>
          <Ionicons name="camera" size={20} color="#1A56DB" />
          <Text style={styles.fallbackBtnText}>Kamera Sistem</Text>
        </TouchableOpacity>
      </View>
      <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
        <Text style={styles.cancelBtnText}>Batal</Text>
      </TouchableOpacity>
    </View>
  );

  // Render camera view
  const renderCamera = () => (
    <View style={styles.cameraContainer}>
      {/* Camera - no children (SDK 53+ requirement) */}
      <CameraView
        ref={cameraRef}
        style={styles.camera}
        facing={facing}
        flash={flash}
        onCameraReady={handleCameraReady}
        onMountError={handleCameraMountError}
      />

      {/* Top Bar */}
      <View style={[styles.topBar, { paddingTop: topPad }]}>
        <TouchableOpacity style={styles.topBtn} onPress={onClose}>
          <Ionicons name="close" size={28} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.topTitle}>{title}</Text>
        <TouchableOpacity style={styles.topBtn} onPress={toggleFlash}>
          <Ionicons
            name={flash === 'on' ? 'flash' : 'flash-off'}
            size={24}
            color={flash === 'on' ? '#FFD700' : '#fff'}
          />
        </TouchableOpacity>
      </View>

      {/* Face Guide Overlay for Selfie */}
      {showFaceGuide && cameraReady && (
        <View style={styles.guideOverlay}>
          <View style={{ alignItems: 'center' }}>
            <Text style={styles.guideTopText}>Posisikan wajah di dalam lingkaran</Text>
            <View style={styles.ovalGuide} />
            <Text style={styles.guideBottomText}>Pastikan pencahayaan cukup{'\n'}dan wajah terlihat jelas</Text>
          </View>
        </View>
      )}

      {/* Loading indicator while camera initializes */}
      {!cameraReady && !cameraError && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#fff" />
          <Text style={styles.loadingText}>Memuat kamera...</Text>
          <TouchableOpacity style={styles.fallbackLinkBtn} onPress={handleFallbackCamera}>
            <Text style={styles.fallbackLinkText}>Gunakan kamera sistem</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Bottom Controls */}
      <View style={[styles.bottomBar, { paddingBottom: bottomPad }]}>
        <View style={styles.sideBtn}>
          {allowGallery && (
            <TouchableOpacity style={styles.galleryBtn} onPress={handlePickImage}>
              <Ionicons name="images-outline" size={26} color="#fff" />
            </TouchableOpacity>
          )}
        </View>

        <TouchableOpacity
          style={[styles.captureBtn, (isCapturing || !cameraReady) && styles.captureBtnDisabled]}
          onPress={handleCapture}
          disabled={isCapturing || !cameraReady}
          activeOpacity={0.7}
        >
          {isCapturing ? (
            <ActivityIndicator size="small" color="#1A56DB" />
          ) : (
            <View style={styles.captureBtnInner} />
          )}
        </TouchableOpacity>

        <View style={styles.sideBtn}>
          {allowFlip && (
            <TouchableOpacity style={styles.flipBtn} onPress={toggleFacing}>
              <Ionicons name="camera-reverse-outline" size={28} color="#fff" />
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <StatusBar barStyle="light-content" backgroundColor="#000" />
      <View style={styles.container}>
        {!permission?.granted
          ? renderPermissionScreen()
          : previewUri
            ? renderPreview()
            : cameraError
              ? renderCameraError()
              : renderCamera()
        }
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },

  // Permission Screen
  permissionContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, backgroundColor: '#000' },
  permissionTitle: { ...Typography.h3, color: '#fff', marginTop: 16, marginBottom: 8 },
  permissionDesc: { ...Typography.body, color: 'rgba(255,255,255,0.7)', textAlign: 'center', marginBottom: 24 },
  permissionBtn: { backgroundColor: '#1A56DB', paddingHorizontal: 32, paddingVertical: 14, borderRadius: Radius.md, marginBottom: 12 },
  permissionBtnText: { ...Typography.bodyBold, color: '#fff' },
  cancelBtn: { paddingHorizontal: 32, paddingVertical: 14 },
  cancelBtnText: { ...Typography.body, color: 'rgba(255,255,255,0.7)' },

  // Error Screen
  errorContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, backgroundColor: '#000' },
  errorTitle: { ...Typography.h3, color: '#fff', marginTop: 16, marginBottom: 8 },
  errorDesc: { ...Typography.body, color: 'rgba(255,255,255,0.7)', textAlign: 'center', marginBottom: 24 },
  errorActions: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  retryBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#1A56DB', paddingHorizontal: 20, paddingVertical: 12, borderRadius: Radius.md },
  retryBtnText: { ...Typography.bodyBold, color: '#fff' },
  fallbackBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#1E293B', paddingHorizontal: 20, paddingVertical: 12, borderRadius: Radius.md, borderWidth: 1, borderColor: '#334155' },
  fallbackBtnText: { ...Typography.bodyBold, color: '#93C5FD' },

  // Camera View
  cameraContainer: { flex: 1 },
  camera: { flex: 1 },
  topBar: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 12,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  topBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  topTitle: { ...Typography.bodyBold, color: '#fff' },

  // Face guide
  guideOverlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', zIndex: 5 },
  guideTopText: { color: 'rgba(255,255,255,0.9)', fontSize: 14, fontWeight: '600', marginBottom: 12 },
  guideBottomText: { color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 12, textAlign: 'center' },
  ovalGuide: {
    width: 200, height: 260, borderRadius: 100,
    borderWidth: 2.5, borderColor: 'rgba(255,255,255,0.6)', borderStyle: 'dashed',
  },

  // Loading
  loadingOverlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.5)' },
  loadingText: { ...Typography.small, color: '#fff', marginTop: 12 },
  fallbackLinkBtn: { marginTop: 20, paddingVertical: 8, paddingHorizontal: 16 },
  fallbackLinkText: { color: '#93C5FD', fontSize: 14, textDecorationLine: 'underline' },

  // Face warning banner
  faceWarningBanner: { backgroundColor: '#F59E0B', paddingVertical: 8, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 8 },
  faceWarningText: { color: '#fff', fontSize: 13, flex: 1 },

  // Bottom bar
  bottomBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 10,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 32, paddingVertical: 24,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  sideBtn: { width: 50, alignItems: 'center' },
  galleryBtn: { width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  flipBtn: { width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  captureBtn: {
    width: 76, height: 76, borderRadius: 38,
    borderWidth: 4, borderColor: '#fff',
    alignItems: 'center', justifyContent: 'center', backgroundColor: 'transparent',
  },
  captureBtnDisabled: { opacity: 0.5 },
  captureBtnInner: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#fff' },

  // Preview
  previewContainer: { flex: 1, backgroundColor: '#000' },
  previewHeader: { alignItems: 'center', paddingBottom: 12, backgroundColor: 'rgba(0,0,0,0.7)' },
  previewTitle: { ...Typography.bodyBold, color: '#fff' },
  previewImage: { flex: 1, width: SCREEN_WIDTH, backgroundColor: '#000' },
  previewActions: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around',
    paddingVertical: 20, backgroundColor: 'rgba(0,0,0,0.85)',
  },
  previewActionBtn: { alignItems: 'center', gap: 4, paddingHorizontal: 20, paddingVertical: 10 },
  previewActionText: { ...Typography.small, color: '#fff' },
  confirmBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#10B981', paddingHorizontal: 24, paddingVertical: 14, borderRadius: Radius.md },
  confirmBtnText: { ...Typography.bodyBold, color: '#fff' },
});
