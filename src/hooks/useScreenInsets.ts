import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * Insets aman untuk header & konten layar (edge-to-edge Android SDK 54 / RN 0.81).
 *
 * top    : tinggi status bar (status bar bagian atas)
 * bottom : tinggi gesture/navigation bar (bagian bawah)
 *
 * headerPaddingTop      : padding header siap pakai = inset atas + jarak visual standar (12)
 * contentPaddingBottom  : padding bawah konten agar tidak ketutup gesture bar (inset bawah + 16)
 *
 * Hook ini reusable; layar boleh memakai hook ini ATAU langsung memakai
 * `useSafeAreaInsets()` lalu `insets.top + 12` / `insets.bottom + 16`
 * (pola yang dipakai di seluruh layar pada Tahap 12).
 */
export function useScreenInsets() {
  const insets = useSafeAreaInsets();
  return {
    top: insets.top,
    bottom: insets.bottom,
    // padding header siap pakai = inset atas + jarak visual standar
    headerPaddingTop: insets.top + 12,
    // padding bawah konten agar tidak ketutup gesture bar
    contentPaddingBottom: insets.bottom + 16,
  };
}
