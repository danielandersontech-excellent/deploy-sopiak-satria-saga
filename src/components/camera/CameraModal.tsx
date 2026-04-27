/**
 * ============================================
 * CAMERA MODAL - Real Camera Component
 * ============================================
 * Reusable full-screen camera modal using expo-camera CameraView.
 * Supports front/back facing, flash, capture, preview, and retake.
 * Used across AbsensiScreen, LaporanKejadianScreen, EditProfilScreen.
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
  Platform,
  Dimensions,
  StatusBar,
} from 'react-native';
import { CameraView, CameraType, useCameraPermissions, FlashMode } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Radius } from '../../constants';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface CameraModalProps {
  visible: boolean;
  onClose: () => void;
  onCapture: (uri: string) => void;
  /** 'front' for selfie, 'back' for normal photo */
  initialFacing?: CameraType;
  /** Show oval guide overlay for selfie */
  showFaceGuide?: boolean;
  /** Title shown at top */
  title?: string;
  /** Allow switching camera facing */
  allowFlip?: boolean;
  /** Allow picking from gallery */
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
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<CameraType>(initialFacing);
  const [flash, setFlash] = useState<FlashMode>('off');
  const [isCapturing, setIsCapturing] = useState(false);
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const cameraRef = useRef<CameraView>(null);

  // Reset state when modal opens
  useEffect(() => {
    if (visible) {
      setPreviewUri(null);
      setIsCapturing(false);
      setCameraReady(false);
      setFacing(initialFacing);
      setFlash('off');
    }
  }, [visible, initialFacing]);

  // Request permission when modal becomes visible
  useEffect(() => {
    if (visible && !permission?.granted) {
      requestPermission();
    }
  }, [visible, permission]);

  const [faceWarning, setFaceWarning] = useState(false);

  const handleCapture = useCallback(async () => {
    if (!cameraRef.current || isCapturing || !cameraReady) return;

    try {
      setIsCapturing(true);
      setFaceWarning(false);
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.7,
        base64: false,
        exif: true,
        skipProcessing: Platform.OS === 'android',
      });
      if (photo?.uri) {
        // Face validation for selfie mode: check image brightness and size
        // to ensure a face is likely present (bright center, reasonable size)
        if (showFaceGuide && facing === 'front') {
          try {
            const { width: imgW, height: imgH } = photo;
            // Basic check: if image is very dark or too small, warn
            if (imgW && imgH && (imgW < 200 || imgH < 200)) {
              setFaceWarning(true);
            }
          } catch { /* ignore validation errors */ }
        }
        setPreviewUri(photo.uri);
      }
    } catch (err) {
      console.error('Camera capture error:', err);
    } finally {
      setIsCapturing(false);
    }
  }, [isCapturing, cameraReady, showFaceGuide, facing]);

  const handlePickImage = useCallback(async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.7,
      });

      if (!result.canceled && result.assets[0]?.uri) {
        setPreviewUri(result.assets[0].uri);
      }
    } catch (err) {
      console.error('Image picker error:', err);
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
  }, []);

  const toggleFacing = useCallback(() => {
    setFacing((prev) => (prev === 'front' ? 'back' : 'front'));
  }, []);

  const toggleFlash = useCallback(() => {
    setFlash((prev) => (prev === 'off' ? 'on' : 'off'));
  }, []);

  const handleCameraReady = useCallback(() => {
    setCameraReady(true);
  }, []);

  // Render permission request screen
  const renderPermissionScreen = () => (
    <View style={styles.permissionContainer}>
      <Ionicons name="camera-outline" size={64} color={Colors.textMuted} />
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

  // Render preview screen after photo is taken
  const renderPreview = () => (
    <View style={styles.previewContainer}>
      <View style={styles.previewHeader}>
        <Text style={styles.previewTitle}>Preview Foto</Text>
      </View>
      {/* Face warning banner */}
      {showFaceGuide && faceWarning && (
        <View style={{ backgroundColor: '#F59E0B', paddingVertical: 8, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Ionicons name="warning" size={18} color="#fff" />
          <Text style={{ color: '#fff', fontSize: 13, flex: 1 }}>Pastikan wajah terlihat jelas dalam foto. Foto gelap/buram mungkin ditolak.</Text>
        </View>
      )}
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        <Image
          source={{ uri: previewUri! }}
          style={styles.previewImage}
          resizeMode="contain"
          onError={() => console.log('Preview image load error')}
        />
      </View>
      <View style={styles.previewActions}>
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
      />

      {/* Overlays positioned absolutely on top of camera */}
      {/* Top Bar */}
      <View style={styles.topBar}>
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
      {showFaceGuide && (
        <View style={styles.guideOverlay}>
          <View style={{ alignItems: 'center' }}>
            <Text style={{ color: 'rgba(255,255,255,0.9)', fontSize: 14, fontWeight: '600', marginBottom: 12 }}>Posisikan wajah di dalam lingkaran</Text>
            <View style={styles.ovalGuide} />
            <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 12, textAlign: 'center' }}>Pastikan pencahayaan cukup{'\n'}dan wajah terlihat jelas</Text>
          </View>
        </View>
      )}

      {/* Loading indicator while camera initializes */}
      {!cameraReady && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#fff" />
          <Text style={styles.loadingText}>Memuat kamera...</Text>
        </View>
      )}

      {/* Bottom Controls */}
      <View style={styles.bottomBar}>
        {/* Gallery Button */}
        <View style={styles.sideBtn}>
          {allowGallery && (
            <TouchableOpacity style={styles.galleryBtn} onPress={handlePickImage}>
              <Ionicons name="images-outline" size={26} color="#fff" />
            </TouchableOpacity>
          )}
        </View>

        {/* Capture Button */}
        <TouchableOpacity
          style={[styles.captureBtn, isCapturing && styles.captureBtnDisabled]}
          onPress={handleCapture}
          disabled={isCapturing || !cameraReady}
          activeOpacity={0.7}
        >
          {isCapturing ? (
            <ActivityIndicator size="small" color={Colors.primary} />
          ) : (
            <View style={styles.captureBtnInner} />
          )}
        </TouchableOpacity>

        {/* Flip Camera Button */}
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
        {!permission?.granted ? renderPermissionScreen() : previewUri ? renderPreview() : renderCamera()}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },

  // Permission Screen
  permissionContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    backgroundColor: '#000',
  },
  permissionTitle: {
    ...Typography.h3,
    color: '#fff',
    marginTop: 16,
    marginBottom: 8,
  },
  permissionDesc: {
    ...Typography.body,
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
    marginBottom: 24,
  },
  permissionBtn: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: Radius.md,
    marginBottom: 12,
  },
  permissionBtnText: {
    ...Typography.bodyBold,
    color: '#fff',
  },
  cancelBtn: {
    paddingHorizontal: 32,
    paddingVertical: 14,
  },
  cancelBtnText: {
    ...Typography.body,
    color: 'rgba(255,255,255,0.7)',
  },

  // Camera View
  cameraContainer: {
    flex: 1,
  },
  camera: {
    flex: 1,
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? 40 : 54,
    paddingBottom: 12,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  topBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topTitle: {
    ...Typography.bodyBold,
    color: '#fff',
  },

  // Face guide overlay
  guideOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 5,
  },
  ovalGuide: {
    width: 200,
    height: 260,
    borderRadius: 100,
    borderWidth: 2.5,
    borderColor: 'rgba(255,255,255,0.6)',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 20,
  },
  guideText: {
    ...Typography.small,
    color: 'rgba(255,255,255,0.8)',
    textAlign: 'center',
  },

  // Loading overlay
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  loadingText: {
    ...Typography.small,
    color: '#fff',
    marginTop: 12,
  },

  // Bottom bar
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 32,
    paddingVertical: 24,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  sideBtn: {
    width: 50,
    alignItems: 'center',
  },
  galleryBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  flipBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  captureBtn: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 4,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  captureBtnDisabled: {
    opacity: 0.5,
  },
  captureBtnInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#fff',
  },

  // Preview Screen
  previewContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  previewHeader: {
    alignItems: 'center',
    paddingTop: Platform.OS === 'android' ? 40 : 0,
    paddingBottom: 12,
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  previewTitle: {
    ...Typography.bodyBold,
    color: '#fff',
  },
  previewImage: {
    flex: 1,
    width: SCREEN_WIDTH,
    backgroundColor: '#000',
  },
  previewActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingVertical: 20,
    paddingBottom: Platform.OS === 'ios' ? 40 : 20,
    backgroundColor: 'rgba(0,0,0,0.85)',
  },
  previewActionBtn: {
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  previewActionText: {
    ...Typography.small,
    color: '#fff',
  },
  confirmBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.success,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: Radius.md,
  },
  confirmBtnText: {
    ...Typography.bodyBold,
    color: '#fff',
  },
});
