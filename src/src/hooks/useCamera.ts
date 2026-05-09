/**
 * ============================================
 * CAMERA HOOK - expo-camera + expo-image-picker
 * ============================================
 * Provides camera permission management and photo capture utilities.
 * 
 * Two capture methods:
 * 1. takeSelfie() - Uses CameraView ref (for inline camera views)
 * 2. launchCamera() - Uses ImagePicker.launchCameraAsync (quick capture without custom UI)
 * 3. pickImage() - Uses ImagePicker.launchImageLibraryAsync
 * 
 * For full-screen camera with preview, use the CameraModal component instead.
 */
import { useState, useCallback, useRef } from 'react';
import { Alert, Platform, Linking } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import type { CameraType } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';

interface UseCameraReturn {
  /** Current camera permission status */
  permission: ReturnType<typeof useCameraPermissions>[0];
  /** Request camera permission; returns true if granted */
  requestPermission: () => Promise<boolean>;
  /** Take photo using CameraView ref (requires camera to be mounted) */
  takeSelfie: () => Promise<string | null>;
  /** Launch system camera directly (no custom UI needed) */
  launchCamera: () => Promise<string | null>;
  /** Pick image from gallery */
  pickImage: () => Promise<string | null>;
  /** Ref to attach to CameraView component */
  cameraRef: React.RefObject<CameraView | null>;
  /** Current camera facing direction */
  facing: CameraType;
  /** Toggle between front and back camera */
  toggleFacing: () => void;
  /** Whether a capture is in progress */
  isCapturing: boolean;
}

export function useCamera(): UseCameraReturn {
  const [permission, requestPermissions] = useCameraPermissions();
  const [facing, setFacing] = useState<CameraType>('front');
  const [isCapturing, setIsCapturing] = useState(false);
  const cameraRef = useRef<CameraView | null>(null);

  const requestPermission = useCallback(async () => {
    if (permission?.granted) return true;

    const result = await requestPermissions();
    if (!result.granted) {
      Alert.alert(
        'Izin Kamera Diperlukan',
        'Aplikasi membutuhkan akses kamera untuk absensi selfie dan dokumentasi patroli. Silakan buka pengaturan untuk memberikan izin.',
        [
          { text: 'Batal', style: 'cancel' },
          { text: 'Buka Pengaturan', onPress: () => Linking.openSettings() },
        ]
      );
      return false;
    }
    return true;
  }, [permission]);

  const takeSelfie = useCallback(async (): Promise<string | null> => {
    if (!cameraRef.current) {
      console.warn('Camera ref not ready - is CameraView mounted?');
      return null;
    }

    try {
      setIsCapturing(true);
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.7,
        base64: false,
        exif: true,
        skipProcessing: Platform.OS === 'android',
      });
      return photo?.uri ?? null;
    } catch (err) {
      console.error('Camera capture error:', err);
      Alert.alert('Error', 'Gagal mengambil foto. Coba lagi.');
      return null;
    } finally {
      setIsCapturing(false);
    }
  }, []);

  const launchCamera = useCallback(async (): Promise<string | null> => {
    try {
      const hasPermission = await requestPermission();
      if (!hasPermission) return null;

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [3, 4],
        quality: 0.7,
        cameraType: ImagePicker.CameraType.front,
      });

      if (result.canceled) return null;
      return result.assets[0]?.uri ?? null;
    } catch (err) {
      console.error('Launch camera error:', err);
      Alert.alert('Error', 'Tidak dapat membuka kamera. Pastikan izin kamera sudah diberikan.');
      return null;
    }
  }, [requestPermission]);

  const pickImage = useCallback(async (): Promise<string | null> => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Izin Diperlukan',
          'Akses galeri diperlukan untuk memilih foto.',
          [
            { text: 'Batal', style: 'cancel' },
            { text: 'Buka Pengaturan', onPress: () => Linking.openSettings() },
          ]
        );
        return null;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.7,
      });

      if (result.canceled) return null;
      return result.assets[0]?.uri ?? null;
    } catch (err) {
      console.error('Image picker error:', err);
      return null;
    }
  }, []);

  const toggleFacing = useCallback(() => {
    setFacing((prev) => (prev === 'front' ? 'back' : 'front'));
  }, []);

  return {
    permission,
    requestPermission,
    takeSelfie,
    launchCamera,
    pickImage,
    cameraRef,
    facing,
    toggleFacing,
    isCapturing,
  };
}
